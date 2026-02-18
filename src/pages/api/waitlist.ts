import type { APIContext, APIRoute } from 'astro';

interface Env {
  DB: D1Database;
  TURNSTILE_SECRET_KEY?: string;
}

type WaitlistRequestBody = {
  email?: unknown;
  'cf-turnstile-response'?: unknown;
};

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};

type WaitlistColumnInfo = {
  name: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

type WaitlistInsertResult =
  | { kind: 'inserted' }
  | { kind: 'duplicate' }
  | { kind: 'schema_error'; message: string };

// Cloudflare's always-passes test secret (for local dev / missing secret)
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';
const WAITLIST_TABLE = 'waitlist';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const TIMESTAMP_COLUMNS = ['subscribed_at', 'created_at', 'joined_at'] as const;

const toTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const jsonResponse = (body: Record<string, unknown>, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const parseTurnstileResponse = (value: unknown): TurnstileVerifyResponse => {
  if (!value || typeof value !== 'object') {
    return { success: false, 'error-codes': ['invalid_turnstile_response'] };
  }

  const parsed = value as { success?: unknown; 'error-codes'?: unknown };
  return {
    success: parsed.success === true,
    'error-codes': Array.isArray(parsed['error-codes'])
      ? parsed['error-codes'].filter((code): code is string => typeof code === 'string')
      : undefined,
  };
};

const fetchWaitlistColumns = async (db: D1Database): Promise<WaitlistColumnInfo[]> => {
  const result = await db.prepare(`PRAGMA table_info(${WAITLIST_TABLE})`).all<WaitlistColumnInfo>();
  return result.results ?? [];
};

const createWaitlistInsertQuery = (columns: WaitlistColumnInfo[]): string | null => {
  if (columns.length === 0) {
    return null;
  }

  const normalized = columns.map((column) => ({
    ...column,
    name: column.name.toLowerCase(),
  }));

  const hasEmail = normalized.some((column) => column.name === 'email');
  if (!hasEmail) {
    return null;
  }

  const timestampColumn = TIMESTAMP_COLUMNS.find((columnName) =>
    normalized.some((column) => column.name === columnName)
  );

  const unsupportedRequiredColumns = normalized
    .filter((column) => {
      if (column.pk === 1 || column.name === 'email') {
        return false;
      }

      if (timestampColumn && column.name === timestampColumn) {
        return false;
      }

      return column.notnull === 1 && column.dflt_value === null;
    })
    .map((column) => column.name);

  if (unsupportedRequiredColumns.length > 0) {
    return null;
  }

  if (timestampColumn) {
    return `INSERT INTO ${WAITLIST_TABLE} (email, ${timestampColumn}) VALUES (?, datetime("now"))`;
  }

  return `INSERT INTO ${WAITLIST_TABLE} (email) VALUES (?)`;
};

const insertWaitlistEmail = async (db: D1Database, normalizedEmail: string): Promise<WaitlistInsertResult> => {
  const columns = await fetchWaitlistColumns(db);
  const insertQuery = createWaitlistInsertQuery(columns);

  if (!insertQuery) {
    return {
      kind: 'schema_error',
      message:
        'Waitlist schema mismatch. Ensure table has an email column and a supported timestamp column (subscribed_at, created_at, or joined_at).',
    };
  }

  try {
    await db.prepare(insertQuery).bind(normalizedEmail).run();
    return { kind: 'inserted' };
  } catch (dbErr: unknown) {
    if (!(dbErr instanceof Error)) {
      throw dbErr;
    }

    if (/UNIQUE constraint failed/i.test(dbErr.message)) {
      return { kind: 'duplicate' };
    }

    if (/no such table/i.test(dbErr.message)) {
      return {
        kind: 'schema_error',
        message: 'Waitlist table is missing. Run database schema migration before accepting signups.',
      };
    }

    if (/no such column|NOT NULL constraint failed/i.test(dbErr.message)) {
      return {
        kind: 'schema_error',
        message:
          'Waitlist schema is out of date. Run the latest schema migration so inserts can succeed.',
      };
    }

    throw dbErr;
  }
};

export const POST: APIRoute = async (context: APIContext) => {
  const { request, locals } = context;

  // Astro's @astrojs/cloudflare adapter exposes bindings via locals.runtime.env
  const runtime = (locals as { runtime?: { env?: Env } }).runtime;
  const env = runtime?.env;

  try {
    let body: WaitlistRequestBody;
    try {
      body = (await request.json()) as WaitlistRequestBody;
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const email = toTrimmedString(body.email);
    const captchaToken = toTrimmedString(body['cf-turnstile-response']);

    if (!email || !email.includes('@')) {
      return jsonResponse({ error: 'Valid email is required' }, 400);
    }

    if (!captchaToken) {
      return jsonResponse({ error: 'Missing CAPTCHA token' }, 400);
    }

    // Verify Turnstile token
    const secret = env?.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_SECRET;
    const verifyPayload = new URLSearchParams({ secret, response: captchaToken });
    const clientIp = request.headers.get('CF-Connecting-IP');
    if (clientIp) verifyPayload.set('remoteip', clientIp);

    let verifyData: TurnstileVerifyResponse;

    try {
      const verifyRes = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        { method: 'POST', body: verifyPayload }
      );

      if (!verifyRes.ok) {
        return jsonResponse({ error: 'CAPTCHA verification service unavailable' }, 503);
      }

      verifyData = parseTurnstileResponse(await verifyRes.json());
    } catch {
      return jsonResponse({ error: 'CAPTCHA verification service unavailable' }, 503);
    }

    if (!verifyData.success) {
      return jsonResponse(
        { error: 'CAPTCHA verification failed', codes: verifyData['error-codes'] },
        400
      );
    }

    // Write to D1
    const db = env?.DB;
    if (!db) {
      console.error('D1 binding (DB) not configured — email not saved:', email);
      return jsonResponse({ error: 'Database not configured' }, 503);
    }

    const normalizedEmail = email.toLowerCase();
    const insertResult = await insertWaitlistEmail(db, normalizedEmail);

    if (insertResult.kind === 'duplicate') {
      return jsonResponse({ success: true, message: "You're already on the waitlist!" }, 200);
    }

    if (insertResult.kind === 'schema_error') {
      console.error('Waitlist schema error:', insertResult.message);
      return jsonResponse({ error: insertResult.message }, 503);
    }

    return jsonResponse({ success: true, message: 'Successfully joined waitlist!' }, 200);
  } catch (error) {
    console.error('Waitlist API error:', error);
    return jsonResponse({ error: 'Waitlist service error. Please try again shortly.' }, 500);
  }
};

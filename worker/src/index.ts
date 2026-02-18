interface Env {
  DB: D1Database;
  TURNSTILE_SECRET_KEY?: string;
}

type WaitlistRequestBody = {
  email?: unknown;
  'cf-turnstile-response'?: unknown;
};

type TurnstileVerificationResponse = {
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

const TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const WAITLIST_TABLE = 'waitlist';
const TIMESTAMP_COLUMNS = ['subscribed_at', 'created_at', 'joined_at'] as const;

const toTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const parseTurnstileVerification = (value: unknown): TurnstileVerificationResponse => {
  if (!value || typeof value !== 'object') {
    return { success: false };
  }

  const parsed = value as {
    success?: unknown;
    'error-codes'?: unknown;
  };

  return {
    success: parsed.success === true,
    'error-codes': Array.isArray(parsed['error-codes'])
      ? parsed['error-codes'].filter((code): code is string => typeof code === 'string')
      : undefined,
  };
};

const jsonResponse = (
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>
): Response => new Response(JSON.stringify(body), { status, headers });

const fetchWaitlistColumns = async (db: D1Database): Promise<WaitlistColumnInfo[]> => {
  const result = await db.prepare(`PRAGMA table_info(${WAITLIST_TABLE})`).all<WaitlistColumnInfo>();
  return result.results ?? [];
};

const resolveTimestampColumn = (columns: WaitlistColumnInfo[]): string | null => {
  const normalizedNames = new Set(columns.map((column) => column.name.toLowerCase()));
  return TIMESTAMP_COLUMNS.find((columnName) => normalizedNames.has(columnName)) ?? null;
};

const createInsertQuery = (columns: WaitlistColumnInfo[]): string | null => {
  if (columns.length === 0) {
    return null;
  }

  const normalizedColumns = columns.map((column) => ({
    ...column,
    name: column.name.toLowerCase(),
  }));

  const hasEmail = normalizedColumns.some((column) => column.name === 'email');
  if (!hasEmail) {
    return null;
  }

  const timestampColumn = resolveTimestampColumn(normalizedColumns);

  const unsupportedRequiredColumns = normalizedColumns
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

const insertWaitlistEmail = async (db: D1Database, email: string): Promise<WaitlistInsertResult> => {
  const columns = await fetchWaitlistColumns(db);
  const insertQuery = createInsertQuery(columns);

  if (!insertQuery) {
    return {
      kind: 'schema_error',
      message:
        'Waitlist schema mismatch. Ensure table has an email column and a supported timestamp column (subscribed_at, created_at, or joined_at).',
    };
  }

  try {
    await db.prepare(insertQuery).bind(email).run();
    return { kind: 'inserted' };
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw error;
    }

    if (/UNIQUE constraint failed/i.test(error.message)) {
      return { kind: 'duplicate' };
    }

    if (/no such table/i.test(error.message)) {
      return {
        kind: 'schema_error',
        message: 'Waitlist table is missing. Run database schema migration before accepting signups.',
      };
    }

    if (/no such column|NOT NULL constraint failed/i.test(error.message)) {
      return {
        kind: 'schema_error',
        message:
          'Waitlist schema is out of date. Run the latest schema migration so inserts can succeed.',
      };
    }

    throw error;
  }
};

const verifyTurnstileToken = async (
  secret: string,
  token: string,
  remoteIp: string | null,
): Promise<TurnstileVerificationResponse> => {
  const payload = new URLSearchParams({
    secret,
    response: token,
  });

  if (remoteIp) {
    payload.set('remoteip', remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload.toString(),
  });

  if (!response.ok) {
    return { success: false };
  }

  const result = await response.json();
  return parseTurnstileVerification(result);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Subscribe to waitlist
    if (url.pathname === '/api/subscribe' && request.method === 'POST') {
      try {
        let body: WaitlistRequestBody;
        try {
          body = (await request.json()) as WaitlistRequestBody;
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders);
        }

        const email = toTrimmedString(body.email);
        const captchaToken = toTrimmedString(body['cf-turnstile-response']);

        if (!email || !email.includes('@')) {
          return jsonResponse({ error: 'Valid email is required' }, 400, corsHeaders);
        }

        if (!captchaToken) {
          return jsonResponse({ error: 'Missing CAPTCHA token' }, 400, corsHeaders);
        }

        const turnstileSecret = env.TURNSTILE_SECRET_KEY || TURNSTILE_TEST_SECRET_KEY;
        const verification = await verifyTurnstileToken(
          turnstileSecret,
          captchaToken,
          request.headers.get('CF-Connecting-IP'),
        );

        if (!verification.success) {
          console.warn('Turnstile verification failed', verification['error-codes'] ?? []);
          return jsonResponse(
            { error: 'CAPTCHA verification failed', codes: verification['error-codes'] },
            400,
            corsHeaders
          );
        }

        const insertResult = await insertWaitlistEmail(env.DB, email.toLowerCase());

        if (insertResult.kind === 'duplicate') {
          return jsonResponse({ success: true, message: 'Email already on waitlist' }, 200, corsHeaders);
        }

        if (insertResult.kind === 'schema_error') {
          console.error('Waitlist schema error:', insertResult.message);
          return jsonResponse({ error: insertResult.message }, 503, corsHeaders);
        }

        return jsonResponse({ success: true, message: 'Successfully joined waitlist!' }, 200, corsHeaders);
      } catch (error: unknown) {
        console.error('Error subscribing:', error);
        return jsonResponse(
          { error: 'Waitlist service error. Please try again shortly.' },
          500,
          corsHeaders
        );
      }
    }

    // List waitlist (admin only - add auth later)
    if (url.pathname === '/api/list' && request.method === 'GET') {
      try {
        const columns = await fetchWaitlistColumns(env.DB);
        const timestampColumn = resolveTimestampColumn(columns);

        const listQuery = timestampColumn
          ? `SELECT email, ${timestampColumn} as subscribed_at FROM waitlist ORDER BY ${timestampColumn} DESC`
          : 'SELECT email FROM waitlist ORDER BY email ASC';

        const { results } = await env.DB.prepare(listQuery).all();

        return jsonResponse({ count: results.length, subscribers: results }, 200, corsHeaders);
      } catch (error: unknown) {
        console.error('Error listing:', error);
        return jsonResponse({ error: 'Failed to fetch waitlist' }, 500, corsHeaders);
      }
    }

    return new Response('Not found', { status: 404 });
  },
};

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

// Cloudflare's always-passes test secret (for local dev / missing secret)
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';

const toTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export const POST: APIRoute = async (context: APIContext) => {
  const { request, locals } = context;

  // Astro's @astrojs/cloudflare adapter exposes bindings via locals.runtime.env
  const runtime = (locals as { runtime?: { env?: Env } }).runtime;
  const env = runtime?.env;

  try {
    const body = (await request.json()) as WaitlistRequestBody;
    const email = toTrimmedString(body.email);
    const captchaToken = toTrimmedString(body['cf-turnstile-response']);

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!captchaToken) {
      return new Response(
        JSON.stringify({ error: 'Missing CAPTCHA token' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify Turnstile token
    const secret = env?.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_SECRET;
    const verifyPayload = new URLSearchParams({ secret, response: captchaToken });
    const clientIp = request.headers.get('CF-Connecting-IP');
    if (clientIp) verifyPayload.set('remoteip', clientIp);

    const verifyRes = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: verifyPayload }
    );
    const verifyData = (await verifyRes.json()) as TurnstileVerifyResponse;

    if (!verifyData.success) {
      return new Response(
        JSON.stringify({ error: 'CAPTCHA verification failed', codes: verifyData['error-codes'] }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Write to D1
    const db = env?.DB;
    if (!db) {
      console.error('D1 binding (DB) not configured — email not saved:', email);
      return new Response(
        JSON.stringify({ error: 'Database not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      await db
        .prepare('INSERT INTO waitlist (email, subscribed_at) VALUES (?, datetime("now"))')
        .bind(email.toLowerCase())
        .run();
    } catch (dbErr: unknown) {
      if (dbErr instanceof Error && dbErr.message.includes('UNIQUE')) {
        return new Response(
          JSON.stringify({ success: true, message: "You're already on the waitlist!" }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (dbErr instanceof Error && dbErr.message.includes('no such table')) {
        console.error('D1 table "waitlist" does not exist — run schema migration');
        return new Response(
          JSON.stringify({ error: 'Database schema not initialized' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw dbErr;
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Successfully joined waitlist!' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Waitlist API error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

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

const TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

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
        const body = (await request.json()) as WaitlistRequestBody;
        const email = toTrimmedString(body.email);
        const captchaToken = toTrimmedString(body['cf-turnstile-response']);

        if (!email || !email.includes('@')) {
          return new Response(
            JSON.stringify({ error: 'Valid email is required' }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (!captchaToken) {
          return new Response(
            JSON.stringify({ error: 'Missing CAPTCHA token' }),
            { status: 400, headers: corsHeaders }
          );
        }

        const turnstileSecret = env.TURNSTILE_SECRET_KEY || TURNSTILE_TEST_SECRET_KEY;
        const verification = await verifyTurnstileToken(
          turnstileSecret,
          captchaToken,
          request.headers.get('CF-Connecting-IP'),
        );

        if (!verification.success) {
          console.warn('Turnstile verification failed', verification['error-codes'] ?? []);
          return new Response(
            JSON.stringify({ error: 'CAPTCHA verification failed' }),
            { status: 400, headers: corsHeaders }
          );
        }

        // Check if email already exists
        const existing = await env.DB.prepare(
          'SELECT email FROM waitlist WHERE email = ?'
        ).bind(email.toLowerCase()).first();

        if (existing) {
          return new Response(
            JSON.stringify({ message: 'Email already on waitlist' }),
            { status: 200, headers: corsHeaders }
          );
        }

        // Insert new email
        await env.DB.prepare(
          'INSERT INTO waitlist (email, subscribed_at) VALUES (?, datetime("now"))'
        ).bind(email.toLowerCase()).run();

        return new Response(
          JSON.stringify({ success: true, message: 'Successfully joined waitlist!' }),
          { status: 200, headers: corsHeaders }
        );
      } catch (error: unknown) {
        console.error('Error subscribing:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to subscribe' }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // List waitlist (admin only - add auth later)
    if (url.pathname === '/api/list' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare(
          'SELECT email, subscribed_at FROM waitlist ORDER BY subscribed_at DESC'
        ).all();

        return new Response(
          JSON.stringify({ count: results.length, subscribers: results }),
          { status: 200, headers: corsHeaders }
        );
      } catch (error: unknown) {
        console.error('Error listing:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch waitlist' }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return new Response('Not found', { status: 404 });
  },
};

import type { APIRoute } from 'astro';

type WaitlistRequestBody = {
  email?: unknown;
  'cf-turnstile-response'?: unknown;
};

type WaitlistErrorResponse = {
  error?: string;
  message?: string;
};

const toTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const POST: APIRoute = async ({ request }) => {
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

    // Forward to Cloudflare Worker backend
    const workerUrl = import.meta.env.WAITLIST_API_URL || 'https://waitlist.getspeke.com/api/subscribe';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const clientIp = request.headers.get('CF-Connecting-IP');

    if (clientIp) {
      headers['CF-Connecting-IP'] = clientIp;
    }

    const response = await fetch(workerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        'cf-turnstile-response': captchaToken,
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as WaitlistErrorResponse | null;
      return new Response(
        JSON.stringify({ error: error?.error || error?.message || 'Failed to subscribe' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
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

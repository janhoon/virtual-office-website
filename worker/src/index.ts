interface Env {
  DB: D1Database;
}

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
        const { email } = await request.json() as { email: string };

        if (!email || !email.includes('@')) {
          return new Response(
            JSON.stringify({ error: 'Valid email is required' }),
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
      } catch (error: any) {
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
      } catch (error: any) {
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

# Speke Landing Page

Landing page for Speke with waitlist functionality.

## Project Structure

```
/
├── src/
│   ├── components/      # Astro components
│   ├── layouts/         # Page layouts
│   ├── pages/           # Routes and API endpoints
│   │   ├── index.astro  # Landing page
│   │   └── api/
│   │       └── waitlist.ts  # Waitlist API proxy
│   └── styles/          # Global styles
├── worker/              # Cloudflare Worker for waitlist backend
│   ├── src/
│   │   └── index.ts     # Worker code
│   ├── schema.sql       # D1 database schema
│   └── wrangler.toml    # Worker configuration
└── wrangler.toml        # Pages configuration
```

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

## Deployment

### 1. Deploy Waitlist Worker

```bash
cd worker

# Create D1 database
export CLOUDFLARE_API_TOKEN="your-token"
wrangler d1 create virtual-office-waitlist

# Update wrangler.toml with the database_id from output

# Initialize database
wrangler d1 execute virtual-office-waitlist --file=schema.sql

# Deploy worker
wrangler deploy
```

### 2. Deploy Website

```bash
# Build the site
npm run build

# Deploy to Cloudflare Pages
wrangler pages deploy dist --project-name=virtual-office-website

# Add custom domain in Cloudflare dashboard
# Set WAITLIST_API_URL environment variable to your worker URL
```

`wrangler.toml` includes the Pages Functions D1 binding (`DB`) for `speke-waitlist`. Keep this binding in sync with the active D1 database ID so `/api/waitlist` can write in production.

## Environment Variables

- `WAITLIST_API_URL`: URL of the waitlist worker (e.g., `https://waitlist.getspeke.com/api/subscribe`)
- `PUBLIC_POSTHOG_API_KEY`: PostHog project API key for website analytics
- `PUBLIC_POSTHOG_HOST`: PostHog host URL (use `https://eu.i.posthog.com`)
- `PUBLIC_TURNSTILE_SITE_KEY`: Cloudflare Turnstile site key (`1x00000000000000000000AA` test key for local dev)
- `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile secret key for the worker (`1x0000000000000000000000000000000AA` test key for local dev)

Copy `.env.example` to `.env` for local setup.

For production, do not commit real Turnstile keys. Add `PUBLIC_TURNSTILE_SITE_KEY` in Cloudflare Pages environment variables and set `TURNSTILE_SECRET_KEY` as a worker secret in Cloudflare.

## Turnstile Deployment Checklist

1. Create a Turnstile site in Cloudflare Dashboard for `getspeke.com`, then copy the Site Key and Secret Key.
2. Add `PUBLIC_TURNSTILE_SITE_KEY` to Cloudflare Pages env vars for project `virtual-office-website`.
3. Add `TURNSTILE_SECRET_KEY` as a worker secret (`cd worker && wrangler secret put TURNSTILE_SECRET_KEY`).
4. Rebuild and redeploy Pages with the real site key (`PUBLIC_TURNSTILE_SITE_KEY=<real-key> npm run build && wrangler pages deploy dist --project-name virtual-office-website --branch=master`).
5. Redeploy the worker (`cd worker && wrangler deploy`).

## Features

- ✅ Hero section with CTA
- ✅ Features showcase
- ✅ Waitlist signup form
- ✅ Cloudflare Worker backend with D1 database
- ✅ CORS support
- ✅ Duplicate email prevention
- ✅ Cloudflare Turnstile CAPTCHA on waitlist form
- ✅ Responsive design
- ✅ SEO optimized
# PostHog analytics enabled

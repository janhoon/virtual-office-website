# Deployment Guide

## Prerequisites

- Cloudflare account
- Cloudflare API token with Workers and Pages permissions
- Node.js and npm installed

## Step 1: Deploy the Waitlist Worker

```bash
cd worker

# Set your Cloudflare API token
export CLOUDFLARE_API_TOKEN="your-api-token-here"

# Create D1 database
wrangler d1 create speke-waitlist
```

This will output something like:
```
✅ Successfully created DB 'speke-waitlist' in region WEUR
Created your database using D1's new storage backend. The new storage backend is not yet recommended for production workloads, but backs up your data via point-in-time restore.

[[d1_databases]]
binding = "DB"
database_name = "speke-waitlist"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy the `database_id` and update `worker/wrangler.toml`**

```bash
# Initialize the database with schema
wrangler d1 execute speke-waitlist --file=schema.sql

# Deploy the worker
wrangler deploy
```

Note the worker URL from the output (e.g., `https://speke-waitlist.your-subdomain.workers.dev`)

## Step 2: Deploy the Website

```bash
# Go back to project root
cd ..

# Build the site
npm run build

# Deploy to Cloudflare Pages
export CLOUDFLARE_API_TOKEN="your-api-token-here"
wrangler pages deploy dist --project-name=speke-website
```

Before deploy, verify root `wrangler.toml` has the `[[d1_databases]]` binding named `DB` pointing at the `speke-waitlist` database ID. This binding is required for Pages Functions (`/api/waitlist`) to access D1.

## Step 3: Configure Custom Domain

1. Go to Cloudflare Dashboard → Pages → speke-website
2. Go to Custom domains → Add custom domain
3. Add your domain (e.g., `getspeke.com`, `www.getspeke.com`)
4. Cloudflare will automatically configure DNS

## Step 4: Set Environment Variables

In Cloudflare Dashboard → Pages → speke-website → Settings → Environment variables:

Add:
- **Name**: `WAITLIST_API_URL`
- **Value**: `https://speke-waitlist.your-subdomain.workers.dev/api/subscribe`
- **Name**: `PUBLIC_POSTHOG_API_KEY`
- **Value**: `phc_SufADq1sXKA8eN4wSAMaAmIPwWVP3GR9mcPaE8xcJLW`
- **Name**: `PUBLIC_POSTHOG_HOST`
- **Value**: `https://eu.i.posthog.com`
- **Name**: `PUBLIC_TURNSTILE_SITE_KEY`
- **Value**: `your-turnstile-site-key`

Set the worker secret separately:

```bash
cd worker
wrangler secret put TURNSTILE_SECRET_KEY
```

Use Turnstile test keys only for local development. Add production keys in Cloudflare dashboard/secrets.

Or use your custom domain if you set one up for the worker.

## Step 5: Test

Visit your site and test the waitlist form. You can check the worker logs:

```bash
cd worker
wrangler tail
```

## Admin: View Waitlist

To view all subscribers:

```bash
curl https://your-worker-url.workers.dev/api/list
```

**Note**: Add authentication to this endpoint for production use!

## Database Queries

```bash
# View all subscribers
wrangler d1 execute speke-waitlist --command="SELECT * FROM waitlist ORDER BY subscribed_at DESC"

# Count subscribers
wrangler d1 execute speke-waitlist --command="SELECT COUNT(*) as total FROM waitlist"

# Export to CSV
wrangler d1 execute speke-waitlist --command="SELECT email, subscribed_at FROM waitlist" --json > waitlist.json
```

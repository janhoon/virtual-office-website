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
wrangler d1 create virtual-office-waitlist
```

This will output something like:
```
✅ Successfully created DB 'virtual-office-waitlist' in region WEUR
Created your database using D1's new storage backend. The new storage backend is not yet recommended for production workloads, but backs up your data via point-in-time restore.

[[d1_databases]]
binding = "DB"
database_name = "virtual-office-waitlist"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy the `database_id` and update `worker/wrangler.toml`**

```bash
# Initialize the database with schema
wrangler d1 execute virtual-office-waitlist --file=schema.sql

# Deploy the worker
wrangler deploy
```

Note the worker URL from the output (e.g., `https://virtual-office-waitlist.your-subdomain.workers.dev`)

## Step 2: Deploy the Website

```bash
# Go back to project root
cd ..

# Build the site
npm run build

# Deploy to Cloudflare Pages
export CLOUDFLARE_API_TOKEN="your-api-token-here"
wrangler pages deploy dist --project-name=virtual-office-website
```

## Step 3: Configure Custom Domain

1. Go to Cloudflare Dashboard → Pages → virtual-office-website
2. Go to Custom domains → Add custom domain
3. Add your domain (e.g., `virtualoffice.io`, `www.virtualoffice.io`)
4. Cloudflare will automatically configure DNS

## Step 4: Set Environment Variables

In Cloudflare Dashboard → Pages → virtual-office-website → Settings → Environment variables:

Add:
- **Name**: `WAITLIST_API_URL`
- **Value**: `https://virtual-office-waitlist.your-subdomain.workers.dev/api/subscribe`

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
wrangler d1 execute virtual-office-waitlist --command="SELECT * FROM waitlist ORDER BY subscribed_at DESC"

# Count subscribers
wrangler d1 execute virtual-office-waitlist --command="SELECT COUNT(*) as total FROM waitlist"

# Export to CSV
wrangler d1 execute virtual-office-waitlist --command="SELECT email, subscribed_at FROM waitlist" --json > waitlist.json
```

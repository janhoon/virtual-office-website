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

## Environment Variables

- `WAITLIST_API_URL`: URL of the waitlist worker (e.g., `https://waitlist.getspeke.com/api/subscribe`)

## Features

- ✅ Hero section with CTA
- ✅ Features showcase
- ✅ Waitlist signup form
- ✅ Cloudflare Worker backend with D1 database
- ✅ CORS support
- ✅ Duplicate email prevention
- ✅ Responsive design
- ✅ SEO optimized

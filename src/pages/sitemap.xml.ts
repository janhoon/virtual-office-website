import type { APIRoute } from 'astro';

const baseUrl = 'https://virtual-office-dev.janhoon.com';
const pages = ['/'];

export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString();

  const urls = pages
    .map(
      (page) =>
        `<url><loc>${baseUrl}${page}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>${page === '/' ? '1.0' : '0.7'}</priority></url>`
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};

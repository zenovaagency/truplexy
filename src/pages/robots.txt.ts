import type { APIRoute } from 'astro';
import { SITE } from '../data/site';

/**
 * robots.txt, built from SITE.url so the sitemap line always names the real
 * domain. The dashboard (app. host) serves its own from dashboard/public.
 */
export const GET: APIRoute = () => {
  const body = ['User-agent: *', 'Allow: /', 'Disallow: /404', '', `Sitemap: ${new URL('/sitemap-index.xml', SITE.url).href}`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

import type { APIRoute } from 'astro';
import { SITE } from '../data/site';

/**
 * robots.txt, built from SITE.url so the sitemap line always names the real
 * domain. Every public page is crawlable (Googlebot, Bingbot, OAI-SearchBot
 * and the rest fall under `*`); only the 404 page is off limits. Pages that
 * must stay out of search get `noindex` in Base.astro instead, since a
 * robots.txt block cannot keep a URL out of the index. The dashboard (app.
 * host) serves its own from dashboard/public.
 */
export const GET: APIRoute = () => {
  const body = ['User-agent: *', 'Allow: /', 'Disallow: /404', '', `Sitemap: ${new URL('/sitemap.xml', SITE.url).href}`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

import type { APIRoute } from 'astro';
import { SEARCH_CRAWLERS, TRAINING_CRAWLERS } from '../data/crawlers';
import { SITE } from '../data/site';

/**
 * robots.txt, built from SITE.url so the sitemap line always names the real
 * domain, and from the crawler lists in src/data/crawlers.ts. The dashboard
 * (app. host) serves its own from dashboard/public.
 *
 * A crawler obeys only its own group, so every group repeats the one real
 * restriction (the 404 page). robots.txt is not access control and cannot keep
 * a URL out of the index: private pages are protected by sign-in, and pages
 * that must not be indexed use `noindex` (Base.astro).
 */
const group = (agents: string[], rules: string[]) => [...agents.map((a) => `User-agent: ${a}`), ...rules, ''];

export const GET: APIRoute = () => {
  const body = [
    '# Search and answer engines: welcome.',
    ...group(SEARCH_CRAWLERS, ['Allow: /', 'Disallow: /404']),
    '# Model-training crawlers: not allowed.',
    ...group(TRAINING_CRAWLERS, ['Disallow: /']),
    '# Everything else.',
    ...group(['*'], ['Allow: /', 'Disallow: /404']),
    `Sitemap: ${new URL('/sitemap.xml', SITE.url).href}`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

// @ts-check
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

import { SITE } from './src/data/site.ts';

/**
 * The files whose content each page renders, so its sitemap `lastmod` moves
 * only when the page itself changes. Routes not listed fall back to their
 * page file under src/pages.
 * @type {Record<string, string[]>}
 */
const PAGE_SOURCES = {
  '/': ['src/pages/index.astro', 'src/components/home', 'src/data'],
  '/pricing': ['src/pages/pricing.astro', 'src/components/pricing', 'src/data/pricing.ts', 'src/data/site.ts'],
  '/docs/web-sdk': ['src/pages/docs/web-sdk.astro', 'src/components/docs', 'src/layouts/Docs.astro', 'src/styles/docs.css', 'dashboard/src/features/integrations/snippets/web-sdk.ts'],
  '/docs': ['src/pages/docs/index.astro', 'src/data/setup-guides.ts'],
  '/channels': ['src/pages/channels/index.astro', 'src/data/channel-pages.ts', 'src/data/channels.ts'],
  '/changelog': ['src/pages/changelog.astro', 'src/data/changelog.ts'],
};

/**
 * Sources shared by every page under a prefix (the per-channel routes), for
 * routes not listed above.
 * @type {Record<string, string[]>}
 */
const PREFIX_SOURCES = {
  '/channels/': [
    'src/pages/channels/[id].astro',
    'src/components/channels',
    'src/layouts/Docs.astro',
    'src/styles/docs.css',
    'src/data/channel-pages.ts',
    'src/data/channels.ts',
    'src/data/pricing.ts',
  ],
  '/docs/': [
    'src/pages/docs/[id].astro',
    'src/layouts/Docs.astro',
    'src/styles/docs.css',
    'src/components/docs',
    'src/data/setup-guides.ts',
    'src/data/channels.ts',
    'src/data/snippets.ts',
    'dashboard/src/features/integrations/snippets',
  ],
};

/** @param {string[]} args */
function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// In a shallow clone (CI, Vercel) every file's last commit is the checkout
// itself, which would claim every page changed on every deploy. A wrong
// lastmod is worse than none, so it is left out there.
const gitHistory = git('rev-parse', '--is-shallow-repository') === 'false';

/**
 * ISO date of the last commit touching `route`'s sources, or undefined.
 * @param {string} route
 */
function lastModified(route) {
  if (!gitHistory) return undefined;
  const prefix = Object.keys(PREFIX_SOURCES).find((p) => route.startsWith(p));
  const sources = PAGE_SOURCES[route] ?? (prefix && PREFIX_SOURCES[prefix]) ?? [`src/pages${route === '/' ? '/index' : route}.astro`];
  return git('log', '-1', '--format=%cI', '--', ...sources) || undefined;
}

// `site` feeds canonical URLs, OG URLs, robots.txt and the sitemap. It comes
// from SITE.url in src/data/site.ts — the one place the domain is set.
export default defineConfig({
  site: SITE.url,

  // One URL per page: /pricing, never /pricing/. Internal links already use
  // this form; vercel.json redirects the slash variant.
  trailingSlash: 'never',
  build: { format: 'directory' },

  integrations: [
    react(),
    sitemap({
      filter: (page) => !/\/404\/?$/.test(new URL(page).pathname),
      serialize(item) {
        const route = new URL(item.url).pathname.replace(/\/$/, '') || '/';
        // Google ignores changefreq and priority; lastmod is the signal it uses.
        return { url: item.url, lastmod: lastModified(route) };
      },
    }),
  ],

  devToolbar: { enabled: false },

  vite: {
    plugins: [tailwindcss()],
  },
});

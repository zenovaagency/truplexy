// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// `site` feeds canonical URLs, OG URLs and the sitemap. It mirrors SITE.url
// in src/data/site.ts — change both together when the domain is confirmed.
export default defineConfig({
  site: 'https://truplexy.com',

  integrations: [react(), sitemap()],

  devToolbar: { enabled: false },

  vite: {
    plugins: [tailwindcss()],
  },
});

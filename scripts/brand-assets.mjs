/**
 * Brand asset pipeline. Run with `npm run brand`.
 *
 * Renders the fixed-size files that must live in /public (favicons, the touch
 * icon, the manifest icons and the manifest itself) from the Soft Triplex SVG
 * sources in /logo/soft-triplex. Those sources, and src/assets/brand/brand-paths.ts
 * (the inline logo), come from the brand kit generator:
 * brand/soft-logo-concepts/source/build-kit.mjs.
 *
 * src/assets/brand/wordmark-*.png are no longer written here; the SDK's
 * "powered by" line (sdk/scripts/brand-assets.mjs) still reads them.
 *
 * Re-run it whenever a file in /logo/soft-triplex changes. The outputs are
 * committed, so the build itself never depends on this script.
 */
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => path.join(root, 'logo', 'soft-triplex', f);
const pub = (f) => path.join(root, 'public', f);

/** Renders an SVG source to a square PNG of `size` px. */
async function png(file, size) {
  const svg = await readFile(src(file));
  const viewW = +String(svg).match(/viewBox="[^"]*?([\d.]+) [\d.]+"/)[1];
  return sharp(svg, { density: (72 * size) / viewW }).resize(size, size).png().toBuffer();
}

// Favicons: a black rounded tile, so the mark reads on light and dark tab bars.
// favicon.svg is the vector one; it switches black/white with the system theme.
const fav = {};
for (const size of [16, 32, 48]) fav[size] = await png('favicon-tile.svg', size);
await writeFile(pub('favicon-16.png'), fav[16]);
await writeFile(pub('favicon-32.png'), fav[32]);
await copyFile(src('favicon.svg'), pub('favicon.svg'));

/**
 * Packs PNG buffers into a .ico. Browsers and crawlers request /favicon.ico
 * regardless of the <link> tags, so it has to exist. Modern ICO readers accept
 * PNG-compressed entries, which avoids a BMP encoder.
 */
function ico(entries) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dir = entries.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0); // width
    e.writeUInt8(size, 1); // height
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...entries.map((e) => e.png)]);
}
await writeFile(pub('favicon.ico'), ico([16, 32, 48].map((size) => ({ size, png: fav[size] }))));

// Home-screen icons are full-bleed squares: iOS and Android round them.
await writeFile(pub('apple-touch-icon.png'), await png('app-square.svg', 180));
await writeFile(pub('icon-192.png'), await png('app-square.svg', 192));
await writeFile(pub('icon-512.png'), await png('app-square.svg', 512));
await writeFile(pub('icon-maskable-512.png'), await png('app-maskable.svg', 512));

// The OG card (public/og-card.png) is rendered from scripts/og-card.html: `npm run og`.

// Manifest -----------------------------------------------------------------
await writeFile(
  pub('site.webmanifest'),
  JSON.stringify(
    {
      id: '/',
      name: 'Truplexy',
      short_name: 'Truplexy',
      description: 'An AI assistant on every channel your customers use, and one platform for your team to manage every conversation.',
      lang: 'en',
      start_url: '/',
      scope: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      theme_color: '#F6F3EE',
      background_color: '#F6F3EE',
      display: 'standalone',
    },
    null,
    2,
  ) + '\n',
);

console.log('Brand assets written to public/.');

/**
 * One-off brand asset pipeline. Run with `npm run brand`.
 *
 * The supplied logo PNGs in /logo are transparent but carry generous
 * padding, which makes them sit low and small in the nav. This trims them,
 * writes the trimmed masters into src/assets/brand (astro:assets resizes and
 * re-encodes them per use), and renders the fixed-size files that must live
 * in /public: favicons, the touch icon, the manifest icons and the OG card.
 *
 * Re-run it whenever a file in /logo changes. The outputs are committed, so
 * the build itself never depends on this script.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => path.join(root, 'logo', f);
const assets = path.join(root, 'src', 'assets', 'brand');
const pub = path.join(root, 'public');

await mkdir(assets, { recursive: true });
await mkdir(pub, { recursive: true });

/** Trims transparent padding. A small threshold eats anti-aliasing haze. */
const trimmed = (file) => sharp(src(file)).trim({ threshold: 8 }).png();

// Masters for astro:assets ------------------------------------------------
await trimmed('logo.png').toFile(path.join(assets, 'mark.png'));
await trimmed('truplexy-dark.png').toFile(path.join(assets, 'wordmark-dark.png'));
await trimmed('truplexy-light.png').toFile(path.join(assets, 'wordmark-light.png'));

const markBuf = await trimmed('logo.png').toBuffer();

/**
 * Square icon with the mark centred on `bg` (or transparent), padded so the
 * triangle's optical centre sits in the middle of the tile.
 */
async function icon(size, { bg = null, pad = 0.14 } = {}) {
  const inner = Math.round(size * (1 - pad * 2));
  const mark = await sharp(markBuf)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png();
}

await (await icon(32, { pad: 0.04 })).toFile(path.join(pub, 'favicon-32.png'));
await (await icon(16, { pad: 0.02 })).toFile(path.join(pub, 'favicon-16.png'));
// iOS ignores transparency and fills it with black, so the touch icon is opaque.
await (await icon(180, { bg: '#ffffff', pad: 0.16 })).toFile(path.join(pub, 'apple-touch-icon.png'));
await (await icon(192, { bg: '#ffffff', pad: 0.16 })).toFile(path.join(pub, 'icon-192.png'));
await (await icon(512, { bg: '#ffffff', pad: 0.16 })).toFile(path.join(pub, 'icon-512.png'));

// OG card -----------------------------------------------------------------
// The wordmark is composited as a bitmap; only the tagline is SVG text, set
// in a system sans so it renders without shipping a font into sharp.
const W = 1200;
const H = 630;
const bgSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="a" cx="12%" cy="8%" r="70%">
      <stop offset="0" stop-color="#cfefff"/>
      <stop offset="1" stop-color="#cfefff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="b" cx="92%" cy="96%" r="70%">
      <stop offset="0" stop-color="#ead9ff"/>
      <stop offset="1" stop-color="#ead9ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="t" x1="0" x2="1">
      <stop offset="0" stop-color="#45D4FF"/>
      <stop offset="0.45" stop-color="#1F7BFF"/>
      <stop offset="1" stop-color="#6A2BFF"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#F7F8FC"/>
  <rect width="100%" height="100%" fill="url(#a)"/>
  <rect width="100%" height="100%" fill="url(#b)"/>
  <path d="M-20 572 C 260 520, 420 616, 640 566 S 1020 512, 1220 548" fill="none" stroke="url(#t)" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
  <text x="600" y="400" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="46" font-weight="600" fill="#0E1222" letter-spacing="-1">One conversation. Everywhere.</text>
  <text x="600" y="452" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="24" fill="#4A5068">Continuous AI customer support across every channel</text>
</svg>`;

const word = await trimmed('truplexy-dark.png').resize({ width: 520 }).toBuffer();
await sharp(Buffer.from(bgSvg))
  .composite([{ input: word, top: 150, left: Math.round((W - 520) / 2) }])
  .png()
  .toFile(path.join(pub, 'og-card.png'));

// Manifest + robots -------------------------------------------------------
await writeFile(
  path.join(pub, 'site.webmanifest'),
  JSON.stringify(
    {
      name: 'Truplexy',
      short_name: 'Truplexy',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      theme_color: '#F7F8FC',
      background_color: '#F7F8FC',
      display: 'standalone',
    },
    null,
    2,
  ) + '\n',
);

console.log('Brand assets written to src/assets/brand and public/.');

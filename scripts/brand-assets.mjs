/**
 * One-off brand asset pipeline. Run with `npm run brand`.
 *
 * The supplied logo PNGs in /logo are transparent but carry generous
 * padding, which makes them sit low and small in the nav. This trims them,
 * writes the trimmed masters into src/assets/brand (astro:assets resizes and
 * re-encodes them per use), and renders the fixed-size files that must live
 * in /public: favicons, the touch icon and the manifest icons.
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

const fav32 = await (await icon(32, { pad: 0.04 })).toBuffer();
const fav16 = await (await icon(16, { pad: 0.02 })).toBuffer();
await writeFile(path.join(pub, 'favicon-32.png'), fav32);
await writeFile(path.join(pub, 'favicon-16.png'), fav16);

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
await writeFile(
  path.join(pub, 'favicon.ico'),
  ico([
    { size: 16, png: fav16 },
    { size: 32, png: fav32 },
  ]),
);
// iOS ignores transparency and fills it with black, so the touch icon is opaque.
await (await icon(180, { bg: '#ffffff', pad: 0.16 })).toFile(path.join(pub, 'apple-touch-icon.png'));
await (await icon(192, { bg: '#ffffff', pad: 0.16 })).toFile(path.join(pub, 'icon-192.png'));
await (await icon(512, { bg: '#ffffff', pad: 0.16 })).toFile(path.join(pub, 'icon-512.png'));

// The OG card (public/og-card.png) is rendered from scripts/og-card.html: `npm run og`.

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

// Renders the WordPress.org listing art into wordpress/assets: the plugin icon (128 and 256 px, plus SVG) and the
// banner (772x250 and 1544x500), from the Soft Triplex logo in logo/soft-triplex. These go in the plugin's SVN
// `assets/` folder on WordPress.org, not in the plugin zip.
//
//   npm run wordpress:assets
//
// Needs `sharp`, which the marketing site already installs (found by walking up to ../node_modules).
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const logo = (name) => fileURLToPath(new URL(`../../logo/soft-triplex/${name}`, import.meta.url));
const out = (name) => fileURLToPath(new URL(`../wordpress/assets/${name}`, import.meta.url));
mkdirSync(out(''), { recursive: true });

// Icon: the white mark on an ink square, as the app icon.
copyFileSync(logo('app-square.svg'), out('icon.svg'));
for (const size of [128, 256]) {
  await sharp(logo('app-square.svg'), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out(`icon-${size}x${size}.png`));
}

// Banner: the black logo on the brand's cream, centred in the upper part so WordPress's plugin title (drawn over the bottom
// left) doesn't cover it.
const CREAM = '#f6f3ee';
for (const [w, h] of [[772, 250], [1544, 500]]) {
  const logoH = Math.round(h * 0.28);
  const mark = await sharp(readFileSync(logo('logo-black.svg')), { density: 1200 }).resize({ height: logoH }).png().toBuffer({ resolveWithObject: true });
  await sharp({ create: { width: w, height: h, channels: 3, background: CREAM } })
    .composite([{ input: mark.data, left: Math.round((w - mark.info.width) / 2), top: Math.round(h * 0.3) }])
    .png({ compressionLevel: 9 })
    .toFile(out(`banner-${w}x${h}.png`));
}
console.log('WordPress.org assets written to wordpress/assets');

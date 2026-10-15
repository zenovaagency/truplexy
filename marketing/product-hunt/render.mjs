/**
 * Renders the Product Hunt gallery images from the HTML files beside this
 * script, with headless Chrome or Edge, at 2× Product Hunt's recommended
 * 1270×760 (so 2540×1520) so they stay sharp when enlarged.
 *
 *   node marketing/product-hunt/render.mjs            # every gallery-*.html
 *   node marketing/product-hunt/render.mjs gallery-1-inbox.html
 *
 * Set CHROME=/path/to/browser if it isn't in a standard location.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const dir = path.dirname(fileURLToPath(import.meta.url));
const W = 1270;
const H = 760;
const SCALE = 2;

const candidates = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) throw new Error('No Chrome or Edge found. Set CHROME=/path/to/browser.');

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(dir).filter((f) => /^gallery-.*\.html$/.test(f));

for (const file of files) {
  const html = path.join(dir, file);
  const out = path.join(dir, file.replace(/\.html$/, '.png'));
  const raw = `${out}.raw.png`;
  // Headless windows can come out a few pixels short, so shoot taller and crop.
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    `--force-device-scale-factor=${SCALE}`,
    `--window-size=${W},${H + 200}`,
    '--virtual-time-budget=4000',
    `--screenshot=${raw}`,
    pathToFileURL(html).href,
  ], { stdio: 'ignore' });
  await sharp(raw).extract({ left: 0, top: 0, width: W * SCALE, height: H * SCALE }).png({ compressionLevel: 9 }).toFile(out);
  rmSync(raw);
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
}

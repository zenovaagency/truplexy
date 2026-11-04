/**
 * Renders public/video/truplexy-promo-poster.webp (1920×1080), the promo
 * film's poster, from scripts/video-poster.html with headless Chrome or Edge,
 * so it uses the site's real fonts and logo. Run with `npm run poster`.
 * The output is committed, so the build never depends on this.
 *
 * Set CHROME=/path/to/browser if it isn't in a standard location.
 */
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = path.join(root, 'scripts', 'video-poster.html');
const out = path.join(root, 'public', 'video', 'truplexy-promo-poster.webp');

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

// Headless windows can come out a few pixels short, so shoot taller and crop.
const raw = path.join(root, 'public', '.video-poster-raw.png');
execFileSync(browser, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--force-device-scale-factor=1',
  '--window-size=1920,1200',
  '--virtual-time-budget=4000',
  `--screenshot=${raw}`,
  pathToFileURL(html).href,
]);

await sharp(raw).extract({ left: 0, top: 0, width: 1920, height: 1080 }).webp({ quality: 88 }).toFile(out);
await rm(raw);
console.log('Wrote public/video/truplexy-promo-poster.webp');

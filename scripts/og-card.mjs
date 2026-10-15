/**
 * Renders public/og-card.png (1200×630) from scripts/og-card.html with
 * headless Chrome or Edge, so the card uses the site's real fonts. Run with
 * `npm run og`. The output is committed, so the build never depends on this.
 *
 * Set CHROME=/path/to/browser if it isn't in a standard location.
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = path.join(root, 'scripts', 'og-card.html');
const out = path.join(root, 'public', 'og-card.png');

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
const raw = path.join(root, 'public', '.og-card-raw.png');
execFileSync(browser, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--force-device-scale-factor=1',
  '--window-size=1200,800',
  '--virtual-time-budget=4000',
  `--screenshot=${raw}`,
  pathToFileURL(html).href,
]);

await sharp(raw).extract({ left: 0, top: 0, width: 1200, height: 630 }).png({ compressionLevel: 9 }).toFile(out);
await import('node:fs/promises').then((fs) => fs.rm(raw));
console.log('Wrote public/og-card.png');

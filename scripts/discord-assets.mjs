/**
 * Renders the Discord bot's profile art with headless Chrome or Edge into
 * ../truplexy-discord-bot/assets/:
 *   - discord-banner.png  2040×720 (scripts/discord-banner.html, 680×240 at 3x)
 *   - discord-avatar.png  1024×1024 (scripts/discord-avatar.html, 512×512 at 2x)
 *   - discord-avatar.gif  320×320, 4 s loop at 25 fps (the same page, one frame per ?t=)
 * Run with `npm run discord-assets`. The GIF needs ffmpeg on PATH (else it is skipped).
 *
 * Set CHROME=/path/to/browser if it isn't in a standard location.
 * Pass `--guides <dir>` to also write copies with Discord's overlay zones drawn.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, '..', 'truplexy-discord-bot', 'assets');

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

const guidesAt = process.argv.indexOf('--guides');
const guidesDir = guidesAt > -1 ? path.resolve(process.argv[guidesAt + 1]) : null;

const pageUrl = (page, query = '') => pathToFileURL(path.join(root, 'scripts', page)).href + query;

/** Screenshots one page state to `out` (exactly width×height at `scale`). */
async function shoot({ url, width, height, scale, out, profile }) {
  mkdirSync(path.dirname(out), { recursive: true });
  // Headless windows can come out a few pixels short, so shoot taller and crop.
  const raw = out.replace(/\.png$/, '.raw.png');
  await run(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    ...(profile ? [`--user-data-dir=${profile}`] : []),
    `--force-device-scale-factor=${scale}`,
    `--window-size=${width},${height + 160}`,
    '--virtual-time-budget=4000',
    `--screenshot=${raw}`,
    url,
  ]);
  await sharp(raw)
    .extract({ left: 0, top: 0, width: width * scale, height: height * scale })
    .png({ compressionLevel: 9 })
    .toFile(out);
  rmSync(raw);
}

const stills = [
  ['discord-banner.html', 680, 240, 3, 'discord-banner.png'],
  ['discord-avatar.html', 512, 512, 2, 'discord-avatar.png'],
];
for (const [page, width, height, scale, name] of stills) {
  const out = path.join(outDir, name);
  await shoot({ url: pageUrl(page), width, height, scale, out });
  console.log('Wrote ' + out);
  if (guidesDir) {
    const g = path.join(guidesDir, name.replace('.png', '-guides.png'));
    await shoot({ url: pageUrl(page, '?guides'), width, height, scale, out: g });
    console.log('Wrote ' + g);
  }
}

// Animated avatar: render each frame, then let ffmpeg build one palette for the loop.
const ffmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    return null;
  }
})();
if (!ffmpeg) {
  console.warn('ffmpeg not found: skipped discord-avatar.gif');
} else {
  const LOOP = 4;
  const FPS = 25;
  const frames = LOOP * FPS;
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'discord-avatar-'));
  const workers = Math.max(2, Math.min(8, os.cpus().length - 1));
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, async (_, w) => {
      const profile = path.join(tmp, `profile-${w}`);
      while (next < frames) {
        const i = next++;
        const out = path.join(tmp, `f${String(i).padStart(3, '0')}.png`);
        await shoot({ url: pageUrl('discord-avatar.html', `?t=${(i / FPS).toFixed(3)}`), width: 512, height: 512, scale: 1, out, profile });
      }
    }),
  );
  const gif = path.join(outDir, 'discord-avatar.gif');
  execFileSync(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-framerate', String(FPS),
    '-i', path.join(tmp, 'f%03d.png'),
    '-vf', 'scale=320:320:flags=lanczos,split[a][b];[a]palettegen=stats_mode=full:max_colors=256[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
    '-loop', '0',
    gif,
  ]);
  rmSync(tmp, { recursive: true, force: true });
  console.log('Wrote ' + gif);
}

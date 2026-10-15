/**
 * Tiles the rendered stills (scripts/stills.mjs) into one labelled contact
 * sheet. Uses sharp, which the site repo already installs.
 * Usage: node scripts/contact-sheet.mjs [stillsDir] [output]
 */
import sharp from 'sharp';
import path from 'node:path';
import { readdirSync } from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.resolve(root, process.argv[2] ?? 'out/stills');
const output = path.resolve(root, process.argv[3] ?? 'previews/contact-sheet.png');

const FPS = 30;
// Scene starts in seconds; keep in step with src/timeline.ts.
const SCENES = [
  [0, 'Scene 01 · Customers never stop asking'],
  [11.467, 'Scene 02 · Juggling apps'],
  [21.233, 'Scene 03 · Meet Truplexy'],
  [29.367, 'Scene 04 · One inbox'],
  [41.467, 'Scene 05 · Human-like support, 24/7'],
  [58.433, 'Scene 06 · Your business knowledge'],
  [69.7, 'Scene 07 · AI efficiency, human connection'],
  [80.533, 'Scene 08 · Final brand moment'],
];

const files = readdirSync(dir).filter((f) => /^frame-\d+\.png$/.test(f)).sort();
const COLS = 3, TW = 640, TH = 360, GAP = 24, LABEL = 40, PAD = 40, HEADER = 90;
const rows = Math.ceil(files.length / COLS);
const W = PAD * 2 + COLS * TW + (COLS - 1) * GAP;
const H = HEADER + rows * (TH + LABEL + GAP) + PAD - GAP;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tc = (frame) => {
  const s = frame / FPS;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

const tiles = [];
let labels = `<text x="${PAD}" y="58" font-family="Segoe UI, Arial" font-size="30" font-weight="800" fill="#0E1222">Truplexy launch film · key frames</text>`;
for (const [i, file] of files.entries()) {
  const frame = Number(file.match(/\d+/)[0]);
  const x = PAD + (i % COLS) * (TW + GAP);
  const y = HEADER + Math.floor(i / COLS) * (TH + LABEL + GAP);
  const scene = [...SCENES].reverse().find(([start]) => frame >= start * FPS)[1];
  tiles.push({ input: await sharp(path.join(dir, file)).resize(TW, TH).png().toBuffer(), left: x, top: y });
  labels += `<rect x="${x - 1}" y="${y - 1}" width="${TW + 2}" height="${TH + 2}" rx="8" fill="none" stroke="#E3E6F0" stroke-width="2"/>`;
  labels += `<text x="${x}" y="${y + TH + 28}" font-family="Segoe UI, Arial" font-size="17" font-weight="700" fill="#0E1222">${esc(scene)}</text>`;
  labels += `<text x="${x + TW}" y="${y + TH + 28}" text-anchor="end" font-family="Segoe UI, Arial" font-size="17" fill="#61688A">${tc(frame)}</text>`;
}

await sharp({ create: { width: W, height: H, channels: 3, background: '#F7F8FC' } })
  .composite([...tiles, { input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`), left: 0, top: 0 }])
  .png()
  .toFile(output);
console.log(`${files.length} frames → ${path.relative(root, output)}`);

/**
 * Renders key frames of the film as PNGs, from one bundle, for review and for
 * the contact sheet. Usage: node scripts/stills.mjs [outDir] [frame ...]
 */
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.resolve(root, process.argv[2] ?? 'out/stills');
const frames = process.argv.slice(3).map(Number);
const DEFAULT = [150, 270, 524, 584, 663, 733, 873, 1104, 1204, 1484, 1534, 1704, 1883, 2063, 2201, 2341, 2466, 2656];

mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts') });
const composition = await selectComposition({ serveUrl, id: 'TruplexyLaunch', inputProps: { subtitles: true } });

for (const frame of frames.length ? frames : DEFAULT) {
  const output = path.join(outDir, `frame-${String(frame).padStart(4, '0')}.png`);
  await renderStill({ serveUrl, composition, frame, output, inputProps: { subtitles: true }, imageFormat: 'png' });
  console.log(`${frame} → ${path.relative(root, output)}`);
}

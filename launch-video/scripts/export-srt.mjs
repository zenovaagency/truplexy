/**
 * Writes captions/truplexy-launch.srt (and a word-level JSON) from the same
 * phrase data the burned-in subtitles use. Run: node scripts/export-srt.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PHRASES, toSrt } from '../src/captions/phrases.ts';

const root = path.resolve(import.meta.dirname, '..');
mkdirSync(path.join(root, 'captions'), { recursive: true });
writeFileSync(path.join(root, 'captions/truplexy-launch.srt'), toSrt());
writeFileSync(
  path.join(root, 'captions/word-timings.json'),
  JSON.stringify(PHRASES.map((p) => ({ scene: p.scene + 1, show: +p.show.toFixed(3), hide: +p.hide.toFixed(3), words: p.words.map((w) => ({ text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) })) })), null, 2),
);
console.log(`${PHRASES.length} phrases → captions/truplexy-launch.srt`);

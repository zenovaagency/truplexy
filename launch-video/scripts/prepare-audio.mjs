/**
 * Levels every source sound before it goes into the Remotion mix, so the mix
 * itself only needs simple, readable gains.
 *
 *   audio-source/  untouched ElevenLabs downloads (narration, music, sfx)
 *   public/audio/  levelled copies the film actually plays
 *
 * Each file is measured (EBU R128 integrated loudness) and gained to its
 * target. The narration also gets a gentle high-pass and compressor so all
 * eight clips sit at one consistent level. Needs a full ffmpeg build: set
 * FFMPEG, or it uses the WinGet one on Windows, or `ffmpeg` on PATH.
 *
 * Run: node scripts/prepare-audio.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const winget = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft/WinGet/Links/ffmpeg.exe');
export const FF = process.env.FFMPEG ?? (existsSync(winget) ? winget : 'ffmpeg');

/** Target integrated loudness (LUFS) per file, before the master. */
const TARGETS = {
  narration: -20,
  music: -20,
  sfx: {
    'notify.mp3': -30,
    'send.mp3': -31,
    'receive.mp3': -30,
    'whoosh.mp3': -32,
    'clock.mp3': -33,
    'disconnect.mp3': -31,
    'success.mp3': -28,
    'handoff.mp3': -28,
    'reveal.mp3': -25,
    'sonic-logo.mp3': -23,
  },
};

const VOICE_CHAIN = 'highpass=f=80,acompressor=threshold=-24dB:ratio=2.5:attack=8:release=120';

/** Integrated loudness of a file (after an optional filter chain), in LUFS. */
const loudness = (file, pre = '') => {
  const res = spawnSync(FF, ['-hide_banner', '-nostats', '-i', file, '-af', `${pre ? pre + ',' : ''}ebur128`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = res.stderr.split('Summary:').pop().match(/I:\s+(-?[\d.]+) LUFS/);
  if (!m) throw new Error(`Could not measure ${file}`);
  return Number(m[1]);
};

for (const kind of ['narration', 'music', 'sfx']) {
  const dir = path.join(root, 'audio-source', kind);
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.mp3'))) {
    const target = kind === 'sfx' ? TARGETS.sfx[name] : TARGETS[kind];
    if (target === undefined) continue;
    const src = path.join(dir, name);
    const dst = path.join(root, 'public/audio', kind, name);
    mkdirSync(path.dirname(dst), { recursive: true });
    const pre = kind === 'narration' ? VOICE_CHAIN : '';
    const before = loudness(src, pre);
    const gain = (target - before).toFixed(2);
    execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-af', `${pre ? pre + ',' : ''}volume=${gain}dB`, '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '256k', dst]);
    console.log(`${kind}/${name}`.padEnd(28), `${loudness(src).toFixed(1)} → ${loudness(dst).toFixed(1)} LUFS (gain ${gain} dB)`);
  }
}

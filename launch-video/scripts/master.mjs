/**
 * Masters a rendered film for delivery:
 * - audio to -14 LUFS integrated, -1.2 dBTP, with a two-pass EBU R128
 *   loudnorm (linear, so the mix balance is untouched), AAC 256 kbps;
 * - video re-encoded from Remotion's full-range JPEG frames to standard
 *   limited-range yuv420p / BT.709 H.264, which every player and platform
 *   shows correctly. Needs a full ffmpeg build (see
 * prepare-audio.mjs for how it is found).
 *
 * Usage: node scripts/master.mjs <in.mp4> <out.mp4>
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const winget = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft/WinGet/Links/ffmpeg.exe');
const FF = process.env.FFMPEG ?? (existsSync(winget) ? winget : 'ffmpeg');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/master.mjs <in.mp4> <out.mp4>');

const TARGET = { I: -14, TP: -1.2, LRA: 11 };
const base = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}`;

const pass1 = spawnSync(FF, ['-hide_banner', '-nostats', '-i', input, '-af', `${base}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
const m = JSON.parse(pass1.stderr.slice(pass1.stderr.lastIndexOf('{'), pass1.stderr.lastIndexOf('}') + 1));
const pass2 = `${base}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;

const VIDEO = [
  '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-level', '4.1',
  '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
];
execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, ...VIDEO, '-af', `${pass2},aresample=48000`, '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', output]);
console.log(`mastered ${path.basename(input)} → ${path.basename(output)} (input ${m.input_i} LUFS, ${m.input_tp} dBTP)`);

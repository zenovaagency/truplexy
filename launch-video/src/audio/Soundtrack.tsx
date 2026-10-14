import { Sequence, staticFile } from 'remotion';
import { Audio } from '@remotion/media';
import { NARRATION } from '../captions/narration';
import { FPS, SCENES, TOTAL_FRAMES, f } from '../timeline';
import { CUES } from './cues';

/**
 * The film's mix: narration, music and sound effects.
 *
 * All sources are pre-levelled (scripts/prepare-audio.mjs): narration at
 * -20 LUFS, music at -20 LUFS, effects between -33 and -23 LUFS. The master
 * is normalised to -14 LUFS / -1 dBTP after rendering (scripts/master.mjs).
 *
 * The music is ducked under the voice. The envelope is computed from the
 * measured word timings, not from the audio, so it is deterministic: the
 * music starts dipping 0.1 s before a word, falls 12 dB in about 0.15 s, and
 * recovers over about 0.6 s once a line ends, so it swells in the pauses
 * between lines and on the logo moments.
 */
const MUSIC_UP = 0.85;
const DUCK_DB = 12;
const MUSIC_DOWN = MUSIC_UP * 10 ** (-DUCK_DB / 20);
/** Speech closer together than this counts as one continuous line. */
const BRIDGE = 0.35;
const LOOKAHEAD = 0.1;

const speechTarget = (() => {
  const target = new Float32Array(TOTAL_FRAMES);
  SCENES.forEach((s, i) => {
    const words = NARRATION[i];
    words.forEach(([, start, end], j) => {
      const next = words[j + 1];
      const until = next && next[1] - end < BRIDGE ? next[1] : end + 0.12;
      for (let fr = f(s.vo.at + start - LOOKAHEAD); fr <= f(s.vo.at + until); fr++) {
        if (fr >= 0 && fr < TOTAL_FRAMES) target[fr] = 1;
      }
    });
  });
  return target;
})();

/** Duck amount per frame (0 = full music, 1 = fully ducked), with attack and release. */
const DUCK = (() => {
  const env = new Float32Array(TOTAL_FRAMES);
  const attack = 1 - Math.exp(-1 / (0.05 * FPS));
  const release = 1 - Math.exp(-1 / (0.22 * FPS));
  let v = 0;
  for (let fr = 0; fr < TOTAL_FRAMES; fr++) {
    const t = speechTarget[fr];
    v += (t - v) * (t > v ? attack : release);
    env[fr] = v;
  }
  return env;
})();

const musicVolume = (fr: number) => {
  const fadeIn = Math.min(1, fr / (0.5 * FPS));
  const fadeOut = Math.min(1, (TOTAL_FRAMES - fr) / (2.2 * FPS));
  const d = DUCK[Math.min(TOTAL_FRAMES - 1, Math.max(0, fr))];
  return Math.max(0, fadeIn * fadeOut * (MUSIC_UP + (MUSIC_DOWN - MUSIC_UP) * d));
};

export const Soundtrack = () => (
  <>
    <Sequence name="Music" layout="none">
      <Audio src={staticFile('audio/music/music.mp3')} volume={musicVolume} />
    </Sequence>
    {SCENES.map((s) => (
      <Sequence key={`vo-${s.id}`} name={`VO ${s.id}`} from={f(s.vo.at)} durationInFrames={Math.ceil(s.vo.length * FPS) + 2} layout="none">
        <Audio src={staticFile(s.vo.file)} />
      </Sequence>
    ))}
    {CUES.map((c, i) => (
      <Sequence key={`sfx-${i}`} name={`SFX ${c.sfx}`} from={c.frame} durationInFrames={4 * FPS} layout="none">
        <Audio src={staticFile(`audio/sfx/${c.sfx}.mp3`)} volume={c.vol} />
      </Sequence>
    ))}
  </>
);

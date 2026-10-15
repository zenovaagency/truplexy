import { NARRATION } from './captions/narration.ts';

/**
 * The film's one authoritative timeline. Every scene, narration clip, caption
 * and (later) music cue reads its timing from here, so retiming a scene moves
 * everything that depends on it.
 *
 * Narration is take 4 of each scene (v3 script for 02, 03, 04 and 08); lengths
 * measured with `npx remotion ffprobe`, word timings in captions/narration.ts. Each scene
 * is sized tightly to its narration (a ~0.15 s lead-in and ~0.2 s tail), so
 * the next line starts about half a second after the last one ends; the
 * final end card holds for 2.6 s.
 */
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Frames of overlap where one scene dissolves into the next (white to white). */
export const XFADE = 14;

export interface SceneTiming {
  id: string;
  title: string;
  /** Scene start and end, in seconds on the film timeline. */
  start: number;
  end: number;
  /** Narration clip, its measured length, and where it starts on the film timeline. */
  vo: { file: string; length: number; at: number };
}

export const SCENES: SceneTiming[] = [
  { id: 'S01', title: 'Customers never stop asking', start: 0, end: 11.467, vo: { file: 'audio/narration/scene-01.mp3', length: 10.92, at: 0.5 } },
  { id: 'S02', title: 'Juggling apps', start: 11.467, end: 21.233, vo: { file: 'audio/narration/scene-02.mp3', length: 9.48, at: 11.6 } },
  { id: 'S03', title: 'Meet Truplexy', start: 21.233, end: 29.367, vo: { file: 'audio/narration/scene-03.mp3', length: 7.56, at: 21.633 } },
  { id: 'S04', title: 'One inbox', start: 29.367, end: 41.467, vo: { file: 'audio/narration/scene-04.mp3', length: 11.784, at: 29.5 } },
  { id: 'S05', title: 'Human-like support, 24/7', start: 41.467, end: 58.433, vo: { file: 'audio/narration/scene-05.mp3', length: 16.512, at: 41.6 } },
  { id: 'S06', title: 'Your business knowledge', start: 58.433, end: 69.7, vo: { file: 'audio/narration/scene-06.mp3', length: 11.064, at: 58.6 } },
  { id: 'S07', title: 'AI efficiency, human connection', start: 69.7, end: 80.533, vo: { file: 'audio/narration/scene-07.mp3', length: 10.584, at: 69.867 } },
  { id: 'S08', title: 'Final brand moment', start: 80.533, end: 90.867, vo: { file: 'audio/narration/scene-08.mp3', length: 7.56, at: 80.733 } },
];

export const TOTAL_SECONDS = 90.867;
export const TOTAL_FRAMES = Math.round(TOTAL_SECONDS * FPS);

export const f = (seconds: number) => Math.round(seconds * FPS);

export const sceneFrames = (s: SceneTiming) => ({
  from: f(s.start),
  duration: f(s.end - s.start),
});

/**
 * Frame, local to scene `scene` (0-based), at which narration word `word`
 * starts. `word` is the index in captions/narration.ts, or the word's text
 * (first match, punctuation ignored). Use it so animation beats land exactly
 * on the spoken word.
 */
export const wordAt = (scene: number, word: number | string, which: 'start' | 'end' = 'start') => {
  const s = SCENES[scene];
  const words = NARRATION[scene];
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9/'-]/g, '');
  const i = typeof word === 'number' ? word : words.findIndex(([t]) => norm(t) === norm(word));
  if (i < 0 || !words[i]) throw new Error(`No word "${word}" in scene ${scene + 1} narration`);
  return f(s.vo.at - s.start + words[i][which === 'start' ? 1 : 2]);
};

/** Local frame of the nth (0-based) occurrence of a word in a scene. */
export const wordAtNth = (scene: number, text: string, nth: number) => {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9/'-]/g, '');
  let seen = -1;
  const i = NARRATION[scene].findIndex(([t]) => norm(t) === norm(text) && ++seen === nth);
  return wordAt(scene, i);
};

/**
 * Scene-local frame for each word of a headline, taken from the narration so
 * every word appears as it is spoken. The headline's words are matched, in
 * order, to the scene's narration from `fromWord` on (punctuation and case
 * ignored). A word that is not spoken follows the previous one by `gap`
 * frames.
 */
export const sayFrames = (scene: number, text: string, fromWord = 0, gap = 4) => {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9/'-]/g, '');
  const words = NARRATION[scene];
  let cursor = fromWord;
  let last = -Infinity;
  return text.split(/\s+/).filter(Boolean).map((w, i) => {
    const j = words.findIndex(([t], k) => k >= cursor && norm(t) === norm(w));
    let fr: number;
    if (j >= 0) {
      fr = wordAt(scene, j);
      cursor = j + 1;
    } else {
      if (i === 0) throw new Error(`Headline "${text}" must start on a spoken word (scene ${scene + 1})`);
      fr = last + gap;
    }
    last = Math.max(fr, last);
    return last;
  });
};

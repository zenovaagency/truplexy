import { NARRATION } from './captions/narration.ts';

/**
 * The film's one authoritative timeline. Every scene, narration clip, caption
 * and (later) music cue reads its timing from here, so retiming a scene moves
 * everything that depends on it.
 *
 * Narration is the v2 script, take 4 of each scene; lengths measured with
 * `npx remotion ffprobe`, word timings in captions/narration.ts. Each scene
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
  { id: 'S01', title: 'Customers never stop asking', start: 0, end: 11.467, vo: { file: 'audio/narration/scene-01.mp3', length: 10.919, at: 0.5 } },
  { id: 'S02', title: 'Disconnected conversations', start: 11.467, end: 20.767, vo: { file: 'audio/narration/scene-02.mp3', length: 9.169, at: 11.6 } },
  { id: 'S03', title: 'Meet Truplexy', start: 20.767, end: 30.133, vo: { file: 'audio/narration/scene-03.mp3', length: 8.908, at: 21.167 } },
  { id: 'S04', title: 'One conversation, across channels', start: 30.133, end: 41.133, vo: { file: 'audio/narration/scene-04.mp3', length: 10.841, at: 30.267 } },
  { id: 'S05', title: 'Human-like support, 24/7', start: 41.133, end: 58.1, vo: { file: 'audio/narration/scene-05.mp3', length: 16.509, at: 41.267 } },
  { id: 'S06', title: 'Your business knowledge', start: 58.1, end: 69.367, vo: { file: 'audio/narration/scene-06.mp3', length: 11.076, at: 58.267 } },
  { id: 'S07', title: 'AI efficiency, human connection', start: 69.367, end: 80.2, vo: { file: 'audio/narration/scene-07.mp3', length: 10.606, at: 69.533 } },
  { id: 'S08', title: 'Final brand moment', start: 80.2, end: 89.867, vo: { file: 'audio/narration/scene-08.mp3', length: 7.079, at: 80.4 } },
];

export const TOTAL_SECONDS = 89.867;
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

import { NARRATION } from './narration.ts';
import { SCENES } from '../timeline.ts';

/**
 * Groups the word-timed narration into subtitle phrases (3–7 words, one or
 * two lines). Shared by the burned-in subtitles and the SRT export, so both
 * always match. Times are absolute seconds on the film timeline.
 */
export interface TimedWord {
  text: string;
  start: number;
  end: number;
  emphasis: boolean;
}

export interface Phrase {
  scene: number;
  words: TimedWord[];
  /** When the phrase is on screen. */
  show: number;
  hide: number;
}

/** Words that get a little extra weight when spoken. */
const EMPHASIS = new Set(['truplexy', 'everywhere', 'anytime', 'inbox', 'platform', 'human-like', '24/7', 'knowledge', 'source', 'help', 'free', 'trial']);

const MAX_WORDS = 7;
/** Good places to break a long phrase: just before one of these. */
const JOINERS = new Set(['that', 'how', 'and', 'with', 'so', 'but', 'to', 'for', 'on', 'from']);
/** A pause longer than this always starts a new phrase. */
const BREAK_GAP = 0.42;
const LEAD = 0.12;
const LINGER = 0.35;

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9/'-]/g, '');

export const buildPhrases = (): Phrase[] => {
  const groups: { scene: number; words: TimedWord[] }[] = [];
  SCENES.forEach((s, scene) => {
    let current: TimedWord[] = [];
    const flush = () => {
      if (current.length) groups.push({ scene, words: current });
      current = [];
    };
    NARRATION[scene].forEach(([text, start, end], i, all) => {
      const word: TimedWord = { text, start: s.vo.at + start, end: s.vo.at + end, emphasis: EMPHASIS.has(norm(text)) };
      const prev = current[current.length - 1];
      if (prev && word.start - prev.end > BREAK_GAP) flush();
      else if (current.length >= MAX_WORDS) {
        // Let a sentence finish if its end is within the next two words…
        const endsSoon = all.slice(i, i + 2).some(([t]) => /[.!?…,]$/.test(t));
        if (!(endsSoon && current.length < MAX_WORDS + 2)) {
          // …otherwise break before a joining word near the end, not mid-thought.
          let k = -1;
          current.forEach((w, j) => {
            if (j >= 3 && JOINERS.has(norm(w.text))) k = j;
          });
          if (k >= 3) {
            const carry = current.slice(k);
            current = current.slice(0, k);
            flush();
            current = carry;
          } else flush();
        }
      }
      current.push(word);
      const next = all[i + 1];
      const sentenceEnd = /[.!?…]$/.test(text);
      const clauseEnd = /[,—]$/.test(text) && current.length >= 3;
      // Don't leave a single word dangling on its own if the sentence carries on.
      if ((sentenceEnd || clauseEnd) && !(next && current.length < 2)) flush();
    });
    flush();
  });

  return groups.map((g, i) => {
    const next = groups[i + 1];
    const first = g.words[0];
    const last = g.words[g.words.length - 1];
    const nextShow = next ? next.words[0].start - LEAD : Infinity;
    return {
      scene: g.scene,
      words: g.words,
      show: first.start - LEAD,
      hide: Math.min(last.end + LINGER, nextShow - 0.02),
    };
  });
};

export const PHRASES = buildPhrases();

const ts = (sec: number) => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
};

/** The phrases as an .srt file. */
export const toSrt = (phrases: Phrase[] = PHRASES) =>
  phrases.map((p, i) => `${i + 1}\n${ts(p.show)} --> ${ts(p.hide)}\n${p.words.map((w) => w.text).join(' ')}\n`).join('\n');

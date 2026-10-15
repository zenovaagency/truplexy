import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { FPS } from '../timeline';
import { EXPO, mix, prog } from '../animations/motion';
import { PHRASES, type Phrase, type TimedWord } from './phrases';

/**
 * Burned-in subtitles. One phrase at a time, lower centre, driven entirely
 * by the frame and the measured word timings (captions/narration.ts):
 *
 * - the phrase rises in as its first word starts and fades as it ends;
 * - words already spoken are full ink, words still to come are lighter;
 * - the word being spoken sits on a soft brand-tinted pill that glides from
 *   word to word, and key words (Truplexy, Everywhere, 24/7…) swell slightly.
 *
 * Unlike the headlines, the subtitle style stays the same in every scene, so
 * it is always easy to read.
 */
const SIZE = 42;
const BOTTOM = 92;

const Word = ({ w, t, active, done }: { w: TimedWord; t: number; active: boolean; done: boolean }) => {
  // How far into this word we are (0 → 1), for the active pill and emphasis swell.
  const k = Math.min(1, Math.max(0, (t - w.start) / Math.max(0.12, w.end - w.start)));
  const swell = active && w.emphasis ? 1 + 0.07 * Math.sin(Math.PI * Math.min(1, k * 1.4)) : 1;
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-block',
        padding: '2px 8px 6px',
        margin: '0 -2px',
        color: active ? C.accent : C.ink,
        opacity: active || done ? 1 : 0.5,
        transform: `scale(${swell})`,
        transformOrigin: '50% 70%',
      }}
    >
      {active && (
        <span
          style={{
            position: 'absolute',
            inset: '0 0 2px',
            borderRadius: 12,
            background: C.accentSoft,
            boxShadow: `inset 0 0 0 1.5px rgb(35 56 230 / 0.18)`,
            zIndex: -1,
            opacity: Math.min(1, k * 6),
          }}
        />
      )}
      {w.text}
    </span>
  );
};

const PhraseView = ({ p, t }: { p: Phrase; t: number }) => {
  const frame = useCurrentFrame();
  const showF = p.show * FPS;
  const hideF = p.hide * FPS;
  const inT = prog(frame, showF, 7, EXPO);
  const outT = prog(frame, hideF - 6, 6, EXPO);
  return (
    <div
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: 1300,
        padding: '10px 22px 10px',
        borderRadius: 22,
        background: 'rgb(255 255 255 / 0.82)',
        boxShadow: '0 8px 30px rgb(14 18 34 / 0.08)',
        backdropFilter: 'blur(8px)',
        fontFamily: FONT.sans,
        fontSize: SIZE,
        fontWeight: 600,
        lineHeight: 1.25,
        letterSpacing: '-0.01em',
        opacity: inT * (1 - outT),
        transform: `translateY(${mix(14, 0, inT) - outT * 6}px)`,
        isolation: 'isolate',
      }}
    >
      {p.words.map((w, i) => {
        const active = t >= w.start && (t < w.end || (i === p.words.length - 1 ? false : t < p.words[i + 1].start));
        return <Word key={i} w={w} t={t} active={active} done={t >= w.end} />;
      })}
    </div>
  );
};

export const Subtitles = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const p = PHRASES.find((x) => t >= x.show && t < x.hide);
  if (!p) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: BOTTOM, pointerEvents: 'none' }}>
      <PhraseView key={p.show} p={p} t={t} />
    </AbsoluteFill>
  );
};

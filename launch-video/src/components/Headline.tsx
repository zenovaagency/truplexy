import type { CSSProperties, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT, GRADIENT_TEXT } from '../theme';
import { EXPO, mix, prog } from '../animations/motion';

/**
 * Kinetic headline. Marketing type, separate from the subtitles, with one
 * motion system for the whole film:
 *
 *   voice  each word rises out of its mask on the frame it is spoken (frames
 *          come from sayFrames() in timeline.ts), and accent words take the
 *          brand gradient a beat after they land. Every headline leaves the
 *          same way: the words rise out of their masks, one frame apart.
 *   chars  the logo moment only ("Meet Truplexy."): the same rise, letter by
 *          letter, starting on the spoken word.
 *
 * Masks are padded well past the baseline so descenders (g, y, p) are never
 * clipped, and the gradient's painted box is padded so it never shaves glyphs.
 */
const STOPS = [C.blue, C.indigo, C.violet];

/** Room around glyphs for masks and gradient clipping: ascenders, descenders, overshoot. */
const MASK_PAD = { top: 0.14, bottom: 0.3, side: 0.06 };

/** Frames a word takes to rise in, and to leave. */
const IN = 16;
const OUT = 12;
/** Frames after a word lands before its accent gradient is fully on. */
const ACCENT_IN = 10;

const clean = (w: string) => w.replace(/[.,!?…]/g, '').toUpperCase();

/** A colour along the text gradient, for per-letter accents (0 = blue, 1 = violet). */
const gradientAt = (t: number) => {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const seg = Math.min(STOPS.length - 2, Math.floor(t * (STOPS.length - 1)));
  const local = t * (STOPS.length - 1) - seg;
  const a = hex(STOPS[seg]);
  const b = hex(STOPS[seg + 1]);
  return `rgb(${a.map((v, i) => Math.round(mix(v, b[i], local))).join(' ')})`;
};

const gradientText = (size: number): CSSProperties => ({
  backgroundImage: GRADIENT_TEXT,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  padding: `0 ${size * MASK_PAD.side}px ${size * 0.12}px`,
  margin: `0 ${-size * MASK_PAD.side}px ${-size * 0.12}px`,
});

/** A word's mask: overflow hidden, padded so nothing inside is cut. */
const Mask = ({ size, children }: { size: number; children: ReactNode }) => (
  <span
    style={{
      display: 'inline-block',
      overflow: 'hidden',
      verticalAlign: 'top',
      padding: `${size * MASK_PAD.top}px ${size * MASK_PAD.side}px ${size * MASK_PAD.bottom}px`,
      margin: `${-size * MASK_PAD.top}px ${-size * MASK_PAD.side}px ${-size * MASK_PAD.bottom}px`,
    }}
  >
    {children}
  </span>
);

/** Ink word with the gradient fading in over it, so the accent "lights up" once spoken. */
const AccentWord = ({ word, size, lit }: { word: string; size: number; lit: number }) => (
  <span style={{ position: 'relative', display: 'inline-block' }}>
    <span style={{ opacity: 1 - lit }}>{word}</span>
    <span style={{ position: 'absolute', left: 0, top: 0, opacity: lit, ...gradientText(size) }}>{word}</span>
  </span>
);

export const Headline = ({
  text,
  sync,
  out,
  size = 84,
  accent = [],
  align = 'left',
  color = C.ink,
  variant = 'voice',
  style,
}: {
  text: string;
  /** Scene-local frame each word enters (sayFrames()); for `chars`, only the first is used. */
  sync: number[];
  /** Frame the headline starts leaving; omit to hold. */
  out?: number;
  size?: number;
  accent?: string[];
  align?: 'left' | 'center';
  color?: string;
  variant?: 'voice' | 'chars';
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const at = sync[0];
  if (frame < at) return null;
  const lines = text.split('\n').map((l) => l.split(' ').filter(Boolean));
  const isAccent = (w: string) => accent.some((a) => clean(w) === a.toUpperCase());
  if (out !== undefined && frame > out + OUT + 40) return null;

  const base: CSSProperties = {
    fontFamily: FONT.sans,
    fontWeight: 800,
    fontSize: size,
    lineHeight: 1.08,
    letterSpacing: '-0.03em',
    color,
    textAlign: align,
    ...style,
  };
  const lineStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: size * 0.26,
    justifyContent: align === 'center' ? 'center' : 'flex-start',
  };

  let wordIndex = 0;
  let charIndex = 0;

  return (
    <div style={base}>
      {lines.map((words, li) => (
        <div key={li} style={lineStyle}>
          {words.map((w) => {
            const i = wordIndex++;
            const accentWord = isAccent(w);
            const o = out === undefined ? 0 : prog(frame, out + i, OUT, EXPO);

            if (variant === 'chars') {
              const letters = [...w];
              return (
                <span key={i} style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
                  {letters.map((ch, ci) => {
                    const k = charIndex++;
                    const ct = prog(frame, at + k * 1.4, 18, EXPO);
                    const co = out === undefined ? 0 : prog(frame, out + k * 0.6, 10, EXPO);
                    return (
                      <Mask key={ci} size={size}>
                        <span
                          style={{
                            display: 'inline-block',
                            transform: `translateY(${mix(105, 0, ct) - co * 105}%)`,
                            opacity: Math.min(ct * 1.5, 1 - co),
                            color: accentWord ? gradientAt(letters.length > 1 ? ci / (letters.length - 1) : 0) : undefined,
                          }}
                        >
                          {ch}
                        </span>
                      </Mask>
                    );
                  })}
                </span>
              );
            }

            const start = sync[Math.min(i, sync.length - 1)];
            const wt = prog(frame, start, IN, EXPO);
            const lit = accentWord ? prog(frame, start + 4, ACCENT_IN) : 0;
            return (
              <Mask key={i} size={size}>
                <span
                  style={{
                    display: 'inline-block',
                    transform: `translateY(${mix(110, 0, wt) - o * 110}%)`,
                    opacity: Math.min(wt * 1.4, 1 - o),
                  }}
                >
                  {accentWord ? <AccentWord word={w} size={size} lit={lit} /> : w}
                </span>
              </Mask>
            );
          })}
        </div>
      ))}
    </div>
  );
};

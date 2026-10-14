import type { CSSProperties, ReactNode } from 'react';
import { Easing, useCurrentFrame } from 'remotion';
import { C, FONT, GRADIENT_TEXT } from '../theme';
import { EXPO, mix, prog } from '../animations/motion';

/**
 * Kinetic headline. Marketing type, separate from the subtitles. Each scene
 * uses its own entrance so the film never repeats one move:
 *
 *   rise   words rise out of a mask                       (01)
 *   stamp  words land from large, sharpening from blur     (02)
 *   chars  letters rise one after another, with a tilt     (03)
 *   slide  words wipe in from the left behind a clip edge  (04)
 *   pop    words spring up with a small overshoot          (05)
 *   wipe   each line is revealed by a moving brand bar     (06)
 *   type   letters type on, with a caret                   (07)
 *   track  wide letter-spacing collapses into place        (08)
 *
 * Words listed in `accent` get the brand's text-safe gradient. Masks are
 * padded well past the baseline so descenders (g, y, p) are never clipped.
 */
export type HeadlineVariant = 'rise' | 'stamp' | 'chars' | 'slide' | 'pop' | 'wipe' | 'type' | 'track';

const POP = Easing.bezier(0.34, 1.56, 0.64, 1);
const STOPS = [C.blue, C.indigo, C.violet];

/** Room around glyphs for masks and gradient clipping: ascenders, descenders, overshoot. */
const MASK_PAD = { top: 0.14, bottom: 0.3, side: 0.06 };

const clean = (w: string) => w.replace(/[.,!?]/g, '').toUpperCase();

/** A colour along the text gradient, for per-letter variants (0 = blue, 1 = violet). */
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
  // Pad the painted box so the gradient clip never shaves glyph edges.
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

export const Headline = ({
  text,
  at,
  out,
  size = 84,
  accent = [],
  stagger = 3,
  align = 'left',
  color = C.ink,
  variant = 'rise',
  style,
}: {
  text: string;
  /** Frame the headline starts entering. */
  at: number;
  /** Frame the headline starts leaving; omit to hold. */
  out?: number;
  size?: number;
  accent?: string[];
  stagger?: number;
  align?: 'left' | 'center';
  color?: string;
  variant?: HeadlineVariant;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const lines = text.split('\n').map((l) => l.split(' '));
  const isAccent = (w: string) => accent.some((a) => clean(w) === a.toUpperCase());
  const leave = out === undefined ? 0 : prog(frame, out, 14, EXPO);
  if (leave >= 1) return null;

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

  // Whole-headline variants.
  if (variant === 'track') {
    const t = prog(frame, at, 30, EXPO);
    return (
      <div
        style={{
          ...base,
          letterSpacing: `${mix(0.5, -0.03, t) - leave * 0.2}em`,
          opacity: Math.min(t * 1.3, 1) * (1 - leave),
          filter: `blur(${(1 - t) * 10 + leave * 8}px)`,
        }}
      >
        {lines.map((words, li) => (
          <div key={li} style={lineStyle}>
            {words.map((w, wi) => (
              <span key={wi} style={isAccent(w) ? gradientText(size) : undefined}>
                {w}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'wipe') {
    return (
      <div style={{ ...base, opacity: 1 - leave, transform: `translateY(${-leave * size * 0.3}px)` }}>
        {lines.map((words, li) => {
          const t = prog(frame, at + li * 8, 24, EXPO);
          return (
            <div key={li} style={{ position: 'relative', display: align === 'center' ? 'flex' : 'block', justifyContent: 'center' }}>
              <div
                style={{
                  ...lineStyle,
                  display: 'inline-flex',
                  position: 'relative',
                  padding: `${size * MASK_PAD.top}px ${size * 0.1}px ${size * MASK_PAD.bottom}px 0`,
                  margin: `${-size * MASK_PAD.top}px ${-size * 0.1}px ${-size * MASK_PAD.bottom}px 0`,
                  clipPath: `inset(0 ${(1 - t) * 100}% 0 0)`,
                }}
              >
                {words.map((w, wi) => (
                  <span key={wi} style={isAccent(w) ? gradientText(size) : undefined}>
                    {w}
                  </span>
                ))}
                {/* The bar that draws the line on, riding the reveal edge. */}
                <span
                  style={{
                    position: 'absolute',
                    top: size * 0.12,
                    bottom: size * 0.2,
                    left: `calc(${t * 100}% - ${size * 0.08}px)`,
                    width: size * 0.07,
                    borderRadius: size,
                    background: `linear-gradient(${C.cyan}, ${C.violet})`,
                    opacity: t < 1 ? 1 : 0,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Per-word and per-letter variants.
  let wordIndex = 0;
  let charIndex = 0;
  const totalChars = text.replace(/\s/g, '').length;
  const typedChars = variant === 'type' ? Math.floor(Math.max(0, frame - at) / 1.15) : 0;

  return (
    <div style={{ ...base, ...(variant === 'type' ? { opacity: 1 - leave } : null) }}>
      {lines.map((words, li) => (
        <div key={li} style={lineStyle}>
          {words.map((w) => {
            const i = wordIndex++;
            const accentWord = isAccent(w);
            const wt = prog(frame, at + i * stagger, 18, EXPO);
            const o = out === undefined ? 0 : prog(frame, out + i * 1.5, 12, EXPO);

            if (variant === 'rise') {
              return (
                <Mask key={i} size={size}>
                  <span
                    style={{
                      display: 'inline-block',
                      transform: `translateY(${mix(110, 0, wt) - o * 110}%)`,
                      opacity: Math.min(wt * 1.4, 1 - o),
                      ...(accentWord ? gradientText(size) : null),
                    }}
                  >
                    {w}
                  </span>
                </Mask>
              );
            }

            if (variant === 'stamp') {
              const st = prog(frame, at + i * (stagger + 2), 16, EXPO);
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    transform: `scale(${mix(1.45, 1, st) * mix(1, 0.9, o)})`,
                    opacity: Math.min(st * 1.6, 1) * (1 - o),
                    filter: `blur(${(1 - st) * 14 + o * 10}px)`,
                    ...(accentWord ? gradientText(size) : null),
                  }}
                >
                  {w}
                </span>
              );
            }

            if (variant === 'slide') {
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    padding: `${size * MASK_PAD.top}px ${size * MASK_PAD.side}px ${size * MASK_PAD.bottom}px`,
                    margin: `${-size * MASK_PAD.top}px ${-size * MASK_PAD.side}px ${-size * MASK_PAD.bottom}px`,
                    clipPath: `inset(0 ${(1 - wt) * 100 + 0}% 0 ${o * 100}%)`,
                    transform: `translateX(${mix(-0.35, 0, wt) * size + o * size * 0.3}px)`,
                  }}
                >
                  <span style={accentWord ? gradientText(size) : undefined}>{w}</span>
                </span>
              );
            }

            if (variant === 'pop') {
              const pt = prog(frame, at + i * stagger, 20, POP);
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    transform: `translateY(${(1 - Math.min(pt, 1)) * size * 0.25}px) scale(${Math.max(0, pt) * (1 - o * 0.4)})`,
                    transformOrigin: '50% 80%',
                    opacity: Math.min(prog(frame, at + i * stagger, 8), 1 - o),
                    ...(accentWord ? gradientText(size) : null),
                  }}
                >
                  {w}
                </span>
              );
            }

            // Per-letter variants: chars and type.
            const letters = [...w];
            return (
              <span key={i} style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
                {letters.map((ch, ci) => {
                  const k = charIndex++;
                  const letterColor = accentWord ? gradientAt(letters.length > 1 ? ci / (letters.length - 1) : 0) : undefined;
                  if (variant === 'type') {
                    const shown = k < typedChars;
                    const caretHere = k === Math.min(typedChars, totalChars) - 1;
                    const caretOn = Math.floor((frame - at) / 8) % 2 === 0 || typedChars < totalChars;
                    return (
                      <span key={ci} style={{ position: 'relative', opacity: shown ? 1 : 0, color: letterColor }}>
                        {ch}
                        {caretHere && caretOn && (
                          <span
                            style={{
                              position: 'absolute',
                              right: -size * 0.09,
                              top: size * 0.1,
                              bottom: size * 0.04,
                              width: size * 0.06,
                              borderRadius: 2,
                              background: C.accent,
                            }}
                          />
                        )}
                      </span>
                    );
                  }
                  // chars
                  const ct = prog(frame, at + k * 1.4, 18, EXPO);
                  const co = out === undefined ? 0 : prog(frame, out + k * 0.6, 10, EXPO);
                  return (
                    <Mask key={ci} size={size}>
                      <span
                        style={{
                          display: 'inline-block',
                          transform: `translateY(${mix(105, 0, ct) - co * 105}%) rotate(${mix(10, 0, ct)}deg)`,
                          transformOrigin: '0% 100%',
                          opacity: Math.min(ct * 1.5, 1 - co),
                          color: letterColor,
                        }}
                      >
                        {ch}
                      </span>
                    </Mask>
                  );
                })}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** A small uppercase label above a headline, like the site's eyebrow pill. */
export const Eyebrow = ({ text, at, style }: { text: string; at: number; style?: CSSProperties }) => {
  const frame = useCurrentFrame();
  const t = prog(frame, at, 16);
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 18px',
        borderRadius: 999,
        border: `1px solid ${C.line}`,
        background: C.white,
        fontFamily: FONT.sans,
        fontSize: 20,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: C.accent,
        opacity: t,
        transform: `translateY(${mix(12, 0, t)}px)`,
        ...style,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 4, background: C.accent }} />
      {text}
    </div>
  );
};

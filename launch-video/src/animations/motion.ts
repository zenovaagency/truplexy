import { Easing, interpolate } from 'remotion';

/** The site's --ease-out-expo. */
export const EXPO = Easing.bezier(0.22, 1, 0.36, 1);
/** Gentle in-out for camera moves. */
export const SMOOTH = Easing.bezier(0.65, 0, 0.35, 1);
/** Slight overshoot, for small pops only (buttons, chips). */
export const SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0 → 1 progress of a beat that starts at `start` and lasts `dur` frames. */
export const prog = (frame: number, start: number, dur: number, easing = EXPO) =>
  interpolate(frame, [start, start + dur], [0, 1], { ...clamp, easing });

/** Map a frame range to a value range, clamped. */
export const tween = (frame: number, input: number[], output: number[], easing = EXPO) =>
  interpolate(frame, input, output, { ...clamp, easing });

/** Linear interpolation between a and b. */
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Standard "message in" (the site's msg-in: rise 8px, scale .98 → 1). */
export const msgIn = (frame: number, at: number, dur = 13) => {
  const t = prog(frame, at, dur);
  return {
    opacity: t,
    transform: `translateY(${mix(14, 0, t)}px) scale(${mix(0.97, 1, t)})`,
  };
};

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

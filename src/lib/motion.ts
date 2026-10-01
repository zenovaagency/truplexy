/**
 * Shared motion constants.
 *
 * Durations follow the house scale: micro 100-180ms, standard 200-350ms,
 * section 400-700ms, hero 700-1200ms. Everything eases on
 * cubic-bezier(0.22, 1, 0.36, 1) — `expo.out` is GSAP's equivalent.
 */
export const DUR = {
  micro: 0.18,
  standard: 0.3,
  section: 0.6,
  hero: 1.0,
} as const;

export const EASE = 'expo.out';
export const EASE_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Pinning and horizontal scroll are desktop-only. Never on touch. */
export const DESKTOP = '(min-width: 1024px)';

export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

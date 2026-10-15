import type { CSSProperties } from 'react';
import { Img, staticFile } from 'remotion';

/** The Truplexy mark (874 × 928), copied from src/assets/brand/mark.png. */
export const MARK_RATIO = 874 / 928;
/** The dark-text wordmark (1887 × 482), copied from src/assets/brand/wordmark-dark.png. */
export const WORDMARK_RATIO = 1887 / 482;

export const Mark = ({ size, style }: { size: number; style?: CSSProperties }) => (
  <Img src={staticFile('brand/mark.png')} style={{ height: size, width: size * MARK_RATIO, display: 'block', ...style }} />
);

export const Wordmark = ({ height, style }: { height: number; style?: CSSProperties }) => (
  <Img
    src={staticFile('brand/wordmark-dark.png')}
    style={{ height, width: height * WORDMARK_RATIO, display: 'block', ...style }}
  />
);

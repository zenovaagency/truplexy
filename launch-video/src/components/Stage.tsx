import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { XFADE } from '../timeline';
import { EXPO, prog, mix } from '../animations/motion';

/**
 * The white stage every scene sits on. Two very faint brand-tinted glows give
 * the white some air; they drift slowly so the frame never feels static.
 */
export const Backdrop = ({ tint = 1 }: { tint?: number }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 40;
  return (
    <AbsoluteFill style={{ background: C.white }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 620px at ${78 + drift / 40}% ${8 + drift / 60}%, rgb(69 212 255 / ${0.1 * tint}), transparent 70%),
            radial-gradient(1000px 700px at ${12 - drift / 50}% ${96 - drift / 80}%, rgb(106 43 255 / ${0.07 * tint}), transparent 70%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Wraps a scene so it dissolves in and out over XFADE frames. Scenes overlap by
 * XFADE on the film timeline, so one white frame melts into the next with no
 * cut to black.
 */
export const SceneShell = ({
  children,
  length,
  fadeIn = true,
  fadeOut = true,
}: {
  children: ReactNode;
  /** The scene's length in frames, excluding the dissolve tail. */
  length: number;
  fadeIn?: boolean;
  fadeOut?: boolean;
}) => {
  const frame = useCurrentFrame();
  const durationInFrames = length + XFADE;
  const inT = fadeIn ? prog(frame, 0, XFADE, EXPO) : 1;
  const outT = fadeOut ? 1 - prog(frame, durationInFrames - XFADE, XFADE, EXPO) : 1;
  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(inT, outT),
        transform: `scale(${mix(1.015, 1, inT) * mix(0.985, 1, outT)})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Renders site-sized UI (authored in the site's px) at video scale. */
export const Scaled = ({
  s,
  children,
  style,
  origin = 'top left',
}: {
  s: number;
  children: ReactNode;
  style?: CSSProperties;
  origin?: string;
}) => (
  <div style={{ position: 'absolute', transform: `scale(${s})`, transformOrigin: origin, ...style }}>{children}</div>
);

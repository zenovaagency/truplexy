import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Sparkles, Users } from 'lucide-react';
import { Backdrop, SceneShell } from '../components/Stage';
import { Headline } from '../components/Headline';
import { Mark, MARK_RATIO } from '../components/Brand';
import { ChannelGlyph, type Channel } from '../components/ChannelGlyph';
import { C, FONT, GRADIENT_BRAND, SHADOW } from '../theme';
import { EXPO, SMOOTH, mix, prog } from '../animations/motion';
import { f, SCENES, sayFrames, wordAt } from '../timeline';

/**
 * 03 · Meet Truplexy.
 * The scattered conversations converge on the centre line, which resolves
 * into the real mark just before "Meet Truplexy". The mark then becomes the
 * hub: the AI assistant on one side, your team on the other (each on its
 * spoken word), and the live channels line up below on "every channel you
 * already use".
 */
const S = SCENES[2];
export const SCENE03_LENGTH = f(S.end - S.start);

/** Word cues from the narration (scene 03). */
const W = (word: string) => wordAt(2, word);
/** The mark lands just ahead of "Meet". */
export const LAND = Math.max(10, W('meet') - 10);

const CX = 960;
const CY = 400;

const BITS: { ch: Channel; text: string; angle: number }[] = [
  { ch: 'web', text: 'Where is my order?', angle: 200 },
  { ch: 'telegram', text: 'Order #4821', angle: 330 },
  { ch: 'whatsapp', text: 'Can I talk to someone?', angle: 20 },
  { ch: 'instagram', text: 'Is this available?', angle: 150 },
  { ch: 'messenger', text: 'Delivery charges?', angle: 260 },
  { ch: 'discord', text: 'Hello?', angle: 80 },
];

const Converge = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {BITS.map((b, i) => {
        const t = prog(frame, i * 2, LAND + 10, SMOOTH);
        const r = mix(760, 40, t);
        const a = (b.angle * Math.PI) / 180;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: CX + Math.cos(a) * r * 1.2,
              top: CY + Math.sin(a) * r * 0.62,
              transform: `translate(-50%, -50%) scale(${mix(1, 0.3, t)})`,
              opacity: mix(1, 0, prog(frame, LAND + i * 2, 14)),
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 18px',
              borderRadius: 999,
              background: C.white,
              border: `1px solid ${C.line}`,
              boxShadow: SHADOW.md,
              fontFamily: FONT.sans,
              fontSize: 20,
              fontWeight: 600,
              color: C.ink,
              whiteSpace: 'nowrap',
            }}
          >
            <ChannelGlyph id={b.ch} size={22} />
            {b.text}
          </div>
        );
      })}
      {/* The thread from scene 02, drawing itself into the centre. */}
      <div
        style={{
          position: 'absolute',
          left: CX - 1.5,
          top: mix(160, CY, prog(frame, 0, LAND + 6, SMOOTH)),
          width: 3,
          height: mix(760, 0, prog(frame, 0, LAND + 6, SMOOTH)),
          borderRadius: 3,
          backgroundImage: GRADIENT_BRAND.replace('100deg', '180deg'),
        }}
      />
    </>
  );
};

/** A soft brand halo that blooms behind the mark as it lands. */
const Halo = ({ at }: { at: number }) => {
  const frame = useCurrentFrame();
  const t = prog(frame, at, 50, EXPO);
  return (
    <div
      style={{
        position: 'absolute',
        left: CX,
        top: CY,
        width: 900,
        height: 900,
        transform: `translate(-50%, -50%) scale(${mix(0.4, 1, t)})`,
        borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgb(69 212 255 / 0.18), rgb(106 43 255 / 0.08) 55%, transparent 100%)',
        opacity: t * (1 - 0.4 * prog(frame, at + 60, 60)),
      }}
    />
  );
};

const MARK = 320;

/** One soft ring that expands once as the mark lands. */
const Ring = ({ at }: { at: number }) => {
  const frame = useCurrentFrame();
  const t = prog(frame, at, 40, EXPO);
  if (frame < at) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: CX,
        top: CY,
        width: MARK * 1.2,
        height: MARK * 1.2,
        borderRadius: '50%',
        border: `2px solid ${C.blue}`,
        transform: `translate(-50%, -50%) scale(${mix(0.8, 1.7, t)})`,
        opacity: 0.35 * (1 - t),
      }}
    />
  );
};

/**
 * The mark lands once and stays put: a single continuous move with no
 * cross-fades or image swaps, so it reads as one confident gesture. It only
 * eases down in scale when it becomes the hub for the two nodes.
 */
const Reveal = () => {
  const frame = useCurrentFrame();
  const land = prog(frame, LAND, 40, EXPO);
  const toHub = prog(frame, W('an') - 4, 36, SMOOTH);
  const scale = mix(0.82, 1, land) * mix(1, 0.72, toHub);
  return (
    <>
      <Halo at={LAND} />
      <Ring at={LAND + 6} />
      <div
        style={{
          position: 'absolute',
          left: CX,
          top: CY,
          width: MARK * MARK_RATIO,
          height: MARK,
          transform: `translate(-50%, -50%) scale(${scale})`,
          opacity: prog(frame, LAND, 16),
          filter: `drop-shadow(0 30px 50px rgb(35 56 230 / ${0.18 * land}))`,
          willChange: 'transform',
        }}
      >
        <Mark size={MARK} />
      </div>
    </>
  );
};

/** Gap kept clear around the hub mark (its half-size at hub scale, plus air). */
const HUB_CLEAR = 160;

const NODES = [
  { label: 'AI assistant', Icon: Sparkles, x: 450, y: CY, at: W('assistant') },
  { label: 'Your team', Icon: Users, x: 1470, y: CY, at: W('team') },
];

/** The live channels (src/data/channels.ts), on "every channel you already use". */
const ROW: Channel[] = ['web', 'whatsapp', 'instagram', 'messenger', 'telegram', 'discord', 'email'];

const ChannelRow = () => {
  const frame = useCurrentFrame();
  const at = W('every');
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 790, display: 'flex', justifyContent: 'center', gap: 18 }}>
      {ROW.map((ch, i) => {
        const t = prog(frame, at + i * 3, 16, EXPO);
        return (
          <span
            key={ch}
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 76,
              height: 76,
              borderRadius: 22,
              background: C.white,
              border: `1px solid ${C.line}`,
              boxShadow: SHADOW.md,
              opacity: t,
              transform: `translateY(${mix(24, 0, t)}px) scale(${mix(0.8, 1, t)})`,
            }}
          >
            <ChannelGlyph id={ch} size={38} />
          </span>
        );
      })}
    </div>
  );
};

const Hub = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="s3-link" gradientUnits="userSpaceOnUse" x1="400" y1="0" x2="1520" y2="0">
            <stop offset="0%" stopColor={C.cyan} />
            <stop offset="50%" stopColor={C.indigo} />
            <stop offset="100%" stopColor={C.violet} />
          </linearGradient>
        </defs>
        {NODES.map((n, i) => {
          const t = prog(frame, n.at - 6, 22, EXPO);
          // Start on a circle just outside the hub mark, so no line shows
          // through the mark's open centre or behind its edges.
          const len = Math.hypot(n.x - CX, n.y - CY);
          const ux = (n.x - CX) / len;
          const uy = (n.y - CY) / len;
          const x1 = CX + ux * HUB_CLEAR;
          const y1 = CY + uy * HUB_CLEAR;
          const x2 = mix(x1, n.x, t);
          const y2 = mix(y1, n.y, t);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#s3-link)" strokeWidth={4} strokeLinecap="round" opacity={t * 0.55} />;
        })}
      </svg>
      {NODES.map((n, i) => {
        const t = prog(frame, n.at, 18, EXPO);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: n.x,
              top: n.y,
              transform: `translate(-50%, -50%) scale(${mix(0.7, 1, t)})`,
              opacity: t,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 28px 16px 18px',
              borderRadius: 999,
              background: C.white,
              border: `1px solid ${C.line}`,
              boxShadow: SHADOW.lg,
              fontFamily: FONT.sans,
              fontSize: 30,
              fontWeight: 700,
              color: C.ink,
            }}
          >
            <span style={{ display: 'grid', placeItems: 'center', width: 52, height: 52, borderRadius: 26, background: C.accentSoft }}>
              <n.Icon size={28} color={C.accent} />
            </span>
            {n.label}
          </div>
        );
      })}
    </>
  );
};

export const Scene03 = () => (
  <SceneShell length={SCENE03_LENGTH}>
    <Backdrop />
    <Converge />
    <Hub />
    <Reveal />
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 640 }}>
      <Headline variant="chars" text="Meet Truplexy." sync={sayFrames(2, 'Meet')} out={W('an') - 10} size={100} align="center" accent={['TRUPLEXY']} />
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 650 }}>
      <Headline text="An AI Assistant On Every Channel." sync={sayFrames(2, 'An AI Assistant On Every Channel.')} out={W('one') - 12} size={72} align="center" accent={['CHANNEL']} />
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 640 }}>
      <Headline text="One Platform." sync={sayFrames(2, 'One Platform.')} size={96} align="center" accent={['PLATFORM']} />
    </AbsoluteFill>
    <ChannelRow />
  </SceneShell>
);

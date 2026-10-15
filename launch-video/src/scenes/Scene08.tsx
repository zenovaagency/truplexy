import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ArrowRight, CheckCircle2, FileText, Headset, Inbox, Sparkles } from 'lucide-react';
import { Backdrop, SceneShell } from '../components/Stage';
import { Headline } from '../components/Headline';
import { Wordmark } from '../components/Brand';
import { ChannelGlyph } from '../components/ChannelGlyph';
import { C, FONT, SHADOW } from '../theme';
import { EXPO, SMOOTH, mix, prog } from '../animations/motion';
import { f, SCENES, sayFrames, wordAt } from '../timeline';

/**
 * 08 · Final brand moment.
 * Quick callbacks to every scene orbit "Every channel. One platform.", then
 * collapse into the full Truplexy lock-up on white. The end card holds, white, to the last frame.
 */
const S = SCENES[7];
export const SCENE08_LENGTH = f(S.end - S.start);

/** Word cues from the narration (scene 08). */
const W = (word: string) => wordAt(7, word);
/** The lock-up lands on "Truplexy"; the CTA on "Start your free trial". */
export const LOGO = W('truplexy');

const CX = 960;
const CY = 470;

const Chip = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '14px 20px',
      borderRadius: 18,
      background: C.white,
      border: `1px solid ${C.line}`,
      boxShadow: SHADOW.lg,
      fontFamily: FONT.sans,
      fontSize: 20,
      fontWeight: 600,
      color: C.ink,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </div>
);

const CALLBACKS: ReactNode[] = [
  <Chip key="n">
    <ChannelGlyph id="whatsapp" size={24} /> Can I talk to someone?
  </Chip>,
  <Chip key="r">
    <CheckCircle2 size={20} color={C.live} /> Resolved by AI
  </Chip>,
  <Chip key="c">
    <Sparkles size={20} color={C.accent} /> AI summary · intent
  </Chip>,
  <div key="j" style={{ padding: '12px 18px', borderRadius: 18, borderBottomLeftRadius: 6, background: C.surface2, border: `1px solid ${C.line}`, fontFamily: FONT.sans, fontSize: 20, color: C.ink, boxShadow: SHADOW.md, whiteSpace: 'nowrap' }}>
    Yes! It&apos;s available in black.
  </div>,
  <Chip key="s">
    <FileText size={20} color={C.accent} /> Source · Returns and refunds
  </Chip>,
  <Chip key="p">
    <Headset size={20} color={C.human} /> Priya · Billing joined
  </Chip>,
  <Chip key="t">
    <Inbox size={20} color={C.accent} /> One inbox · every channel
  </Chip>,
];

const Orbit = () => {
  const frame = useCurrentFrame();
  const collapse = prog(frame, W('platform') + 12, 24, SMOOTH);
  const spin = mix(0, 0.5, prog(frame, 0, 100, SMOOTH));
  return (
    <>
      {CALLBACKS.map((node, i) => {
        const t = prog(frame, i * 5, 16, EXPO);
        const a = (i / CALLBACKS.length) * Math.PI * 2 - Math.PI / 2 + spin;
        const r = mix(1, 0, collapse);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: CX + Math.cos(a) * 780 * r,
              top: CY + Math.sin(a) * 390 * r,
              transform: `translate(-50%, -50%) scale(${mix(0.8, 1, t) * mix(1, 0.2, collapse)})`,
              opacity: t * (1 - collapse),
            }}
          >
            {node}
          </div>
        );
      })}
    </>
  );
};

const Lockup = () => {
  const frame = useCurrentFrame();
  const t = prog(frame, LOGO - 4, 30, EXPO);
  const halo = prog(frame, LOGO - 6, 60, EXPO);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: CX,
          top: 400,
          width: 1100,
          height: 700,
          transform: `translate(-50%, -50%) scale(${mix(0.5, 1, halo)})`,
          borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgb(69 212 255 / 0.14), rgb(106 43 255 / 0.06) 60%, transparent 100%)',
          opacity: halo,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: CX,
          top: 400,
          transform: `translate(-50%, -50%) scale(${mix(0.86, 1, t)})`,
          opacity: t,
          filter: `blur(${mix(8, 0, t)}px)`,
        }}
      >
        <Wordmark height={170} />
      </div>
    </>
  );
};

const EndCard = () => {
  const frame = useCurrentFrame();
  const tag = prog(frame, LOGO + 18, 20);
  const cta = prog(frame, W('start'), 22);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 548,
          textAlign: 'center',
          fontFamily: FONT.sans,
          fontSize: 50,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: C.ink,
          opacity: tag,
          transform: `translateY(${mix(16, 0, tag)}px)`,
        }}
      >
        Every channel. <span style={{ backgroundImage: 'linear-gradient(95deg, #1F7BFF 0%, #2338E6 45%, #6A2BFF 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>One platform.</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 668,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 28,
          fontFamily: FONT.sans,
          opacity: cta,
          transform: `translateY(${mix(16, 0, cta)}px)`,
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            height: 76,
            padding: '0 36px',
            borderRadius: 999,
            background: C.ink,
            color: '#fff',
            fontSize: 30,
            fontWeight: 700,
            boxShadow: '0 18px 40px rgb(14 18 34 / 0.22)',
          }}
        >
          Start free trial <ArrowRight size={28} />
        </span>
        <span style={{ fontSize: 34, fontWeight: 700, color: C.accent, letterSpacing: '-0.01em' }}>truplexy.com</span>
      </div>
    </>
  );
};

export const Scene08 = () => (
  <SceneShell length={SCENE08_LENGTH} fadeOut={false}>
    <Backdrop />
    <Orbit />
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: 140 }}>
      <Headline text="Every Channel." sync={sayFrames(7, 'Every Channel.')} out={LOGO - 10} size={104} align="center" />
    </AbsoluteFill>
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingTop: 120 }}>
      <Headline text="One Platform." sync={sayFrames(7, 'One Platform.')} out={LOGO - 8} size={104} align="center" accent={['PLATFORM']} />
    </AbsoluteFill>
    <Lockup />
    <EndCard />
  </SceneShell>
);

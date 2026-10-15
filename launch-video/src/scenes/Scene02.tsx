import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { RotateCcw, Unlink } from 'lucide-react';
import { Backdrop, SceneShell } from '../components/Stage';
import { Headline } from '../components/Headline';
import { ChannelGlyph, type Channel } from '../components/ChannelGlyph';
import { C, FONT, GRADIENT_BRAND, SHADOW } from '../theme';
import { EXPO, SMOOTH, mix, msgIn, prog } from '../animations/motion';
import { f, SCENES, wordAt, wordAtNth } from '../timeline';

/**
 * 02 · Disconnected conversations.
 * Life without Truplexy: the same customer on two channels, two unconnected
 * inboxes, and the customer has to start over. The panels are deliberately
 * generic (no Truplexy branding). At the end they slide together and their
 * messages drop onto one gradient line, the path the logo will follow.
 */
const S = SCENES[1];
export const SCENE02_LENGTH = f(S.end - S.start);

/** Word cues from the narration (scene 02). */
const W = (word: string) => wordAt(1, word);
export const JOIN = wordAtNth(1, 'again', 1) - 12;

const Line = ({ who, at, children }: { who: 'customer' | 'business'; at: number; children: ReactNode }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const mine = who === 'customer';
  return (
    <div
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '84%',
        padding: '14px 18px',
        borderRadius: 20,
        fontSize: 21,
        lineHeight: 1.4,
        background: mine ? C.ink : C.surface2,
        color: mine ? '#fff' : C.ink,
        border: mine ? 'none' : `1px solid ${C.line}`,
        ...(mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }),
        ...msgIn(frame, at),
      }}
    >
      {children}
    </div>
  );
};

const Panel = ({ ch, title, sub, x, children, enter }: { ch: Channel; title: string; sub: string; x: number; children: ReactNode; enter: number }) => {
  const frame = useCurrentFrame();
  const t = prog(frame, enter, 20);
  // At the end both panels slide toward the centre line and fold away.
  const join = prog(frame, JOIN, 36, SMOOTH);
  const toward = x < 960 ? 1 : -1;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 330,
        width: 640,
        height: 560,
        display: 'flex',
        flexDirection: 'column',
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: 28,
        boxShadow: SHADOW.lg,
        overflow: 'hidden',
        fontFamily: FONT.sans,
        opacity: t * (1 - join),
        transform: `translateY(${mix(40, 0, t)}px) translateX(${join * toward * 300}px) scale(${mix(1, 0.6, join)})`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 24px', borderBottom: `1px solid ${C.line}` }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 14, background: C.surface2 }}>
          <ChannelGlyph id={ch} size={24} />
        </span>
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{title}</div>
          <div style={{ fontSize: 16, color: C.inkFaint, marginTop: 4 }}>{sub}</div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 12, padding: 24, background: C.paper }}>
        {children}
      </div>
    </div>
  );
};

/** The broken link between the two inboxes. */
const Gap = () => {
  const frame = useCurrentFrame();
  const t = prog(frame, W('disconnected'), 18);
  const join = prog(frame, JOIN, 30, SMOOTH);
  return (
    <div
      style={{
        position: 'absolute',
        left: 960,
        top: 610,
        transform: `translate(-50%, -50%) scale(${mix(0.6, 1, t)})`,
        opacity: t * (1 - join),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span style={{ display: 'grid', placeItems: 'center', width: 64, height: 64, borderRadius: 32, background: C.dangerSoft, color: C.danger }}>
        <Unlink size={30} />
      </span>
    </div>
  );
};

/** One gradient line grows down the centre as the panels fold into it. */
const Thread = () => {
  const frame = useCurrentFrame();
  const grow = prog(frame, JOIN + 8, 40, EXPO);
  return (
    <div
      style={{
        position: 'absolute',
        left: 959,
        top: 540 - 380 * grow,
        width: 3,
        height: 760 * grow,
        borderRadius: 3,
        backgroundImage: GRADIENT_BRAND.replace('100deg', '180deg'),
        opacity: grow,
      }}
    />
  );
};

const Restart = ({ at }: { at: number }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  return (
    <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, background: C.dangerSoft, color: C.danger, fontSize: 16, fontWeight: 600, ...msgIn(frame, at) }}>
      <RotateCcw size={16} /> New conversation · no history
    </div>
  );
};

export const Scene02 = () => (
  <SceneShell length={SCENE02_LENGTH}>
    <Backdrop />
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 96 }}>
      <Headline variant="stamp" text="Same Customer." at={W('same')} out={W('new') - 6} size={96} align="center" />
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 96 }}>
      <Headline variant="stamp" text="Different Channel." at={W('new')} out={W('and') - 4} size={96} align="center" />
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 96 }}>
      <Headline variant="stamp" text="Starting Over." at={W('repeating')} out={JOIN} size={96} align="center" accent={['OVER']} />
    </AbsoluteFill>

    <Panel ch="web" title="Website chat" sub="Tuesday · 1:02 PM" x={150} enter={8}>
      <Line who="customer" at={20}>
        Hi! I need to change the delivery address on order #4821.
      </Line>
      <Line who="business" at={40}>
        Sure. What&apos;s the new address?
      </Line>
    </Panel>

    <Panel ch="telegram" title="Telegram" sub="Tuesday · 1:23 PM" x={1130} enter={W('another')}>
      <Line who="customer" at={W('another') + 22}>
        The new address is 14 Elm Street.
      </Line>
      <Line who="business" at={W('customer')}>
        Hi! Which order is this about?
      </Line>
      <Restart at={W('new')} />
      <Line who="customer" at={W('repeating')}>
        …I already told you. Order #4821.
      </Line>
    </Panel>

    <Gap />
    <Thread />
  </SceneShell>
);

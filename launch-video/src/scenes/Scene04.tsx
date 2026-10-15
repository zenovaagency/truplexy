import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Backdrop, SceneShell, Scaled } from '../components/Stage';
import { Headline } from '../components/Headline';
import { Bubble, ChatWidget, Mono, Typing } from '../components/Chat';
import { TelegramPhone, TgBubble } from '../components/Phone';
import { ChannelGlyph } from '../components/ChannelGlyph';
import { Mark } from '../components/Brand';
import { C, FONT, SHADOW } from '../theme';
import { EXPO, SMOOTH, mix, msgIn, prog } from '../animations/motion';
import { f, SCENES, wordAt } from '../timeline';

/**
 * 04 · One conversation, across channels.
 * The site's own "persistent context" story (src/data/demo.ts CONTEXT): James
 * asks about plans on the website on Tuesday and picks it up on Telegram on
 * Wednesday. What Truplexy learned travels with him, visibly. The business
 * here is Truplexy itself (its own sales chat), since the question is about
 * Truplexy's real Starter and Pro plans.
 */
const S = SCENES[3];
export const SCENE04_LENGTH = f(S.end - S.start);

/** Word cues from the narration (scene 04). */
const W = (word: string) => wordAt(3, word);
/** The learned fact leaves the website reply on "Tuesday" and reaches Telegram before "nobody". */
export const MEM_A = W('tuesday') + 6;
export const MEM_B = W('wednesday') + 2;

const DayChip = ({ at, children, x, y }: { at: number; children: ReactNode; x: number; y: number }) => {
  const frame = useCurrentFrame();
  const t = prog(frame, at, 16);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, 0) translateY(${mix(10, 0, t)}px)`,
        opacity: t,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 18px',
        borderRadius: 999,
        background: C.white,
        border: `1px solid ${C.line}`,
        boxShadow: SHADOW.sm,
        fontFamily: FONT.sans,
        fontSize: 20,
        fontWeight: 600,
        color: C.inkMuted,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
};

const Row = ({ k, v, at, fresh, glyphs }: { k: string; v: ReactNode; at: number; fresh?: boolean; glyphs?: ReactNode }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const glow = fresh ? 1 - prog(frame, at + 20, 40) : 0;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr',
        gap: 12,
        padding: '14px 4px',
        borderTop: `1px solid ${C.line}`,
        background: `rgb(238 240 255 / ${glow})`,
        ...msgIn(frame, at),
      }}
    >
      <Mono style={{ paddingTop: 3, fontSize: 12.5 }}>{k}</Mono>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 600, color: C.ink }}>
        {glyphs}
        {v}
        {fresh && glow > 0.05 && <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: 4, background: C.accent }} />}
      </span>
    </div>
  );
};

const ContextPanel = () => {
  const frame = useCurrentFrame();
  const t = prog(frame, W('truplexy'), 20);
  const linked = frame >= W('wednesday');
  return (
    <div
      style={{
        position: 'absolute',
        left: 752,
        top: 330,
        width: 416,
        padding: '24px 26px 10px',
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: 24,
        boxShadow: SHADOW.xl,
        fontFamily: FONT.sans,
        opacity: t,
        transform: `translateY(${mix(24, 0, t)}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 23, border: `1px solid ${C.line}`, background: C.surface2 }}>
          <Mark size={26} />
        </span>
        <div>
          <Mono style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Sparkles size={13} color={C.accent} /> What Truplexy knows
          </Mono>
          <div style={{ fontSize: 15, color: C.inkMuted, marginTop: 4 }}>One customer · one shared history</div>
        </div>
      </div>
      <Row k="Customer" v="James Wong" at={W('truplexy') + 8} />
      <Row k="Company" v="Team of 3" at={W('truplexy') + 8} />
      <Row
        k="Channels"
        v={linked ? 'Website, Telegram' : 'Website chat'}
        at={W('truplexy') + 8}
        fresh={linked}
        glyphs={
          <>
            <ChannelGlyph id="web" size={17} />
            {linked && <ChannelGlyph id="telegram" size={17} />}
          </>
        }
      />
      <Row k="Interest" v={<span style={{ color: C.accent }}>Starter plan</span>} at={MEM_A + 26} fresh />
      <Preserved />
    </div>
  );
};

const Preserved = () => {
  const frame = useCurrentFrame();
  if (frame < W('start')) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: '6px -6px 8px',
        padding: '10px 14px',
        borderRadius: 14,
        background: C.liveSoft,
        color: C.live,
        fontSize: 16,
        fontWeight: 600,
        ...msgIn(frame, W('start')),
      }}
    >
      <CheckCircle2 size={18} /> Context carried over · nothing to repeat
    </div>
  );
};

/** The fact Truplexy learned, travelling: website → shared context → Telegram. */
const Memory = () => {
  const frame = useCurrentFrame();
  const a = prog(frame, MEM_A, 26, SMOOTH);
  const b = prog(frame, MEM_B, 28, SMOOTH);
  if (frame < MEM_A || frame > MEM_B + 40) return null;
  const p0 = { x: 470, y: 700 };
  const p1 = { x: 960, y: 640 };
  const p2 = { x: 1500, y: 660 };
  const x = b > 0 ? mix(p1.x, p2.x, b) : mix(p0.x, p1.x, a);
  const y = (b > 0 ? mix(p1.y, p2.y, b) : mix(p0.y, p1.y, a)) - Math.sin((b > 0 ? b : a) * Math.PI) * 90;
  const fade = Math.min(prog(frame, MEM_A, 8), 1 - prog(frame, MEM_A + 28, 10) + (b > 0 ? 1 : 0), 1 - prog(frame, MEM_B + 28, 10));
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        opacity: fade,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 18px',
        borderRadius: 999,
        background: C.accent,
        color: '#fff',
        fontFamily: FONT.sans,
        fontSize: 18,
        fontWeight: 600,
        boxShadow: '0 14px 30px rgb(35 56 230 / 0.35)',
        whiteSpace: 'nowrap',
      }}
    >
      <Sparkles size={16} /> Starter plan · team of 3
    </div>
  );
};

export const Scene04 = () => {
  const frame = useCurrentFrame();
  const widgetIn = prog(frame, 6, 20);
  const phoneIn = prog(frame, W('messaging'), 24, EXPO);
  return (
    <SceneShell length={SCENE04_LENGTH}>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 80 }}>
        <Headline variant="slide" text="Different Channels." at={12} out={W('ask') - 16} size={84} align="center" />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 80 }}>
        <Headline variant="slide" text="One Continuous Conversation." at={W('ask') - 4} size={84} align="center" accent={['CONTINUOUS']} />
      </AbsoluteFill>

      <DayChip at={10} x={397} y={236}>
        <ChannelGlyph id="web" size={20} /> Website · Tuesday
      </DayChip>
      <Scaled s={1.25} style={{ left: 110, top: 300, opacity: widgetIn, translate: `0 ${mix(30, 0, widgetIn)}px` }}>
        <ChatWidget store="Truplexy" sub="Website chat · truplexy.com" status={<Mono>Sales chat</Mono>} height={460}>
          <Bubble who="ai" at={24}>
            Hi! I&apos;m the Truplexy assistant. Ask me anything about plans, channels or setup.
          </Bubble>
          <Bubble who="customer" at={W('ask')}>
            Which plan would be best for my team?
          </Bubble>
          <Typing from={W('ask') + 10} to={W('tuesday')} />
          <Bubble who="ai" at={W('tuesday')}>
            For a team of three, Starter covers the core support features. Pro mainly adds advanced automation.
          </Bubble>
        </ChatWidget>
      </Scaled>

      <ContextPanel />

      <DayChip at={W('messaging') + 2} x={1517} y={222}>
        <ChannelGlyph id="telegram" size={20} /> Telegram · Wednesday
      </DayChip>
      <Scaled s={1.1} style={{ left: 1330, top: 270, opacity: phoneIn, translate: `${mix(80, 0, phoneIn)}px 0` }}>
        <TelegramPhone day="Wednesday" height={570} title="Truplexy" sub="bot" avatar={<Mark size={20} />}>
          <TgBubble out at={W('telegram')} time="10:12">
            What was the plan you suggested?
          </TgBubble>
          <TgBubble at={W('nobody')} time="10:12">
            The plan we discussed earlier was <b style={{ color: '#3390ec' }}>Starter</b>. It includes the core support features without the advanced automation in Pro.
          </TgBubble>
        </TelegramPhone>
      </Scaled>

      <Memory />
    </SceneShell>
  );
};

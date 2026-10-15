import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Clock3 } from 'lucide-react';
import { Backdrop, SceneShell } from '../components/Stage';
import { Headline } from '../components/Headline';
import { ChannelGlyph, type Channel } from '../components/ChannelGlyph';
import { C, FONT, GRADIENT_BRAND, SHADOW } from '../theme';
import { EXPO, SMOOTH, mix, msgIn, prog } from '../animations/motion';
import { f, SCENES, sayFrames, wordAt } from '../timeline';

/**
 * 02 · Juggling apps.
 * Life without Truplexy: three separate inboxes, each in its own app, that the
 * team has to jump between. Each window takes focus as it is named, unread
 * counts keep climbing, one message goes unanswered ("missed") and another
 * customer sits waiting. The windows are deliberately generic (no Truplexy
 * branding). At the end they fold into one gradient line, the path the logo
 * will follow.
 */
const S = SCENES[1];
export const SCENE02_LENGTH = f(S.end - S.start);

/** Word cues from the narration (scene 02). */
const W = (word: string) => wordAt(1, word);
export const MISSED = W('missed');
export const WAITING = W('waiting');
export const JOIN = WAITING + 4;

interface Msg {
  who: string;
  text: string;
  missed?: boolean;
  waiting?: boolean;
}

interface App {
  ch: Channel;
  title: string;
  x: number;
  /** Frame the window opens. */
  enter: number;
  /** Frame the window is named in the narration and takes focus. */
  focus: number;
  msgs: Msg[];
}

export const APPS: App[] = [
  {
    ch: 'web',
    title: 'Website inbox',
    x: 120,
    enter: W('jumping'),
    focus: W('website'),
    msgs: [
      { who: 'Sofia', text: 'Do you ship to Canada?' },
      { who: 'Mark', text: 'Where is my order?', missed: true },
      { who: 'Lena', text: 'Is this in stock?' },
    ],
  },
  {
    ch: 'whatsapp',
    title: 'WhatsApp',
    x: 700,
    enter: W('between'),
    focus: W('whatsapp'),
    msgs: [
      { who: 'Priya', text: 'Can I change my address?' },
      { who: 'Omar', text: 'Hello? Anyone there?' },
      { who: 'Ana', text: 'Any discount codes?' },
    ],
  },
  {
    ch: 'instagram',
    title: 'Instagram',
    x: 1280,
    enter: W('apps'),
    focus: W('instagram'),
    msgs: [
      { who: 'nina.s', text: 'Back in Medium yet?' },
      { who: 'leo.k', text: 'How long is delivery?', waiting: true },
      { who: 'j.mart', text: 'Love this! Price?' },
    ],
  },
];

const WIN_W = 520;

/** Which window has focus at a frame (the last one named), or -1 before the first. */
const focusedAt = (frame: number) => APPS.reduce((acc, a, i) => (frame >= a.focus ? i : acc), -1);

const Row = ({ m, at }: { m: Msg; at: number }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const grey = m.missed ? prog(frame, MISSED, 14) : 0;
  const wait = m.waiting ? prog(frame, WAITING, 14) : 0;
  // The wait clock runs on from 1h 52m.
  const minutes = 112 + Math.max(0, Math.floor((frame - WAITING) / 2));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        borderRadius: 16,
        background: C.white,
        border: `1px solid ${C.line}`,
        ...msgIn(frame, at),
        opacity: prog(frame, at, 13) * mix(1, 0.55, grey),
      }}
    >
      <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 20, background: C.surface3, color: C.inkMuted, fontSize: 16, fontWeight: 700, flex: 'none' }}>
        {m.who[0].toUpperCase()}
      </span>
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{m.who}</div>
        <div style={{ fontSize: 18, color: C.inkMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.text}</div>
      </div>
      {grey > 0 && (
        <span style={{ padding: '4px 10px', borderRadius: 999, background: C.dangerSoft, color: C.danger, fontSize: 14, fontWeight: 700, opacity: grey, whiteSpace: 'nowrap' }}>No reply</span>
      )}
      {wait > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: C.humanSoft, color: C.human, fontSize: 14, fontWeight: 700, opacity: wait, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          <Clock3 size={14} /> {Math.floor(minutes / 60)}h {String(minutes % 60).padStart(2, '0')}m
        </span>
      )}
    </div>
  );
};

const Window = ({ app, index }: { app: App; index: number }) => {
  const frame = useCurrentFrame();
  const t = prog(frame, app.enter, 22, EXPO);
  const focused = focusedAt(frame);
  const isFocus = focused === index;
  const focusT = prog(frame, app.focus, 12);
  // Once another window takes focus this one recedes a little.
  const dim = focused >= 0 && !isFocus ? 1 : 0;
  const join = prog(frame, JOIN, 32, SMOOTH);
  const toward = (960 - (app.x + WIN_W / 2)) / 600;
  const arrived = app.msgs.filter((_, i) => frame >= app.enter + 10 + i * 9).length;
  const unread = arrived === 0 ? 0 : arrived + Math.floor(Math.max(0, frame - app.enter - 30) / 14);
  return (
    <div
      style={{
        position: 'absolute',
        left: app.x,
        top: 320,
        width: WIN_W,
        height: 470,
        display: 'flex',
        flexDirection: 'column',
        background: C.paper,
        border: `1px solid ${isFocus ? C.accent : C.line}`,
        borderRadius: 26,
        boxShadow: isFocus ? `${SHADOW.xl}, 0 0 0 ${4 * focusT}px rgb(35 56 230 / 0.12)` : SHADOW.lg,
        overflow: 'hidden',
        fontFamily: FONT.sans,
        opacity: t * (1 - join) * mix(1, 0.78, dim),
        transform: `translateY(${mix(50, 0, t) - (isFocus ? 10 * focusT : 0)}px) translateX(${join * toward * 420}px) rotate(${mix((index - 1) * 3, 0, t)}deg) scale(${mix(1, 0.55, join) * (isFocus ? mix(1, 1.03, focusT) : 1)})`,
        zIndex: isFocus ? 2 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: C.white, borderBottom: `1px solid ${C.line}` }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 12, background: C.surface2 }}>
          <ChannelGlyph id={app.ch} size={22} />
        </span>
        <span style={{ flex: 1, fontSize: 21, fontWeight: 700, color: C.ink }}>{app.title}</span>
        {unread > 0 && (
          <span style={{ display: 'grid', placeItems: 'center', minWidth: 34, height: 30, padding: '0 10px', borderRadius: 999, background: C.danger, color: '#fff', fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {unread}
          </span>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 18 }}>
        {app.msgs.map((m, i) => (
          <Row key={i} m={m} at={app.enter + 10 + i * 9} />
        ))}
      </div>
    </div>
  );
};

/** One gradient line grows down the centre as the windows fold into it. */
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

export const Scene02 = () => (
  <SceneShell length={SCENE02_LENGTH}>
    <Backdrop />
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 110 }}>
      <Headline text="Jumping Between Apps." sync={sayFrames(1, 'Jumping Between Apps.')} out={W('messages') - 14} size={92} align="center" />
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 110 }}>
      <Headline text="Messages Get Missed." sync={sayFrames(1, 'Messages Get Missed.')} out={W('customers') - 12} size={92} align="center" accent={['MISSED']} />
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 110 }}>
      <Headline text="Customers Left Waiting." sync={sayFrames(1, 'Customers Left Waiting.')} out={JOIN + 6} size={92} align="center" accent={['WAITING']} />
    </AbsoluteFill>

    {APPS.map((a, i) => (
      <Window key={a.ch} app={a} index={i} />
    ))}
    <Thread />
  </SceneShell>
);

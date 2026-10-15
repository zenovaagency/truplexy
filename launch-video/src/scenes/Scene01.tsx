import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Inbox } from 'lucide-react';
import { Backdrop, SceneShell } from '../components/Stage';
import { Headline } from '../components/Headline';
import { ChannelGlyph, CHANNEL_NAME, type Channel } from '../components/ChannelGlyph';
import { C, FONT, SHADOW } from '../theme';
import { EXPO, SMOOTH, mix, prog, tween } from '../animations/motion';
import { f, SCENES, wordAt } from '../timeline';

/**
 * 01 · Your customers never stop asking.
 * One notification, then another, then a flood from every live channel. The
 * frame gets busy but stays composed: cards stack in shallow depth while the
 * camera pushes in slowly.
 */
const S = SCENES[0];
export const SCENE01_LENGTH = f(S.end - S.start);

interface Note {
  ch: Channel;
  who: string;
  text: string;
  /** Arrival frame. */
  at: number;
  x: number;
  y: number;
  /** Depth: 0 = front, 1 = far back. */
  z: number;
  tilt: number;
}

/** Word cues from the narration (scene 01). */
const W = (word: string) => wordAt(0, word);
export const BUT = W('but');

/**
 * Cards land on the narration: the first on "Your customers", one each on
 * "website", "WhatsApp" and "Instagram", then the flood after "But…".
 */
export const NOTES: Note[] = [
  { ch: 'web', who: 'Sarah M.', text: 'Where is my order?', at: W('your'), x: 1120, y: 330, z: 0, tilt: -1.5 },
  { ch: 'whatsapp', who: 'Lucas', text: 'Can I talk to someone?', at: W('whatsapp'), x: 1380, y: 520, z: 0.1, tilt: 1.2 },
  { ch: 'instagram', who: 'chloe.d', text: 'Is this available?', at: W('instagram'), x: 1010, y: 640, z: 0.15, tilt: -0.8 },
  { ch: 'messenger', who: 'Leo F.', text: 'What are your delivery charges?', at: W('questions'), x: 1420, y: 250, z: 0.2, tilt: 2 },
  { ch: 'telegram', who: 'Farhan', text: 'Hello? Anyone there?', at: W('anytime'), x: 1180, y: 770, z: 0.05, tilt: -2 },
  { ch: 'email', who: 'James W.', text: 'Which plan fits a team of three?', at: W('everywhere'), x: 1010, y: 150, z: 0.45, tilt: 1 },
  { ch: 'discord', who: 'emma_r', text: 'Do you ship to Germany?', at: BUT + 3, x: 1560, y: 690, z: 0.35, tilt: -1.4 },
  { ch: 'web', who: 'Daniel P.', text: 'I was charged twice.', at: W('website'), x: 1250, y: 420, z: 0.55, tilt: 0.6 },
  { ch: 'whatsapp', who: 'Priya', text: 'Can I change my address?', at: BUT + 12, x: 1600, y: 380, z: 0.6, tilt: 2.2 },
  { ch: 'instagram', who: 'nina.s', text: 'Back in Medium yet?', at: BUT + 20, x: 860, y: 820, z: 0.5, tilt: -1.8 },
  { ch: 'messenger', who: 'Omar', text: 'Still waiting on a reply…', at: BUT + 28, x: 1500, y: 130, z: 0.7, tilt: -0.5 },
  { ch: 'telegram', who: 'Ana', text: 'Is the sale still on?', at: BUT + 35, x: 1060, y: 900, z: 0.65, tilt: 1.6 },
  { ch: 'email', who: 'Ryan C.', text: 'Can I move my renewal date?', at: BUT + 42, x: 1700, y: 560, z: 0.8, tilt: -2.4 },
  { ch: 'discord', who: 'kai', text: 'Hello??', at: BUT + 48, x: 1020, y: 560, z: 0.85, tilt: 2.6 },
];

const NoteCard = ({ n }: { n: Note }) => {
  const frame = useCurrentFrame();
  if (frame < n.at) return null;
  const t = prog(frame, n.at, 16, EXPO);
  const depth = mix(1, 0.72, n.z);
  return (
    <div
      style={{
        position: 'absolute',
        left: n.x,
        top: n.y,
        width: 380,
        transform: `translate(-50%, -50%) translateY(${mix(40, 0, t)}px) scale(${depth * mix(0.9, 1, t)}) rotate(${n.tilt}deg)`,
        opacity: t * mix(1, 0.55, n.z),
        filter: n.z > 0.5 ? `blur(${(n.z - 0.5) * 3}px)` : undefined,
        zIndex: Math.round((1 - n.z) * 100),
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        padding: '18px 20px',
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: 20,
        boxShadow: SHADOW.lg,
        fontFamily: FONT.sans,
      }}
    >
      <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 14, background: C.surface2, flex: 'none' }}>
        <ChannelGlyph id={n.ch} size={24} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: C.inkFaint, fontWeight: 600 }}>
          <span>
            {CHANNEL_NAME[n.ch]} · {n.who}
          </span>
          <span style={{ fontWeight: 500 }}>now</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 21, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{n.text}</div>
      </div>
    </div>
  );
};

/** The unread counter: the number the team is falling behind by. */
const Unread = () => {
  const frame = useCurrentFrame();
  const arrived = NOTES.filter((n) => frame >= n.at).length;
  const count = arrived === 0 ? 0 : arrived * 2 + Math.floor(Math.max(0, frame - (BUT + 48)) / 9);
  const t = prog(frame, 6, 16);
  const pulse = NOTES.some((n) => frame >= n.at && frame < n.at + 6) ? 1.08 : 1;
  return (
    <div
      style={{
        position: 'absolute',
        left: 120,
        top: 640,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 22px 14px 18px',
        borderRadius: 999,
        background: C.white,
        border: `1px solid ${C.line}`,
        boxShadow: SHADOW.md,
        fontFamily: FONT.sans,
        opacity: t,
        transform: `translateY(${mix(16, 0, t)}px)`,
      }}
    >
      <Inbox size={26} color={C.accent} />
      <span style={{ fontSize: 24, fontWeight: 600, color: C.inkMuted }}>Unread</span>
      <span
        style={{
          minWidth: 52,
          padding: '4px 14px',
          borderRadius: 999,
          background: count > 12 ? C.danger : C.accent,
          color: '#fff',
          fontSize: 24,
          fontWeight: 700,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
          transform: `scale(${pulse})`,
        }}
      >
        {count}
      </span>
    </div>
  );
};

export const Scene01 = () => {
  const frame = useCurrentFrame();
  // A slow push-in across the scene, easing into a held frame at the end.
  const push = tween(frame, [0, SCENE01_LENGTH], [1, 1.08], SMOOTH);
  return (
    <SceneShell length={SCENE01_LENGTH} fadeIn={false}>
      <Backdrop />
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '70% 50%' }}>
        {NOTES.map((n, i) => (
          <NoteCard key={i} n={n} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ padding: '200px 0 0 120px' }}>
        <Headline variant="rise" text={"Your Customers\nDon't Stop\nAsking."} at={W('your')} out={BUT - 14} size={92} accent={['ASKING']} />
      </AbsoluteFill>
      <AbsoluteFill style={{ padding: '200px 0 0 120px' }}>
        <Headline variant="rise" text={"But Your Team\nCan't Be\nEverywhere."} at={BUT} size={92} accent={['EVERYWHERE']} />
      </AbsoluteFill>
      <Unread />
    </SceneShell>
  );
};

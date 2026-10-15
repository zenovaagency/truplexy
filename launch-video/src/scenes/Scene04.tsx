import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Backdrop, SceneShell, Scaled } from '../components/Stage';
import { Headline } from '../components/Headline';
import { AppShell, Avatar, Badge, Count } from '../components/Dashboard';
import { Mono } from '../components/Chat';
import { ChannelGlyph, CHANNEL_NAME, type Channel } from '../components/ChannelGlyph';
import { C, SHADOW } from '../theme';
import { EXPO, mix, msgIn, prog } from '../animations/motion';
import { f, SCENES, sayFrames, wordAt } from '../timeline';

/**
 * 04 · One inbox.
 * The dashboard's Tickets page (the site's "Unified inbox"): conversations
 * from every channel land side by side, one row each as the channel is named.
 * Then the three things the team sees at a glance: what the AI already
 * resolved, what a customer needs (AI summary and intent), and what is
 * waiting for a person. Every row is a different customer on one channel;
 * all of it is sample data.
 */
const S = SCENES[3];
export const SCENE04_LENGTH = f(S.end - S.start);

/** Word cues from the narration (scene 04). */
const W = (word: string) => wordAt(3, word);
export const HANDLED = W('handled');
export const SELECT = W('each');
export const WAITING = W('waiting');

type Status = 'ai' | 'resolved' | 'human';
const STATUS: Record<Status, { label: string; tone: 'violet' | 'live' | 'warn' }> = {
  ai: { label: 'AI handling', tone: 'violet' },
  resolved: { label: 'Resolved', tone: 'live' },
  human: { label: 'Human handoff', tone: 'warn' },
};

interface Ticket {
  ch: Channel;
  name: string;
  initials: string;
  color: string;
  text: string;
  status: Status;
  time: string;
  at: number;
}

export const TICKETS: Ticket[] = [
  { ch: 'web', name: 'Sofia Reyes', initials: 'SR', color: '#0b6e86', text: 'Do you ship to Canada?', status: 'resolved', time: '1m', at: W('website') },
  { ch: 'whatsapp', name: 'Priya Shah', initials: 'PS', color: '#7a3cd6', text: 'Can I change my delivery address?', status: 'ai', time: '2m', at: W('whatsapp') },
  { ch: 'instagram', name: 'Nina Scott', initials: 'NS', color: '#c2410c', text: 'Is the jacket back in Medium?', status: 'resolved', time: '4m', at: W('instagram') },
  { ch: 'telegram', name: 'Leo Kim', initials: 'LK', color: '#1d4ed8', text: 'I was charged twice for my order.', status: 'human', time: '6m', at: W('telegram') },
  { ch: 'messenger', name: 'Omar Haddad', initials: 'OH', color: '#15803d', text: 'Where is order #2219?', status: 'resolved', time: '9m', at: W('every') },
  { ch: 'email', name: 'Ryan Cole', initials: 'RC', color: '#9a4b00', text: 'Can I get an invoice for March?', status: 'ai', time: '12m', at: W('conversation') },
];
const SELECTED = 1;
const WAITING_ROW = 3;

const TicketRow = ({ t, index }: { t: Ticket; index: number }) => {
  const frame = useCurrentFrame();
  if (frame < t.at) return null;
  const handled = frame >= HANDLED && frame < SELECT + 20;
  const resolvedGlow = t.status === 'resolved' ? prog(frame, HANDLED, 10) * (1 - prog(frame, SELECT + 10, 14)) : 0;
  const dimOthers = handled && t.status !== 'resolved' ? prog(frame, HANDLED, 10) * (1 - prog(frame, SELECT + 10, 14)) : 0;
  const selected = index === SELECTED ? prog(frame, SELECT, 12) : 0;
  const waiting = index === WAITING_ROW ? prog(frame, WAITING, 12) : 0;
  const pulse = waiting > 0 ? 0.5 + 0.5 * Math.sin(((frame - WAITING) / 30) * Math.PI * 2) : 0;
  const bg =
    selected > 0
      ? `rgb(238 240 255 / ${selected})`
      : waiting > 0
        ? `rgb(255 241 221 / ${waiting})`
        : resolvedGlow > 0
          ? `rgb(230 246 235 / ${resolvedGlow})`
          : C.white;
  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '36px 1fr auto',
        alignItems: 'center',
        gap: 12,
        padding: '13px 16px',
        borderBottom: `1px solid ${C.line}`,
        background: bg,
        boxShadow: waiting > 0 ? `inset 0 0 0 ${1.5 + pulse}px rgb(154 75 0 / ${0.35 + 0.3 * pulse})` : 'none',
        ...msgIn(frame, t.at, 14),
        opacity: prog(frame, t.at, 14) * (1 - dimOthers * 0.5),
      }}
    >
      {selected > 0 && <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: '0 3px 3px 0', background: C.accent, opacity: selected }} />}
      <Avatar initials={t.initials} color={t.color} size={36} />
      <div style={{ minWidth: 0, lineHeight: 1.3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600, color: C.ink }}>
          {t.name}
          <ChannelGlyph id={t.ch} size={14} />
          <span style={{ fontSize: 11.5, fontWeight: 500, color: C.inkFaint }}>{CHANNEL_NAME[t.ch]}</span>
        </div>
        <div style={{ fontSize: 13, color: C.inkMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.text}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ fontSize: 11, color: C.inkFaint }}>{t.time}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {waiting > 0 && (
            <span style={{ opacity: waiting }}>
              <Count n={2} accent />
            </span>
          )}
          <Badge tone={STATUS[t.status].tone} dot>
            {STATUS[t.status].label}
          </Badge>
        </span>
      </div>
    </div>
  );
};

/** Right-hand ticket detail: the AI summary and intent for the selected customer. */
const Detail = () => {
  const frame = useCurrentFrame();
  const t = prog(frame, SELECT, 18, EXPO);
  const tk = TICKETS[SELECTED];
  if (frame < SELECT) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: C.inkFaint, fontSize: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color={C.inkFaint} /> Select a ticket to see its summary
        </span>
      </div>
    );
  }
  return (
    <div style={{ padding: '22px 26px', opacity: t, transform: `translateX(${mix(24, 0, t)}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar initials={tk.initials} color={tk.color} size={42} />
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{tk.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.inkFaint }}>
            <ChannelGlyph id={tk.ch} size={13} /> {CHANNEL_NAME[tk.ch]} · {tk.time} ago
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <Badge tone="violet" dot>
          AI handling
        </Badge>
      </div>

      <div style={{ marginTop: 20, padding: '16px 18px', borderRadius: 14, background: C.accentSoft, ...msgIn(frame, SELECT + 6) }}>
        <Mono style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.accent }}>
          <Sparkles size={12} /> AI summary
        </Mono>
        <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.5, color: C.ink }}>
          Priya wants a new delivery address on order #3104. It hasn&apos;t shipped, so the AI is updating it.
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 12, fontSize: 14, ...msgIn(frame, SELECT + 12) }}>
        <Mono style={{ fontSize: 11 }}>Intent</Mono>
        <span style={{ fontWeight: 600 }}>Change delivery address</span>
        <Mono style={{ fontSize: 11 }}>Order</Mono>
        <span style={{ fontWeight: 600 }}>#3104 · not dispatched</span>
        <Mono style={{ fontSize: 11 }}>Handoff</Mono>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: C.live }}>
          <CheckCircle2 size={15} /> Not needed
        </span>
      </div>
    </div>
  );
};

const Inbox = () => {
  const frame = useCurrentFrame();
  const arrived = TICKETS.filter((t) => frame >= t.at).length;
  const open = TICKETS.filter((t) => frame >= t.at && t.status !== 'resolved').length;
  return (
    <AppShell active="tickets" ticketCount={open} width={1280} height={640}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        <div style={{ width: 560, flex: 'none', borderRight: `1px solid ${C.line}`, background: C.white, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px' }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>Tickets</span>
            <Count n={arrived} />
            <span style={{ flex: 1 }} />
            <Badge style={{ border: `1px solid ${C.line}`, background: C.white }}>All channels</Badge>
          </div>
          <div style={{ borderTop: `1px solid ${C.line}` }}>
            {TICKETS.map((t, i) => (
              <TicketRow key={t.name} t={t} index={i} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Detail />
        </div>
      </div>
    </AppShell>
  );
};

export const Scene04 = () => {
  const frame = useCurrentFrame();
  const t = prog(frame, 0, 22, EXPO);
  return (
    <SceneShell length={SCENE04_LENGTH}>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 58 }}>
        <Headline text="Every Conversation. One Inbox." sync={sayFrames(3, 'Every Conversation. One Inbox.')} out={W('all') - 14} size={76} align="center" accent={['INBOX']} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 58 }}>
        <Headline text="All From One Place." sync={sayFrames(3, 'All From One Place.')} size={76} align="center" accent={['PLACE']} />
      </AbsoluteFill>
      <Scaled s={1.2} style={{ left: 192, top: 196, opacity: t, translate: `0 ${mix(40, 0, t)}px`, borderRadius: 18, boxShadow: SHADOW.xl }}>
        <Inbox />
      </Scaled>
    </SceneShell>
  );
};

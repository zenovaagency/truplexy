import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ArrowRight, Globe, Headset } from 'lucide-react';
import { Backdrop, SceneShell, Scaled } from '../components/Stage';
import { Headline } from '../components/Headline';
import { AppShell, Avatar, Badge } from '../components/Dashboard';
import { Bubble, ChatWidget, EventPill, Mono, Typing } from '../components/Chat';
import { C, FONT } from '../theme';
import { SMOOTH, mix, msgIn, prog } from '../animations/motion';
import { f, SCENES, wordAt, wordAtNth } from '../timeline';

/**
 * 07 · AI efficiency, human connection.
 * Left: what the customer sees. Right: the same conversation in the
 * dashboard's ticket view (features/tickets/TicketDetail.tsx), where the
 * handoff packet assembles (fields from the site's DAY handoff packet), the
 * ticket is handed to Priya, and she replies with the whole thread in front
 * of her.
 */
const S = SCENES[6];
export const SCENE07_LENGTH = f(S.end - S.start);

/** Word cues from the narration (scene 07). */
const W = (word: string) => wordAt(6, word);
/** The thread is carried into the dashboard while she sets up the line. */
export const CARRY = 52;
/** "Truplexy brings your team in" */
export const HANDOFF = W('brings');
const ASSIGNED = W('team');
/** "with the conversation and context already there": the packet assembles. */
const PACKET = W('conversation');
/** "No repeating. No starting over." Priya types, then replies. */
const AGENT_TYPING = W('no');
export const AGENT_REPLY = wordAtNth(6, 'no', 1);
const REPLY = "Hi! I've reviewed your request. Let me help.";

const Prop = ({ k, v, at }: { k: string; v: ReactNode; at: number }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  return (
    <div style={{ padding: '9px 0', borderTop: `1px solid ${C.line}`, ...msgIn(frame, at) }}>
      <Mono style={{ fontSize: 9.5 }}>{k}</Mono>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3, color: C.ink }}>{v}</div>
    </div>
  );
};

const TicketDetail = () => {
  const frame = useCurrentFrame();
  const handed = frame >= HANDOFF;
  const assigned = frame >= ASSIGNED;
  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: FONT.sans }}>
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: C.white }}>
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Special refund request</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Badge tone="accent" dot>
              Open
            </Badge>
            <Badge tone="danger">High</Badge>
            {handed ? (
              <Badge tone="warn" style={msgIn(frame, HANDOFF)}>
                Handed off
              </Badge>
            ) : (
              <Badge tone="violet">AI handling</Badge>
            )}
            <Badge style={{ border: `1px solid ${C.line}`, background: C.white }}>
              <Globe size={11} color={C.accent} /> Website chat
            </Badge>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10, padding: '16px 22px', background: C.paper }}>
          <div style={{ alignSelf: 'center', fontSize: 11, color: C.inkFaint, fontWeight: 600 }}>Today</div>
          <Bubble app who="customer" at={CARRY + 18}>
            I need help with a special refund request.
          </Bubble>
          <Bubble app who="ai" at={CARRY + 26} author="Truplexy">
            Let me connect you with our support team.
          </Bubble>
          {frame >= HANDOFF && (
            <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: C.humanSoft, color: C.human, fontSize: 11.5, fontWeight: 600, ...msgIn(frame, HANDOFF) }}>
              <Headset size={12} /> Handed to Priya · Billing · full thread attached
            </div>
          )}
          <Typing app who="agent" from={AGENT_TYPING} to={AGENT_REPLY} />
          <Bubble app who="agent" at={AGENT_REPLY} author="Priya · Billing">
            {REPLY}
          </Bubble>
        </div>
        <div style={{ padding: '12px 22px', borderTop: `1px solid ${C.line}`, background: C.white }}>
          <div style={{ height: 38, borderRadius: 10, border: `1px solid ${C.line}`, padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 13, color: C.inkFaint }}>
            {assigned && frame < AGENT_REPLY ? 'Priya is typing…' : 'Write a reply…'}
          </div>
        </div>
      </section>
      <aside style={{ width: 300, flex: 'none', borderLeft: `1px solid ${C.line}`, padding: '16px 18px', background: C.paper }}>
        <Mono style={{ fontSize: 10.5, color: C.accent }}>Handoff packet</Mono>
        <div style={{ marginTop: 8 }}>
          <Prop k="Customer" v="Daniel Park · Pro subscription" at={PACKET} />
          <Prop k="History" v="Website chat · 2 messages" at={PACKET + 8} />
          <Prop k="Intent" v="Refund request" at={PACKET + 16} />
          <Prop k="Previous actions" v="Account verified · order located" at={PACKET + 24} />
          <Prop k="Suggested next step" v="Review the refund with billing" at={PACKET + 32} />
          <div style={{ padding: '10px 0', borderTop: `1px solid ${C.line}` }}>
            <Mono style={{ fontSize: 9.5 }}>Assignee</Mono>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, fontSize: 13, fontWeight: 600 }}>
              {assigned ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, ...msgIn(frame, ASSIGNED) }}>
                  <Avatar initials="PN" color="#0b6e86" size={26} /> Priya Nair · Billing
                </span>
              ) : (
                <span style={{ color: C.inkFaint }}>Unassigned</span>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

/** The conversation travelling from the chat into the team's workspace. */
const Carry = () => {
  const frame = useCurrentFrame();
  const t = prog(frame, CARRY, 26, SMOOTH);
  if (frame < CARRY || frame > CARRY + 38) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: mix(470, 860, t),
        top: mix(760, 640, t) - Math.sin(t * Math.PI) * 60,
        transform: 'translate(-50%, -50%)',
        opacity: Math.min(prog(frame, CARRY, 6), 1 - prog(frame, CARRY + 28, 10)),
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
      Thread + context <ArrowRight size={18} />
    </div>
  );
};

export const Scene07 = () => {
  const frame = useCurrentFrame();
  const widgetIn = prog(frame, 2, 20);
  const appIn = prog(frame, CARRY - 8, 28);
  return (
    <SceneShell length={SCENE07_LENGTH}>
      <Backdrop />
      <AbsoluteFill style={{ padding: '78px 0 0 96px' }}>
        <Headline variant="type" text="AI When It Can." at={8} out={W('truplexy') - 12} size={76} />
      </AbsoluteFill>
      <AbsoluteFill style={{ padding: '78px 0 0 96px' }}>
        <Headline variant="type" text="Humans When They Matter." at={W('truplexy')} size={76} accent={['MATTER']} />
      </AbsoluteFill>

      <Scaled s={1.15} style={{ left: 96, top: 236, opacity: widgetIn, translate: `0 ${mix(30, 0, widgetIn)}px` }}>
        <ChatWidget width={440} height={560}>
          <Bubble who="customer" at={8}>
            I need help with a special refund request.
          </Bubble>
          <Typing from={16} to={40} />
          <Bubble who="ai" at={40}>
            Let me connect you with our support team.
          </Bubble>
          <EventPill at={HANDOFF + 6}>Priya · Billing joined · full thread attached</EventPill>
          <Typing who="agent" from={AGENT_TYPING} to={AGENT_REPLY} />
          <Bubble who="agent" at={AGENT_REPLY} author="Priya · Billing">
            {REPLY}
          </Bubble>
        </ChatWidget>
      </Scaled>

      <div
        style={{
          position: 'absolute',
          left: 690,
          top: 236,
          opacity: appIn,
          transform: `perspective(2200px) rotateY(${mix(-8, -3, appIn)}deg) translateX(${mix(80, 0, appIn)}px)`,
          transformOrigin: 'right center',
        }}
      >
        <Scaled s={0.85} style={{ position: 'relative' }}>
          <AppShell active="tickets" width={1280} height={790}>
            <TicketDetail />
          </AppShell>
        </Scaled>
      </div>
      <Carry />
    </SceneShell>
  );
};

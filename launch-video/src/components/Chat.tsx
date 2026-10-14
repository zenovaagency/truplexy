import type { CSSProperties, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { Globe, Headset } from 'lucide-react';
import { C, FONT, SHADOW } from '../theme';
import { Mark } from './Brand';
import { msgIn } from '../animations/motion';

/**
 * Chat primitives, matching the site's .bubble styles (global.css) and the
 * dashboard's (the .app-demo overrides). All sizes are in the site's px; wrap
 * in <Scaled> to bring them to video size.
 */
export type Who = 'customer' | 'ai' | 'agent';

const SITE: Record<Who, CSSProperties> = {
  customer: { alignSelf: 'flex-end', background: C.accent, color: '#fff', borderBottomRightRadius: 6 },
  ai: { alignSelf: 'flex-start', background: C.surface2, color: C.ink, border: `1px solid ${C.line}`, borderBottomLeftRadius: 6 },
  agent: {
    alignSelf: 'flex-start',
    background: C.humanSoft,
    color: C.ink,
    border: '1px solid rgb(154 75 0 / 0.25)',
    borderBottomLeftRadius: 6,
  },
};

/** The dashboard flips sides: the customer is on the left, the business on the right. */
const APP: Record<Who, CSSProperties> = {
  customer: { alignSelf: 'flex-start', background: C.surface2, color: C.ink, border: `1px solid ${C.line}`, borderBottomLeftRadius: 5 },
  ai: { alignSelf: 'flex-end', background: C.accentSoft, color: C.ink, border: '1px solid rgb(35 56 230 / 0.2)', borderBottomRightRadius: 5 },
  agent: { alignSelf: 'flex-end', background: C.accent, color: '#fff', borderBottomRightRadius: 5 },
};

export const Bubble = ({
  who,
  children,
  at,
  author,
  app = false,
  style,
}: {
  who: Who;
  children: ReactNode;
  /** Frame (in the parent's timeline) the bubble arrives on. */
  at: number;
  author?: string;
  app?: boolean;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  return (
    <div
      style={{
        maxWidth: app ? '82%' : '86%',
        padding: app ? '9.6px 13.6px' : '10px 14.4px',
        borderRadius: app ? 16 : 18,
        fontSize: app ? 13 : 15,
        lineHeight: 1.5,
        fontFamily: FONT.sans,
        ...(app ? APP : SITE)[who],
        ...msgIn(frame, at),
        ...style,
      }}
    >
      {author && (
        <span style={{ display: 'block', marginBottom: 2, fontSize: 11.5, fontWeight: 600, color: who === 'agent' && app ? 'rgb(255 255 255 / .8)' : C.inkFaint }}>
          {author}
        </span>
      )}
      {children}
    </div>
  );
};

/** Three dots, bouncing like the site's .typing, but driven by the frame. */
export const Typing = ({ from, to, who = 'ai', app = false }: { from: number; to: number; who?: Who; app?: boolean }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  return (
    <div
      style={{
        ...(app ? APP : SITE)[who],
        padding: '13px 15px',
        borderRadius: 18,
        display: 'inline-flex',
        gap: 4,
        ...msgIn(frame, from, 8),
      }}
    >
      {[0, 1, 2].map((i) => {
        const phase = ((frame - from) / 33 - i * 0.14) % 1;
        const up = phase < 0.4 ? Math.sin((phase / 0.4) * Math.PI) : 0;
        return (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: who === 'agent' && app ? '#fff' : C.inkFaint,
              opacity: 0.3 + up * 0.7,
              transform: `translateY(${-3 * up}px)`,
            }}
          />
        );
      })}
    </div>
  );
};

/** "Maya · Tailoring joined" — the human-handoff event pill. */
export const EventPill = ({ at, children }: { at: number; children: ReactNode }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  return (
    <div
      style={{
        alignSelf: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: 999,
        background: C.humanSoft,
        color: C.human,
        fontSize: 12,
        fontWeight: 500,
        margin: '4px 0',
        ...msgIn(frame, at),
      }}
    >
      <Headset size={12} strokeWidth={2.2} />
      {children}
    </div>
  );
};

export const LiveDot = ({ color = C.live, size = 7 }: { color?: string; size?: number }) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      boxShadow: `0 0 0 3px ${color}38`,
      flex: 'none',
      display: 'inline-block',
    }}
  />
);

export const Mono = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <span
    style={{
      fontFamily: FONT.sans,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: C.inkFaint,
      fontVariantNumeric: 'tabular-nums',
      ...style,
    }}
  >
    {children}
  </span>
);

/**
 * The website chat widget from the site's "Try it" section (TryChat.tsx):
 * store header with the Truplexy mark, a paper-toned log, and an optional
 * footer.
 */
export const ChatWidget = ({
  store = 'Loom & Lane',
  sub = 'Website chat · powered by Truplexy',
  width = 460,
  height = 520,
  status,
  children,
  footer,
  style,
}: {
  store?: string;
  sub?: string;
  width?: number;
  height?: number;
  status?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      width,
      height,
      display: 'flex',
      flexDirection: 'column',
      background: C.white,
      border: `1px solid ${C.line}`,
      borderRadius: 28,
      boxShadow: SHADOW.lg,
      overflow: 'hidden',
      fontFamily: FONT.sans,
      color: C.ink,
      ...style,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${C.line}` }}>
      <span style={{ position: 'relative', flex: 'none' }}>
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 40,
            height: 40,
            borderRadius: 20,
            border: `1px solid ${C.line}`,
            background: C.surface2,
          }}
        >
          <Mark size={22} />
        </span>
        <span style={{ position: 'absolute', right: -1, bottom: -1, borderRadius: 6, border: `2px solid ${C.white}`, display: 'flex' }}>
          <LiveDot />
        </span>
      </span>
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{store}</div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.inkFaint }}>
          <Globe size={12} strokeWidth={2} color={C.accent} />
          {sub}
        </div>
      </div>
      {status ?? <Mono>Sample store</Mono>}
    </div>
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        gap: 10,
        padding: '20px 18px',
        background: 'rgb(247 248 252 / 0.6)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
    {footer && <div style={{ borderTop: `1px solid ${C.line}`, padding: '14px 18px' }}>{footer}</div>}
  </div>
);

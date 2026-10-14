import type { CSSProperties, ReactNode } from 'react';
import { BookOpen, ChevronsUpDown, FlaskConical, Inbox, KeyRound, LayoutDashboard, Plug, ScrollText, Search, Settings, Sparkles, UserRound, Users, Wrench } from 'lucide-react';
import { C, FONT, GRADIENT_BRAND, SHADOW } from '../theme';
import { Wordmark } from './Brand';

/**
 * Light-theme recreation of the dashboard shell (dashboard/src/components/
 * layout/Sidebar.tsx and app/nav.ts): the sectioned sidebar, the scope bar and
 * the paper-toned content area. Sizes are the dashboard's own px.
 */
const NAV = [
  { label: 'Workspace', items: [['overview', 'Overview', LayoutDashboard], ['tickets', 'Tickets', Inbox], ['customers', 'Customers', UserRound], ['knowledge', 'Knowledge base', BookOpen]] },
  { label: 'AI', items: [['llm', 'LLM', Sparkles], ['tools', 'Tools', Wrench], ['playground', 'Playground', FlaskConical]] },
  { label: 'Connect', items: [['integrations', 'Integrations', Plug], ['api-keys', 'API keys', KeyRound]] },
  { label: 'Business', items: [['team', 'Team', Users], ['logs', 'Logs', ScrollText], ['settings', 'Settings', Settings]] },
] as const;

export type NavId = (typeof NAV)[number]['items'][number][0];

export const AppShell = ({
  active,
  ticketCount = 3,
  width = 1280,
  height = 760,
  children,
  style,
}: {
  active: NavId;
  ticketCount?: number;
  width?: number;
  height?: number;
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      width,
      height,
      display: 'flex',
      background: C.paper,
      border: `1px solid ${C.line}`,
      borderRadius: 18,
      overflow: 'hidden',
      boxShadow: SHADOW.xl,
      fontFamily: FONT.sans,
      color: C.ink,
      fontSize: 14,
      ...style,
    }}
  >
    <aside style={{ width: 232, flex: 'none', borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 60, display: 'flex', alignItems: 'center', padding: '0 20px' }}>
        <Wordmark height={24} />
      </div>
      <nav style={{ padding: '0 12px' }}>
        {NAV.map((s, si) => (
          <div key={s.label} style={{ marginTop: si === 0 ? 4 : 16 }}>
            <p style={{ margin: '0 0 6px', padding: '0 12px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.inkFaint }}>{s.label}</p>
            {s.items.map(([id, label, Icon]) => {
              const on = id === active;
              return (
                <div
                  key={id}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    height: 36,
                    padding: '0 12px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    color: on ? C.ink : C.inkMuted,
                    background: on ? C.white : 'transparent',
                    boxShadow: on ? `${SHADOW.sm}, 0 0 0 1px ${C.line}` : 'none',
                  }}
                >
                  {on && <span style={{ position: 'absolute', top: 8, bottom: 8, left: 0, width: 3, borderRadius: '0 3px 3px 0', backgroundImage: GRADIENT_BRAND }} />}
                  <Icon size={18} color={on ? C.accent : C.inkFaint} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {id === 'tickets' && ticketCount > 0 && <Count n={ticketCount} accent />}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <header style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px', borderBottom: `1px solid ${C.line}`, background: C.white }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8, backgroundImage: GRADIENT_BRAND, color: '#fff', fontSize: 12, fontWeight: 700 }}>L</span>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>Loom &amp; Lane</span>
        <ChevronsUpDown size={14} color={C.inkFaint} />
        <span style={{ color: C.lineStrong }}>/</span>
        <span style={{ fontWeight: 600, fontSize: 13.5, color: C.inkMuted }}>Store assistant</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', width: 220, borderRadius: 10, border: `1px solid ${C.line}`, color: C.inkFaint, fontSize: 12.5 }}>
          <Search size={14} /> Search
        </span>
        <span style={{ padding: '3px 9px', borderRadius: 999, background: C.surface2, color: C.inkMuted, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em' }}>SAMPLE DATA</span>
        <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 16, background: '#0b6e86', color: '#fff', fontSize: 12, fontWeight: 700 }}>PN</span>
      </header>
      <main style={{ flex: 1, minHeight: 0, position: 'relative' }}>{children}</main>
    </div>
  </div>
);

export const Count = ({ n, accent }: { n: number; accent?: boolean }) => (
  <span
    style={{
      display: 'inline-grid',
      placeItems: 'center',
      height: 18,
      minWidth: 18,
      padding: '0 6px',
      borderRadius: 999,
      fontSize: 10.5,
      fontWeight: 600,
      background: accent ? C.accent : C.surface3,
      color: accent ? '#fff' : C.inkMuted,
    }}
  >
    {n}
  </span>
);

type Tone = 'neutral' | 'accent' | 'live' | 'warn' | 'danger' | 'violet';
const TONE: Record<Tone, [string, string]> = {
  neutral: [C.surface2, C.inkMuted],
  accent: [C.accentSoft, C.accent],
  live: [C.liveSoft, C.live],
  warn: [C.humanSoft, C.human],
  danger: [C.dangerSoft, C.danger],
  violet: ['#F2ECFF', '#5A1FE0'],
};

export const Badge = ({ tone = 'neutral', dot, children, style }: { tone?: Tone; dot?: boolean; children: ReactNode; style?: CSSProperties }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 9px',
      borderRadius: 999,
      fontSize: 11.5,
      fontWeight: 500,
      lineHeight: 1.2,
      whiteSpace: 'nowrap',
      background: TONE[tone][0],
      color: TONE[tone][1],
      ...style,
    }}
  >
    {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: 'currentColor' }} />}
    {children}
  </span>
);

export const Avatar = ({ initials, color = C.accent, size = 32 }: { initials: string; color?: string; size?: number }) => (
  <span
    style={{
      display: 'grid',
      placeItems: 'center',
      width: size,
      height: size,
      borderRadius: size / 2,
      background: color,
      color: '#fff',
      fontSize: size * 0.36,
      fontWeight: 700,
      flex: 'none',
    }}
  >
    {initials}
  </span>
);

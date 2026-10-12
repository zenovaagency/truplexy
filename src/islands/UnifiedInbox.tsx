import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Bot,
  Building2,
  ChevronDown,
  ChevronsUp,
  ChevronsUpDown,
  FlaskConical,
  Hand,
  Inbox as InboxIcon,
  KeyRound,
  LayoutDashboard,
  Lock,
  Minus,
  Plug,
  Plus,
  ScrollText,
  Search,
  Send,
  Settings,
  Sparkles,
  StickyNote,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { cn } from '@/lib/utils';
import { FLAG_LABEL, INBOX, STORE_CHAT, type InboxThread, type Msg, type TicketFlag, type TicketPriority } from '@/data/demo';
import { channel } from '@/data/channels';

/**
 * A static recreation of the dashboard's Tickets page, running on sample data:
 * the app shell, the queue with its views, the conversation with its composer,
 * and the properties panel. It shares no code with the dashboard (a separate
 * build); the look comes from the `.app-demo` primitives in global.css.
 *
 * Only the queue is interactive: pick a view, search, select a ticket (click,
 * arrow keys or J/K). Everything else is drawn the way the dashboard draws it
 * but does nothing, and is hidden from assistive tech.
 */

const ME = 'Priya Nair';
const BUSINESS = STORE_CHAT.store;

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

type Tone = 'neutral' | 'accent' | 'live' | 'warn' | 'danger' | 'violet' | 'outline';

function Badge({ tone = 'neutral', dot, small, children }: { tone?: Tone; dot?: boolean; small?: boolean; children: ReactNode }) {
  return (
    <span className={cn('d-badge', tone, small && 'sm')}>
      {dot && <span className="d-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

function Count({ n, accent }: { n?: number; accent?: boolean }) {
  if (!n) return null;
  return <span className={cn('d-count', accent && 'accent')}>{n}</span>;
}

const AVATAR_BG = ['#2338e6', '#6a2bff', '#0b6e86', '#15803d', '#9a4b00', '#c026d3', '#1f7bff', '#be123c'];

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const seed = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span
      className="inline-grid shrink-0 select-none place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38), background: AVATAR_BG[seed % AVATAR_BG.length] }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

const PRIORITY: Record<TicketPriority, { label: string; tone: Tone; icon: LucideIcon }> = {
  low: { label: 'Low', tone: 'neutral', icon: ArrowDown },
  normal: { label: 'Normal', tone: 'outline', icon: Minus },
  high: { label: 'High', tone: 'warn', icon: ArrowUp },
  urgent: { label: 'Urgent', tone: 'danger', icon: ChevronsUp },
};

const FLAG_TONE: Record<TicketFlag, Tone> = { escalated: 'danger', overdue: 'warn', handed_off: 'violet', reopened: 'accent' };

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const p = PRIORITY[priority];
  const Icon = p.icon;
  return (
    <Badge tone={p.tone}>
      <Icon size={12} aria-hidden="true" />
      {p.label}
    </Badge>
  );
}

function StatusBadge({ t }: { t: InboxThread }) {
  return (
    <Badge tone={t.ticketStatus === 'open' ? 'accent' : 'neutral'} dot>
      {t.ticketStatus === 'open' ? 'Open' : 'Closed'}
    </Badge>
  );
}

function Flags({ t }: { t: InboxThread }) {
  if (!t.flags.length) return null;
  return (
    <>
      {t.flags.map((f) => (
        <Badge key={f} tone={FLAG_TONE[f]} small>
          {FLAG_LABEL[f]}
        </Badge>
      ))}
    </>
  );
}

const sourceChannel = (t: InboxThread) => channel(t.channels[t.channels.length - 1]);

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

type View = 'needs_reply' | 'open' | 'mine' | 'escalated' | 'all';

const VIEWS: { id: View; label: string; match: (t: InboxThread) => boolean }[] = [
  { id: 'needs_reply', label: 'Needs reply', match: (t) => t.needsReply && t.ticketStatus === 'open' },
  { id: 'open', label: 'Open', match: (t) => t.ticketStatus === 'open' },
  { id: 'mine', label: 'Mine', match: (t) => t.assignee === ME },
  { id: 'escalated', label: 'Escalated', match: (t) => t.flags.includes('escalated') },
  { id: 'all', label: 'All', match: () => true },
];

/* ------------------------------------------------------------------ */
/* App shell (decorative)                                              */
/* ------------------------------------------------------------------ */

const NAV: { label: string; items: { label: string; icon: LucideIcon; count?: number }[] }[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Overview', icon: LayoutDashboard },
      { label: 'Tickets', icon: InboxIcon },
      { label: 'Customers', icon: UserRound },
      { label: 'Knowledge base', icon: BookOpen },
    ],
  },
  {
    label: 'AI',
    items: [
      { label: 'LLM', icon: Sparkles },
      { label: 'Tools', icon: Wrench },
      { label: 'Playground', icon: FlaskConical },
    ],
  },
  {
    label: 'Connect',
    items: [
      { label: 'Integrations', icon: Plug },
      { label: 'API keys', icon: KeyRound },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Team', icon: Users },
      { label: 'Logs', icon: ScrollText },
      { label: 'Settings', icon: Settings },
    ],
  },
];

function Sidebar({ markSrc, needsReply }: { markSrc: string; needsReply: number }) {
  return (
    <aside className="hidden w-[64px] shrink-0 flex-col border-r border-line bg-paper md:flex lg:w-[208px]" aria-hidden="true">
      <div className="flex h-[var(--d-topbar)] shrink-0 items-center justify-center gap-2 px-2 lg:justify-start lg:px-5">
        <img src={markSrc} alt="" width={26} height={28} className="h-7 w-auto" />
        <span className="hidden text-[1.05rem] font-bold tracking-tight text-ink lg:inline">Truplexy</span>
        <span className="d-badge accent ml-auto hidden lg:inline-flex">Pro</span>
      </div>
      <nav className="flex-1 overflow-hidden px-2.5 pb-4 lg:px-3">
        {NAV.map((s) => (
          <div key={s.label} className="mt-4 first:mt-1">
            <div className="mx-auto mb-2 h-px w-6 bg-line lg:hidden" />
            <p className="mono mb-1.5 hidden px-3 text-[0.62rem] text-ink-faint lg:block">{s.label}</p>
            <ul className="grid gap-0.5">
              {s.items.map((item) => {
                const Icon = item.icon;
                const active = item.label === 'Tickets';
                const n = active ? needsReply : item.count;
                return (
                  <li key={item.label}>
                    <span
                      className={cn(
                        'relative flex h-9 items-center justify-center gap-3 rounded-[10px] text-[0.8125rem] font-semibold lg:justify-start lg:px-3',
                        active ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-muted',
                      )}
                    >
                      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: 'var(--gradient-brand)' }} />}
                      <Icon size={18} className={active ? 'text-accent' : 'text-ink-faint'} />
                      <span className="hidden flex-1 truncate lg:inline">{item.label}</span>
                      <span className="hidden lg:inline">
                        <Count n={n} accent />
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function Topbar() {
  return (
    <div className="flex h-[var(--d-topbar)] shrink-0 items-center gap-2 border-b border-line bg-paper px-3 sm:px-5" aria-hidden="true">
      <span className="inline-flex h-9 max-w-[220px] items-center gap-2 rounded-[10px] border border-line bg-surface px-2.5 text-[0.8125rem] font-semibold text-ink">
        <Building2 size={16} className="shrink-0 text-accent" />
        <span className="truncate">{BUSINESS}</span>
        <ChevronsUpDown size={14} className="shrink-0 text-ink-faint" />
      </span>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden h-9 w-56 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[0.8125rem] text-ink-faint lg:flex">
          <Search size={16} />
          <span className="flex-1 truncate whitespace-nowrap">Search or jump to…</span>
          <span className="inline-grid h-5 place-items-center rounded-[5px] border border-b-2 border-line bg-surface px-1.5 text-[0.65rem] text-ink-muted">Ctrl K</span>
        </span>
        <span className="hidden h-8 items-center gap-2 rounded-full border border-line bg-surface px-2.5 text-xs font-semibold text-ink-muted sm:inline-flex">
          <span className="d-live" />
          Live
        </span>
        <Avatar name={ME} size={32} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

function TicketRow({
  t,
  active,
  onOpen,
  onKey,
  setRef,
}: {
  t: InboxThread;
  active: boolean;
  onOpen: () => void;
  onKey: (e: KeyboardEvent<HTMLButtonElement>) => void;
  setRef: (el: HTMLButtonElement | null) => void;
}) {
  const ch = sourceChannel(t);
  return (
    <li>
      <button
        ref={setRef}
        type="button"
        aria-current={active ? 'true' : undefined}
        aria-controls="inbox-detail"
        onClick={onOpen}
        onKeyDown={onKey}
        className={cn('relative grid w-full gap-1.5 px-4 py-3 text-left transition-colors', active ? 'bg-accent-soft/70' : 'hover:bg-surface-2/70')}
      >
        {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-btn" aria-hidden="true" />}
        <span className="flex items-start gap-2">
          <span className={cn('mt-[7px] size-2 shrink-0 rounded-full', t.needsReply ? 'bg-btn' : 'bg-transparent')} aria-hidden="true" />
          <span className={cn('line-clamp-2 flex-1 text-[0.8125rem] leading-snug text-ink', t.needsReply ? 'font-bold' : 'font-medium')}>
            {t.needsReply && <span className="sr-only">Needs reply: </span>}
            {t.subject}
          </span>
          <span className="shrink-0 text-[0.7rem] tabular-nums text-ink-faint">{t.updated}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5 pl-4">
          <StatusBadge t={t} />
          {t.priority !== 'normal' && <PriorityBadge priority={t.priority} />}
          <Flags t={t} />
          <span className="inline-flex max-w-[140px] items-center gap-1 truncate text-[0.7rem] text-ink-faint">
            <ChannelIcon id={t.channels[t.channels.length - 1]} size={12} />
            <span className="truncate">{ch.name}</span>
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[0.7rem] text-ink-faint">
            {t.assignee ? (
              <>
                <Avatar name={t.assignee} size={18} />
                <span className="sr-only">Assigned to {t.assignee}</span>
              </>
            ) : (
              'Unassigned'
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Conversation                                                        */
/* ------------------------------------------------------------------ */

function Meta({ children, right }: { children: ReactNode; right?: boolean }) {
  return <p className={cn('flex items-center gap-1.5 px-1 text-[0.7rem] text-ink-faint', right && 'justify-end')}>{children}</p>;
}

function Message({ m, customer }: { m: Msg; customer: string }) {
  const via = <span className="sr-only">on {channel(m.channel).name}</span>;
  if (m.note) {
    return (
      <div className="flex flex-col gap-1">
        <div className="bubble bubble-note">
          <p className="mb-1 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide" style={{ color: 'var(--d-warn)' }}>
            <Lock size={12} aria-hidden="true" /> Internal note · {m.author}
          </p>
          {m.text}
        </div>
        <Meta>{m.time}</Meta>
      </div>
    );
  }
  if (m.from === 'customer') {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="bubble bubble-customer">{m.text}</div>
        <Meta>
          <UserRound size={12} aria-hidden="true" /> {customer.split(' ')[0]} · {m.time}
          {via}
        </Meta>
      </div>
    );
  }
  if (m.from === 'agent') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="bubble bubble-agent">{m.text}</div>
        <Meta right>
          {m.author} · {m.time}
          {via}
        </Meta>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="bubble bubble-ai">{m.text}</div>
      <Meta right>
        <Bot size={12} className="text-accent" aria-hidden="true" /> Assistant · {m.time}
        {via}
      </Meta>
    </div>
  );
}

function Separator({ children }: { children: ReactNode }) {
  return (
    <div className="my-1 flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-line" />
      <span className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-ink-faint">{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function Transcript({ t }: { t: InboxThread }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-5 sm:px-5" role="log" aria-label="Transcript">
      {t.messages.map((m, i) => {
        const prev = t.messages[i - 1];
        const newDay = m.day && m.day !== prev?.day;
        const switched = prev && prev.channel !== m.channel;
        return (
          <div key={`${t.id}-${i}`} className="flex flex-col gap-3">
            {newDay && <Separator>{m.day}</Separator>}
            {switched && (
              <Separator>
                Continued on <ChannelIcon id={m.channel} size={11} /> {channel(m.channel).name}
              </Separator>
            )}
            <Message m={m} customer={t.name} />
          </div>
        );
      })}
    </div>
  );
}

function Composer({ t }: { t: InboxThread }) {
  return (
    <div className="shrink-0 border-t border-line bg-surface px-3 pb-3 pt-3 sm:px-5" aria-hidden="true">
      <div className="mx-auto grid max-w-[760px] gap-2.5">
        {!t.paused && t.ticketStatus === 'open' && (
          <div className="flex items-center gap-3 rounded-[12px] border border-line bg-surface-2/60 px-3 py-2 text-[0.8125rem] text-ink-muted">
            <span className="flex-1">The assistant is still answering here. Take over so it doesn’t reply alongside you.</span>
            <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[9px] bg-accent-soft px-2.5 text-xs font-semibold text-accent">
              <Hand size={13} /> Take over
            </span>
          </div>
        )}
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
          <p className="px-3.5 py-3 text-[0.875rem] text-ink-faint">Write a reply to the customer…</p>
          <div className="flex items-center gap-2 border-t border-line/70 px-2 py-2">
            <span className="d-seg !flex-none">
              <span className="inline-flex h-[26px] items-center rounded-[8px] bg-surface px-2.5 text-xs font-semibold text-ink shadow-sm">Reply</span>
              <span className="inline-flex h-[26px] items-center gap-1 rounded-[8px] px-2.5 text-xs font-semibold text-ink-faint">
                <StickyNote size={12} /> Note
              </span>
            </span>
            <span className="ml-auto hidden text-[0.7rem] text-ink-faint sm:inline">Ctrl + Enter to send</span>
            <span className="flex opacity-60">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-l-[9px] bg-btn px-3 text-xs font-semibold text-white">
                <Send size={13} /> Send
              </span>
              <span className="inline-grid h-7 w-7 place-items-center rounded-r-[9px] border-l border-white/25 bg-btn text-white">
                <ChevronDown size={14} />
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Properties                                                          */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <dt className="mono text-ink-faint">{label}</dt>
      <dd className="m-0 flex h-9 items-center justify-between gap-2 rounded-[10px] border border-line bg-surface px-3 text-[0.8125rem] font-medium text-ink">
        {children}
        <ChevronDown size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
      </dd>
    </div>
  );
}

function Properties({ t }: { t: InboxThread }) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-3" aria-label="AI summary">
        <p className="mono flex items-center gap-1.5 text-ink-faint">
          <Sparkles size={12} className="text-accent" aria-hidden="true" /> AI summary
        </p>
        <div className="rounded-[12px] border border-line bg-surface-2/60 p-3 text-[0.8125rem] leading-relaxed text-ink">{t.summary}</div>
      </section>

      <section className="grid gap-3" aria-label="Customer">
        <p className="mono text-ink-faint">Customer</p>
        <div className="flex items-center gap-3 rounded-[12px] border border-line bg-surface-2/60 p-3">
          <Avatar name={t.name} size={32} />
          <div className="grid min-w-0 flex-1">
            <span className="truncate text-[0.8125rem] font-semibold text-ink">{t.name}</span>
            <span className="truncate text-xs text-ink-faint">{t.email}</span>
          </div>
        </div>
        <dl className="grid gap-1.5 text-[0.8125rem]">
          {t.customer.map((c) => (
            <div key={c.label} className="flex justify-between gap-3">
              <dt className="shrink-0 whitespace-nowrap text-ink-faint">{c.label}</dt>
              <dd className="m-0 text-right font-medium text-ink">{c.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-3" aria-label="Ticket properties">
        <dl className="grid gap-3">
          <Field label="Status">{t.ticketStatus === 'open' ? 'Open' : 'Closed'}</Field>
          <Field label="Priority">{PRIORITY[t.priority].label}</Field>
          <Field label="Assignee">
            {t.assignee ? (
              <span className="flex items-center gap-2">
                <Avatar name={t.assignee} size={20} /> {t.assignee}
              </span>
            ) : (
              <span className="text-ink-faint">Unassigned</span>
            )}
          </Field>
        </dl>
        <div className="flex items-start justify-between gap-3 rounded-[12px] border border-line bg-surface-2/60 p-3">
          <div className="grid gap-0.5">
            <span className="text-[0.8125rem] font-semibold text-ink">Assistant paused</span>
            <span className="text-xs text-ink-faint">{t.paused ? `Your team has this conversation. ${t.handoff}.` : 'The assistant replies to new messages.'}</span>
          </div>
          <span
            className={cn('mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors', t.paused ? 'bg-btn' : 'bg-line-strong')}
            role="img"
            aria-label={t.paused ? 'On' : 'Off'}
          >
            <span className={cn('size-4 rounded-full bg-white shadow-sm', t.paused && 'translate-x-4')} />
          </span>
        </div>
      </section>

      <section className="grid gap-3" aria-label="Timeline">
        <p className="mono text-ink-faint">Timeline</p>
        <dl className="grid gap-1.5 text-[0.8125rem]">
          {t.timeline.map((r) => (
            <div key={r.label} className="flex justify-between gap-3">
              <dt className="text-ink-faint">{r.label}</dt>
              <dd className={cn('m-0 text-right font-medium', r.warn ? 'text-[color:var(--d-warn)]' : 'text-ink')}>{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The demo                                                            */
/* ------------------------------------------------------------------ */

export default function UnifiedInbox({ markSrc }: { markSrc: string }) {
  const [view, setView] = useState<View>('open');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('james');
  const [mobileDetail, setMobileDetail] = useState(false);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const detailHeading = useRef<HTMLHeadingElement>(null);

  const counts = useMemo(
    () => ({
      open: INBOX.filter((t) => t.ticketStatus === 'open').length,
      overdue: INBOX.filter((t) => t.ticketStatus === 'open' && t.flags.includes('overdue')).length,
      unassigned: INBOX.filter((t) => t.ticketStatus === 'open' && !t.assignee).length,
      handoffs: INBOX.filter((t) => t.ticketStatus === 'open' && t.flags.includes('handed_off') && !t.assignee).length,
    }),
    [],
  );

  const rows = useMemo(() => {
    const v = VIEWS.find((x) => x.id === view)!;
    const q = query.trim().toLowerCase();
    return INBOX.filter((t) => v.match(t) && (!q || `${t.subject} ${t.name} ${t.preview}`.toLowerCase().includes(q)));
  }, [view, query]);

  const selected = INBOX.find((t) => t.id === selectedId)!;

  const open = (id: string) => {
    setSelectedId(id);
    setMobileDetail(true);
    // Move focus to the conversation on small screens, where it replaces the list.
    if (window.matchMedia('(max-width: 767px)').matches) {
      requestAnimationFrame(() => detailHeading.current?.focus());
    }
  };

  const onRowKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J' ? 1 : e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K' ? -1 : 0;
    if (!step || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const t = rows[(i + step + rows.length) % rows.length];
    if (!t) return;
    setSelectedId(t.id);
    rowRefs.current[t.id]?.focus();
  };

  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-lg)]">
      {/* Browser frame */}
      <div className="flex items-center gap-3 border-b border-line bg-surface-2/70 px-4 py-2.5">
        <span className="hidden gap-1.5 sm:flex" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex h-7 min-w-0 max-w-[360px] flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[0.75rem] text-ink-faint sm:ml-auto sm:flex-none" aria-hidden="true">
          <Lock size={11} className="shrink-0" />
          <span className="truncate">app.truplexy.com/tickets</span>
        </span>
        <span className="mono ml-auto shrink-0 whitespace-nowrap text-[0.6rem] text-ink-faint sm:ml-3">Sample data</span>
      </div>

      <div className="app-demo flex h-[720px] max-h-[88svh] min-h-[560px]">
        <Sidebar markSrc={markSrc} needsReply={INBOX.filter(VIEWS[0].match).length} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />

          {/* Page header */}
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-5 lg:py-3.5">
            <div className="flex min-w-0 items-baseline gap-3">
              <h2 className="text-xl font-bold text-ink">Tickets</h2>
              <span className="hidden truncate text-[0.8125rem] text-ink-faint sm:inline">
                {counts.open} open · {counts.overdue} overdue · {counts.unassigned} unassigned
              </span>
            </div>
            <div className="flex items-center gap-2" aria-hidden="true">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[0.8125rem] font-semibold text-ink">
                <Hand size={14} /> Handoffs <Count n={counts.handoffs} accent />
              </span>
              <span className="hidden h-8 items-center gap-1.5 rounded-[10px] bg-btn px-3 text-[0.8125rem] font-semibold text-white sm:inline-flex">
                <Plus size={14} /> New ticket
              </span>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[330px_minmax(0,1fr)]">
            {/* Queue */}
            <div className={cn(mobileDetail ? 'hidden md:flex' : 'flex', 'min-h-0 flex-col border-r border-line bg-surface')}>
              <div className="grid shrink-0 gap-2.5 border-b border-line p-3">
                <label className="flex h-9 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[0.8125rem] text-ink-faint focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/15">
                  <Search size={15} aria-hidden="true" />
                  <span className="sr-only">Search tickets</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search tickets"
                    className="w-full bg-transparent text-ink outline-none placeholder:text-ink-faint"
                  />
                </label>
                <div className="d-seg" role="radiogroup" aria-label="Ticket view">
                  {VIEWS.map((v) => {
                    const n = INBOX.filter(v.match).length;
                    const on = view === v.id;
                    return (
                      <button key={v.id} type="button" role="radio" aria-checked={on} onClick={() => setView(v.id)}>
                        {v.label}
                        {v.id !== 'all' && <Count n={n} accent={on} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto" data-lenis-prevent aria-label="Tickets">
                {rows.length === 0 && (
                  <li className="px-5 py-12 text-center">
                    <p className="text-[0.875rem] font-semibold text-ink">{query ? 'No tickets match' : 'No tickets here'}</p>
                    <p className="mt-1 text-xs text-ink-faint">{query ? 'Try a different search.' : 'Pick another view to see more.'}</p>
                  </li>
                )}
                {rows.map((t, i) => (
                  <TicketRow
                    key={t.id}
                    t={t}
                    active={t.id === selectedId}
                    onOpen={() => open(t.id)}
                    onKey={(e) => onRowKey(e, i)}
                    setRef={(el) => {
                      rowRefs.current[t.id] = el;
                    }}
                  />
                ))}
              </ul>
            </div>

            {/* Ticket */}
            <section
              id="inbox-detail"
              aria-label={`Ticket: ${selected.subject}`}
              className={cn(mobileDetail ? 'flex' : 'hidden md:flex', 'min-h-0 min-w-0 flex-col')}
            >
              <header className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
                <button
                  type="button"
                  onClick={() => setMobileDetail(false)}
                  className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-surface text-ink-muted md:hidden"
                  aria-label="Back to tickets"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <h3 ref={detailHeading} tabIndex={-1} className="break-words text-base font-bold leading-snug text-ink outline-none">
                    {selected.subject}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
                    <StatusBadge t={selected} />
                    {selected.priority !== 'normal' && <PriorityBadge priority={selected.priority} />}
                    <Flags t={selected} />
                    <span>From the customer · {selected.timeline[0].value}</span>
                  </div>
                </div>
                {selected.ticketStatus === 'open' && !selected.paused && (
                  <span className="hidden h-8 shrink-0 items-center gap-1.5 rounded-[10px] bg-accent-soft px-3 text-xs font-semibold text-accent sm:inline-flex" aria-hidden="true">
                    <Hand size={13} /> Take over
                  </span>
                )}
              </header>

              <div className="min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="flex min-h-0 min-w-0 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
                    <Transcript t={selected} />
                    {/* Below xl the properties follow the transcript, as the dashboard's side sheet does. */}
                    <div className="border-t border-line bg-surface p-4 sm:p-5 xl:hidden">
                      <Properties t={selected} />
                    </div>
                  </div>
                  <Composer t={selected} />
                </div>
                <aside className="hidden overflow-y-auto border-l border-line bg-surface p-5 xl:block" data-lenis-prevent aria-label="Ticket details">
                  <Properties t={selected} />
                </aside>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Headset,
  History,
  Inbox as InboxIcon,
  Search,
  Settings,
  Sparkles,
  Target,
  UserRound,
  Users,
} from 'lucide-react';
import ChannelIcon from '@/components/ui/ChannelIcon';
import StatusPill from '@/components/ui/StatusPill';
import { INBOX, type InboxStatus, type InboxThread } from '@/data/demo';
import { channel } from '@/data/channels';

/**
 * A working mock of the omnichannel inbox: conversations from every live
 * channel in one list, and for the selected one the full cross-channel
 * transcript, customer, history, AI summary, intent and handoff state.
 *
 * Everything is sample data (labelled as such in the window chrome).
 */

type Filter = 'all' | 'ai' | 'human' | 'resolved';

const FILTERS: { id: Filter; label: string; match: (s: InboxStatus) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'ai', label: 'AI handling', match: (s) => s === 'ai' },
  { id: 'human', label: 'Needs human', match: (s) => s === 'human' },
  { id: 'resolved', label: 'Resolved', match: (s) => s === 'resolved' },
];

const AVATAR: Record<string, string> = {
  sarah: 'linear-gradient(135deg,#45d4ff,#1f7bff)',
  james: 'linear-gradient(135deg,#1f7bff,#2338e6)',
  nabila: 'linear-gradient(135deg,#6a2bff,#d9b8ff)',
  daniel: 'linear-gradient(135deg,#2338e6,#6a2bff)',
  rafi: 'linear-gradient(135deg,#0b6e86,#45d4ff)',
};

function Avatar({ t, size = 36 }: { t: InboxThread; size?: number }) {
  return (
    <span
      className="grid flex-none place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: AVATAR[t.id], fontSize: size * 0.34 }}
      aria-hidden="true"
    >
      {t.initials}
    </span>
  );
}

function ChannelPath({ t }: { t: InboxThread }) {
  return (
    <span className="inline-flex items-center gap-1">
      {t.channels.map((c, i) => (
        <span key={c} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[0.65rem] text-ink-faint">→</span>}
          <ChannelIcon id={c} size={12} title={channel(c).name} />
        </span>
      ))}
    </span>
  );
}

export default function UnifiedInbox() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(INBOX[0].id);
  const [mobileDetail, setMobileDetail] = useState(false);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const detailHeading = useRef<HTMLHeadingElement>(null);

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const q = query.trim().toLowerCase();
    return INBOX.filter(
      (t) => f.match(t.status) && (!q || `${t.name} ${t.topic} ${t.preview}`.toLowerCase().includes(q)),
    );
  }, [filter, query]);

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
    const next = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = rows[(next + rows.length) % rows.length];
    if (!t) return;
    setSelectedId(t.id);
    rowRefs.current[t.id]?.focus();
  };

  return (
    <div className="card overflow-hidden !rounded-[26px] !shadow-[var(--shadow-lg)]">
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b border-line bg-surface-2/70 px-4 py-2.5">
        <span className="hidden gap-1.5 sm:flex" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <p className="text-[0.82rem] font-semibold">Truplexy · Inbox</p>
        <label className="ml-auto hidden w-full max-w-[260px] items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[0.8rem] text-ink-faint sm:flex">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search conversations</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="w-full bg-transparent text-ink outline-none placeholder:text-ink-faint"
          />
        </label>
        <span className="mono ml-auto whitespace-nowrap text-[0.6rem] text-ink-faint sm:ml-0">Sample data</span>
      </div>

      <div className="grid h-[640px] grid-cols-1 md:grid-cols-[310px_minmax(0,1fr)] lg:grid-cols-[56px_336px_minmax(0,1fr)]">
        {/* Sidebar (decorative) */}
        <nav className="hidden flex-col items-center gap-2 border-r border-line bg-surface-2/40 py-4 lg:flex" aria-hidden="true">
          {[InboxIcon, Users, BarChart3, Settings].map((Icon, i) => (
            <span
              key={i}
              className={`grid h-10 w-10 place-items-center rounded-xl ${i === 0 ? 'bg-accent-soft text-accent' : 'text-ink-faint'}`}
            >
              <Icon size={18} strokeWidth={1.9} />
            </span>
          ))}
        </nav>

        {/* Conversation list */}
        <div className={`${mobileDetail ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-r border-line`}>
          <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2.5" role="group" aria-label="Filter conversations">
            {FILTERS.map((f) => {
              const count = INBOX.filter((t) => f.match(t.status)).length;
              const on = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(f.id)}
                  className={`btn flex-none rounded-full border-0 px-2.5 py-1.5 text-[0.76rem] font-medium [--btn-lift:0px] ${
                    on ? 'bg-ink text-paper' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  {f.label} <span className={on ? 'opacity-70' : 'text-ink-faint'}>{count}</span>
                </button>
              );
            })}
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent aria-label="Conversations">
            {rows.length === 0 && <li className="px-5 py-10 text-center text-sm text-ink-faint">No conversations match.</li>}
            {rows.map((t, i) => {
              const on = t.id === selectedId;
              return (
                <li key={t.id}>
                  <button
                    ref={(el) => {
                      rowRefs.current[t.id] = el;
                    }}
                    type="button"
                    aria-pressed={on}
                    aria-controls="inbox-detail"
                    onClick={() => open(t.id)}
                    onKeyDown={(e) => onRowKey(e, i)}
                    className={`relative flex w-full gap-3 border-b border-line px-4 py-3.5 text-left transition-colors ${
                      on ? 'bg-accent-soft/70' : 'hover:bg-surface-2/60'
                    }`}
                  >
                    {on && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-accent" aria-hidden="true" />}
                    <Avatar t={t} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[0.9rem] font-semibold">{t.name}</span>
                        <span className="flex-none text-[0.7rem] text-ink-faint">{t.updated}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-[0.78rem] text-ink-muted">
                        <ChannelPath t={t} />
                        <span className="truncate">{t.topic}</span>
                      </span>
                      <span className="mt-1.5 block truncate text-[0.78rem] text-ink-faint">{t.preview}</span>
                      <StatusPill status={t.status} className="mt-2" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Conversation detail */}
        <section
          id="inbox-detail"
          aria-label={`Conversation with ${selected.name}`}
          className={`${mobileDetail ? 'flex' : 'hidden md:flex'} min-h-0 flex-col`}
        >
          <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={() => setMobileDetail(false)}
              className="btn btn-ghost btn-icon h-9 w-9 rounded-full text-ink-muted md:hidden"
              aria-label="Back to conversations"
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <Avatar t={selected} size={38} />
            <div className="min-w-0 flex-1">
              <h3 ref={detailHeading} tabIndex={-1} className="truncate text-[0.98rem] font-bold outline-none">
                {selected.name}
              </h3>
              <p className="flex flex-wrap items-center gap-x-2 text-[0.76rem] text-ink-muted">
                <span className="hidden sm:inline">Source:</span>
                {selected.channels.map((c, i) => (
                  <span key={c} className="inline-flex items-center gap-1">
                    {i > 0 && <span className="text-ink-faint">→</span>}
                    <ChannelIcon id={c} size={11} />
                    {channel(c).name}
                  </span>
                ))}
              </p>
            </div>
            <StatusPill status={selected.status} />
          </header>

          {/* One scroll area that stacks below xl; two independently scrolling columns at xl. */}
          <div className="min-h-0 flex-1 overflow-y-auto xl:grid xl:grid-cols-[minmax(0,1fr)_280px] xl:overflow-hidden" data-lenis-prevent>
            {/* Transcript */}
            <div className="flex flex-col gap-2.5 px-4 py-5 sm:px-5 xl:min-h-0 xl:overflow-y-auto" data-lenis-prevent role="log" aria-label="Transcript">
              {selected.messages.map((m, i) => {
                const prev = selected.messages[i - 1];
                const switched = prev && prev.channel !== m.channel;
                return (
                  <div key={`${selected.id}-${i}`} className="flex flex-col gap-2.5">
                    {switched && (
                      <div className="my-1 flex items-center gap-3" role="separator">
                        <span className="thread-h h-[2px] flex-1 opacity-50" />
                        <span className="mono flex items-center gap-1.5 text-[0.6rem] text-ink-faint">
                          Continued on <ChannelIcon id={m.channel} size={10} /> {channel(m.channel).name}
                        </span>
                        <span className="thread-h h-[2px] flex-1 opacity-50" />
                      </div>
                    )}
                    <div
                      className={`bubble ${
                        m.from === 'customer' ? 'bubble-customer' : m.from === 'agent' ? 'bubble-agent' : 'bubble-ai'
                      } !text-[0.88rem]`}
                    >
                      <span
                        className={`mb-0.5 flex items-center gap-1.5 text-[0.68rem] font-semibold ${
                          m.from === 'customer' ? 'text-white/80' : 'text-ink-faint'
                        }`}
                      >
                        {m.from === 'customer' ? selected.name.split(' ')[0] : m.from === 'agent' ? m.author : 'Truplexy'}
                        <span aria-hidden="true">·</span>
                        <span className="font-normal">{m.time}</span>
                        <span className="sr-only">on {channel(m.channel).name}</span>
                      </span>
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Context sidebar */}
            <aside className="space-y-4 border-t border-line bg-surface-2/40 px-4 py-5 sm:px-5 xl:overflow-y-auto xl:border-l xl:border-t-0" data-lenis-prevent aria-label="Conversation details">
              <div className="rounded-2xl border border-accent/20 bg-accent-soft/60 p-3.5">
                <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-accent">
                  <Sparkles size={13} aria-hidden="true" /> AI summary
                </p>
                <p className="mt-1.5 text-[0.82rem] leading-relaxed">{selected.summary}</p>
              </div>

              <Detail icon={Target} label="Current intent">
                <span className="text-[0.85rem] font-semibold">{selected.intent}</span>
              </Detail>

              <Detail icon={Headset} label="Handoff status">
                <span className="text-[0.85rem]">{selected.handoff}</span>
              </Detail>

              <Detail icon={UserRound} label="Customer">
                <dl className="space-y-1.5 text-[0.8rem]">
                  {selected.customer.map((c) => (
                    <div key={c.label} className="flex justify-between gap-3">
                      <dt className="text-ink-faint">{c.label}</dt>
                      <dd className="text-right font-medium">{c.value}</dd>
                    </div>
                  ))}
                </dl>
              </Detail>

              <Detail icon={History} label="Previous interactions">
                {selected.previous.length === 0 ? (
                  <p className="text-[0.8rem] text-ink-faint">First conversation.</p>
                ) : (
                  <ul className="space-y-2">
                    {selected.previous.map((p) => (
                      <li key={p.when} className="flex gap-2 text-[0.8rem]">
                        <ChannelIcon id={p.channel} size={12} className="mt-1 flex-none" />
                        <span>
                          <span className="block text-[0.7rem] text-ink-faint">{p.when}</span>
                          {p.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Detail>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, children }: { icon: typeof Target; label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mono mb-1.5 flex items-center gap-1.5 text-[0.6rem] text-ink-faint">
        <Icon size={12} aria-hidden="true" /> {label}
      </p>
      {children}
    </div>
  );
}

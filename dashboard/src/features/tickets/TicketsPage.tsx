import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowRightLeft, Filter, Hand, Inbox, MessagesSquare, Plus, Search, X } from 'lucide-react';
import { useCreateTicket, useHandoffs, usePrefetchTicket, useTickets } from '@/lib/api/endpoints/tickets';
import type { TicketCounts, TicketFlag, TicketPriority, TicketQuery, TicketStatus, TicketView } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import { useDebounce, useHotkeys, useIsDesktop } from '@/hooks';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Count,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Page,
  PageHeader,
  Segmented,
  Select,
  SkeletonRows,
  Switch,
  Tip,
} from '@/components/ui';
import { PRIORITIES, PRIORITY, PriorityBadge, TICKET_STATUS, TICKET_STATUSES, TicketStatusBadge } from '@/components/domain/badges';
import { FLAG_LABEL, TicketFlags, useAssignees } from './shared';
import { TicketDetail } from './TicketDetail';

const VIEWS: { value: TicketView; label: string; count: keyof TicketCounts }[] = [
  { value: 'needs_reply', label: 'Needs reply', count: 'needs_reply' },
  { value: 'open', label: 'Open', count: 'open' },
  { value: 'mine', label: 'Mine', count: 'mine' },
  { value: 'escalated', label: 'Escalated', count: 'escalated' },
  { value: 'all', label: 'All', count: 'all' },
];

/** Filters live in the URL, so a filtered queue can be shared and survives reloads. */
function useTicketFilters() {
  const [params, setParams] = useSearchParams();
  const filters: TicketQuery = {
    view: (params.get('view') as TicketView) || 'open',
    status: (params.get('status') as TicketStatus) || undefined,
    priority: (params.get('priority') as TicketPriority) || undefined,
    assignee: params.get('assignee') || undefined,
    flag: (params.get('flag') as TicketFlag) || undefined,
    q: params.get('q') || undefined,
  };
  const set = (patch: Partial<Record<keyof TicketQuery, string | undefined>>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
        return n;
      },
      { replace: true },
    );
  return { filters, set, params, setParams };
}

export default function TicketsPage() {
  const { ticketId } = useParams();
  const { href, can } = useScopeCtx();
  const nav = useNavigate();
  const isDesktop = useIsDesktop();
  const { filters, set, params, setParams } = useTicketFilters();
  const [search, setSearch] = useState(filters.q ?? '');
  const q = useDebounce(search, 350);
  const [showFilters, setShowFilters] = useState(Boolean(filters.status || filters.priority || filters.assignee || filters.flag));
  const assignees = useAssignees();
  const handoffs = useHandoffs();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if ((q || undefined) !== filters.q) set({ q: q || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = useMemo(() => ({ ...filters, q: filters.q }), [filters.view, filters.status, filters.priority, filters.assignee, filters.flag, filters.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useTickets(query);
  const prefetch = usePrefetchTicket();
  const tickets = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  const counts = list.data?.pages[0]?.counts;
  const qs = params.toString() ? `?${params.toString()}` : '';
  const open = (id: string) => nav(href(`tickets/${id}`) + qs);

  const extraFilters = [filters.status, filters.priority, filters.assignee, filters.flag].filter(Boolean).length;
  const newOpen = params.get('new') === '1';

  // j / k move through the queue; Esc closes the ticket.
  useHotkeys({
    j: () => step(1),
    k: () => step(-1),
    escape: () => ticketId && nav(href('tickets') + qs),
  });
  function step(d: number) {
    if (!tickets.length) return;
    const i = tickets.findIndex((t) => t.id === ticketId);
    const next = tickets[Math.max(0, Math.min(tickets.length - 1, i + d))];
    if (next) {
      open(next.id);
      listRef.current?.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  const listPane = (
    <div className="flex min-h-0 flex-col">
      <div className="grid gap-3 border-b border-line p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              size="sm"
              value={search}
              onChange={(e) => setSearch(e.target.value.slice(0, 200))}
              placeholder="Search subject or ID"
              className="pl-9"
              aria-label="Search tickets"
            />
          </div>
          <Tip content="Filters">
            <Button
              size="sm"
              icon
              variant={showFilters || extraFilters ? 'soft' : 'ghost'}
              onClick={() => setShowFilters((s) => !s)}
              aria-label="Filters"
              aria-expanded={showFilters}
              className="relative"
            >
              <Filter />
              {extraFilters > 0 && <Count n={extraFilters} tone="accent" className="absolute -right-1.5 -top-1.5" />}
            </Button>
          </Tip>
        </div>
        <Segmented
          size="xs"
          label="View"
          value={filters.view ?? 'open'}
          onChange={(v) => set({ view: v === 'open' ? undefined : v })}
          // Counts only where they ask for action; "Open" and "All" totals sit in the header.
          options={VIEWS.map((v) => ({ value: v.value, label: v.label, count: v.value === 'open' || v.value === 'all' ? undefined : counts?.[v.count] }))}
          stretch
        />
        {showFilters && (
          <div className="grid grid-cols-2 gap-2 animate-fade-in">
            <Select size="sm" aria-label="Status" value={filters.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })} placeholder="Any status"
              options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS[s].label }))} />
            <Select size="sm" aria-label="Priority" value={filters.priority ?? ''} onChange={(e) => set({ priority: e.target.value || undefined })} placeholder="Any priority"
              options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY[p].label }))} />
            <Select size="sm" aria-label="Assignee" value={filters.assignee ?? ''} onChange={(e) => set({ assignee: e.target.value || undefined })} placeholder="Anyone"
              options={[{ value: 'me', label: 'Assigned to me' }, { value: 'none', label: 'Unassigned' }, ...assignees.map((m) => ({ value: m.user_id, label: m.name }))]} />
            <Select size="sm" aria-label="Flag" value={filters.flag ?? ''} onChange={(e) => set({ flag: e.target.value || undefined })} placeholder="Any flag"
              options={(Object.keys(FLAG_LABEL) as TicketFlag[]).map((f) => ({ value: f, label: FLAG_LABEL[f] }))} />
            {extraFilters > 0 && (
              <button type="button" className="col-span-2 inline-flex items-center gap-1 justify-self-start text-xs font-semibold text-accent hover:underline"
                onClick={() => set({ status: undefined, priority: undefined, assignee: undefined, flag: undefined })}>
                <X className="size-3" /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      <div className={cn('flex-1 overflow-y-auto transition-opacity', list.isPlaceholderData && 'opacity-60')}>
        {list.isPending ? (
          <SkeletonRows rows={8} className="p-3" />
        ) : list.isError ? (
          <ErrorState compact error={list.error} onRetry={() => list.refetch()} />
        ) : !tickets.length ? (
          <EmptyState
            compact
            icon={<Inbox />}
            title={filters.q || extraFilters ? 'No tickets match' : filters.view === 'needs_reply' ? "You're all caught up" : 'No tickets here'}
            description={filters.q || extraFilters ? 'Try another search or clear the filters.' : 'New tickets appear here the moment they open.'}
          />
        ) : (
          <ul ref={listRef} className="divide-y divide-line" role="listbox" aria-label="Tickets">
            {tickets.map((t) => {
              const active = t.id === ticketId;
              return (
                <li key={t.id} data-id={t.id} role="option" aria-selected={active}>
                  <Link
                    to={href(`tickets/${t.id}`) + qs}
                    onMouseEnter={() => void prefetch(t.id)}
                    className={cn(
                      'relative grid gap-1.5 px-4 py-3 transition-colors',
                      active ? 'bg-accent-soft/70' : 'hover:bg-surface-2/70',
                    )}
                  >
                    {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-btn" />}
                    <div className="flex items-start gap-2">
                      <span className={cn('mt-[7px] size-2 shrink-0 rounded-full', t.needs_reply ? 'bg-btn' : 'bg-transparent')} title={t.needs_reply ? 'Needs reply' : undefined} />
                      <p className={cn('line-clamp-2 flex-1 text-[0.8125rem] leading-snug', t.needs_reply ? 'font-bold text-ink' : 'font-medium text-ink')}>{t.subject}</p>
                      <span className="shrink-0 text-[0.7rem] text-ink-faint tabular-nums">{formatRelative(t.updated_at)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-4">
                      <TicketStatusBadge status={t.status} />
                      {t.priority !== 'normal' && <PriorityBadge priority={t.priority} />}
                      <TicketFlags ticket={t} />
                      <span className="ml-auto flex items-center gap-1.5 text-[0.7rem] text-ink-faint">
                        {t.assignee_name ? <Avatar name={t.assignee_name} size={18} /> : 'Unassigned'}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {list.hasNextPage && (
          <div className="p-3">
            <Button size="xs" className="w-full" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  const headerActions = (
    <>
      <Button asChild variant="ghost" leading={<Hand />}>
        <Link to={href('tickets/handoffs')}>
          Handoffs <Count n={handoffs.data?.length} tone="accent" />
        </Link>
      </Button>
      {can('tickets.write') && (
        <Button variant="accent" leading={<Plus />} onClick={() => setParams((p) => (p.set('new', '1'), p))}>
          New ticket
        </Button>
      )}
    </>
  );

  const newDialog = (
    <NewTicketDialog
      open={newOpen}
      onOpenChange={(o) => !o && setParams((p) => (p.delete('new'), p), { replace: true })}
      onCreated={(id) => nav(href(`tickets/${id}`))}
    />
  );

  // Phones and tablets: the list, or the ticket full-screen.
  if (!isDesktop) {
    return (
      <>
        {ticketId ? (
          <TicketDetail id={ticketId} backHref={href('tickets') + qs} />
        ) : (
          <Page className="gap-4">
            <PageHeader title="Tickets" actions={headerActions} />
            <div className="panel overflow-hidden">{listPane}</div>
          </Page>
        )}
        {newDialog}
      </>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-var(--topbar-h))] flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-line px-[var(--page-x)] py-3.5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold text-ink">Tickets</h1>
          {counts && <span className="text-[0.8125rem] text-ink-faint">{counts.open} open · {counts.overdue} overdue · {counts.unassigned} unassigned</span>}
        </div>
        <div className="flex items-center gap-2">{headerActions}</div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)] 2xl:grid-cols-[440px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col border-r border-line bg-surface">{listPane}</div>
        <div className="min-h-0 overflow-hidden">
          {ticketId ? (
            <TicketDetail key={ticketId} id={ticketId} />
          ) : (
            <EmptyState
              className="h-full"
              icon={<MessagesSquare />}
              title="Pick a ticket"
              description={
                <>
                  Choose one from the queue. Press <kbd className="kbd">J</kbd> and <kbd className="kbd">K</kbd> to move through it.
                </>
              }
            />
          )}
        </div>
      </div>
      {newDialog}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewTicketDialog({ open, onOpenChange, onCreated, conversationId, defaultSubject }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
  conversationId?: string;
  defaultSubject?: string;
}) {
  const create = useCreateTicket();
  const [subject, setSubject] = useState(defaultSubject ?? '');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [escalated, setEscalated] = useState(Boolean(conversationId));
  useEffect(() => {
    if (open) {
      setSubject(defaultSubject ?? '');
      setPriority('normal');
      setEscalated(Boolean(conversationId));
    }
  }, [open, defaultSubject, conversationId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { subject: subject.trim() || undefined, priority, conversation_id: conversationId, escalated: conversationId ? escalated : undefined },
      { onSuccess: (t) => (onOpenChange(false), onCreated(t.id)) },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={conversationId ? 'Open a ticket for this conversation' : 'New ticket'}
      description={conversationId ? 'The conversation and its history move into the ticket.' : 'For a case raised outside chat, such as a phone call or email.'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="accent" type="submit" form="new-ticket" loading={create.isPending} disabled={!conversationId && !subject.trim()}>
            Create ticket
          </Button>
        </>
      }
    >
      <form id="new-ticket" onSubmit={submit} className="grid gap-4">
        <Field label="Subject" optional={Boolean(conversationId)} hint={conversationId ? "Defaults to the conversation's title." : undefined} aside={`${subject.length}/200`}>
          <Input value={subject} onChange={(e) => setSubject(e.target.value.slice(0, 200))} autoFocus placeholder="What's the case about?" />
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY[p].label }))} />
        </Field>
        {conversationId && (
          <Switch checked={escalated} onCheckedChange={setEscalated} label="Take over now" description="The assistant stops replying in this conversation until you hand it back." />
        )}
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Handoffs: conversations the assistant flagged for the team.          */
/* ------------------------------------------------------------------ */

export function HandoffsPage() {
  const { href, can } = useScopeCtx();
  const nav = useNavigate();
  const q = useHandoffs();
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null);
  return (
    <Page>
      <PageHeader
        eyebrow={<Link to={href('tickets')} className="hover:text-ink">← Tickets</Link>}
        title="Handoffs"
        description="Conversations the assistant flagged for a person, with no ticket yet. It keeps replying until someone takes over."
      />
      <Card flush>
        {q.isPending ? (
          <SkeletonRows rows={5} className="p-4" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data.length ? (
          <EmptyState icon={<Hand />} title="No handoffs waiting" description="When the assistant decides a customer needs a person, the conversation shows up here." />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.map((h) => (
              <li key={h.conversation_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="grid size-9 place-items-center rounded-[10px] bg-violet-soft text-violet-ink">
                  <Hand className="size-4" />
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="truncate text-[0.875rem] font-semibold text-ink">{h.title}</p>
                  <p className="text-xs text-ink-faint">
                    <Badge tone="outline" className="mr-1.5 px-1.5 py-0 text-[0.68rem]">{h.channel}</Badge>
                    flagged {formatRelative(h.updated_at)} · <span className="font-mono">{h.conversation_id.slice(0, 16)}…</span>
                  </p>
                </div>
                {can('tickets.write') && (
                  <Button variant="accent" size="xs" leading={<ArrowRightLeft />} onClick={() => setTarget({ id: h.conversation_id, title: h.title })}>
                    Take over
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <NewTicketDialog
        open={Boolean(target)}
        onOpenChange={(o) => !o && setTarget(null)}
        conversationId={target?.id}
        defaultSubject={target?.title}
        onCreated={(id) => nav(href(`tickets/${id}`))}
      />
    </Page>
  );
}

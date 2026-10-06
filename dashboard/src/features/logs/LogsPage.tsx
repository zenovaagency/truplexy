import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, Download, ScrollText, Search } from 'lucide-react';
import { useAudit, useMembers } from '@/lib/api/endpoints/business';
import type { AuditEvent } from '@/lib/api/types';
import { AUDIT_CATEGORY_LABEL, auditCategory, describeAudit, type AuditCategory } from '@/lib/audit';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative, isoDay } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import { useDebounce } from '@/hooks';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, Page, PageHeader, Select, SkeletonRows, type Tone } from '@/components/ui';

const CATEGORY_TONE: Record<AuditCategory, Tone> = {
  members: 'violet',
  invites: 'cyan',
  keys: 'warn',
  bots: 'accent',
  business: 'neutral',
  plan: 'live',
  billing: 'live',
  webhook: 'outline',
  other: 'neutral',
};

function toCsv(rows: AuditEvent[], actorName: (e: AuditEvent) => string) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['time', 'actor', 'actor_email', 'action', 'target', 'details'];
  return [head.join(','), ...rows.map((e) => [e.created_at, actorName(e), e.actor_email, e.action, e.target, e.details ? JSON.stringify(e.details) : ''].map(esc).join(','))].join('\n');
}

export default function LogsPage() {
  const { businessName, scope } = useScopeCtx();
  const q = useAudit();
  const members = useMembers();
  const [category, setCategory] = useState<AuditCategory | ''>('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const term = useDebounce(search.trim().toLowerCase(), 200);
  const [open, setOpen] = useState<string | null>(null);

  const nameOf = (id: string) => members.data?.find((m) => m.user_id === id)?.name;
  const actorName = (e: AuditEvent) => (e.actor === 'service' ? 'Admin key' : (nameOf(e.actor) ?? e.actor_email ?? e.actor));

  const actors = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of q.data ?? []) m.set(e.actor, actorName(e));
    return [...m];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, members.data]);

  const rows = useMemo(
    () =>
      (q.data ?? []).filter((e) => {
        if (category && auditCategory(e.action) !== category) return false;
        if (actor && e.actor !== actor) return false;
        const day = e.created_at.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (term) {
          const d = describeAudit(e, nameOf);
          const hay = `${actorName(e)} ${e.action} ${d.verb} ${d.target} ${JSON.stringify(e.details ?? {})}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, category, actor, from, to, term, members.data],
  );

  const filtered = Boolean(category || actor || from || to || term);

  const download = () => {
    const blob = new Blob([toCsv(rows, actorName)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `truplexy-activity-${scope.tenant}-${isoDay(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <Page>
      <PageHeader
        title="Logs"
        description={`Who changed what in ${businessName}: members, invitations, roles, bots, API keys, plan and business details. Conversations and documents aren't logged here.`}
        actions={
          <Button leading={<Download />} onClick={download} disabled={!rows.length}>
            Export CSV
          </Button>
        }
      />

      <Card flush>
        <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input size="sm" className="pl-9" placeholder="Search activity" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search activity" />
          </div>
          <Select size="sm" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as AuditCategory | '')} placeholder="All activity"
            options={(Object.keys(AUDIT_CATEGORY_LABEL) as AuditCategory[]).map((c) => ({ value: c, label: AUDIT_CATEGORY_LABEL[c] }))} />
          <Select size="sm" aria-label="Person" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Anyone" options={actors.map(([id, name]) => ({ value: id, label: name }))} />
          <Input size="sm" type="date" aria-label="From" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <Input size="sm" type="date" aria-label="To" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>

        {q.isPending ? (
          <SkeletonRows rows={8} className="p-4" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !rows.length ? (
          filtered ? (
            <EmptyState compact icon={<Search />} title="No activity matches" action={<Button size="xs" onClick={() => (setCategory(''), setActor(''), setFrom(''), setTo(''), setSearch(''))}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={<ScrollText />} title="Nothing logged yet" description="Changes to your team, keys, bots and business show up here." />
          )
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((e) => {
              const d = describeAudit(e, nameOf);
              const cat = auditCategory(e.action);
              const expanded = open === e.id;
              const name = actorName(e);
              return (
                <Fragment key={e.id}>
                  <li>
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : e.id)}
                      aria-expanded={expanded}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 sm:items-center sm:px-5"
                    >
                      <Avatar name={name} email={e.actor_email} size={28} className="mt-0.5 sm:mt-0" />
                      <span className="grid min-w-0 flex-1 gap-1 sm:flex sm:items-center sm:gap-3">
                        <span className="min-w-0 flex-1 text-[0.8125rem] text-ink-muted">
                          <span className="font-semibold text-ink">{name}</span> {d.verb}
                          {d.target && <span className="font-semibold text-ink"> {d.target}</span>}
                          {d.extra}
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge tone={CATEGORY_TONE[cat]} className="px-2 py-px text-[0.68rem]">{AUDIT_CATEGORY_LABEL[cat]}</Badge>
                          <time dateTime={e.created_at} title={formatDateTime(e.created_at)} className="whitespace-nowrap text-xs text-ink-faint">
                            {formatRelative(e.created_at)}
                          </time>
                        </span>
                      </span>
                      <ChevronRight className={cn('mt-1.5 size-4 shrink-0 text-ink-faint transition-transform sm:mt-0', expanded && 'rotate-90')} />
                    </button>
                  </li>
                  {expanded && (
                    <li className="bg-surface-2/50 px-4 py-4 sm:px-5 sm:pl-[60px]">
                      <dl className="grid gap-2 text-xs sm:grid-cols-[140px_minmax(0,1fr)]">
                        <dt className="text-ink-faint">Action</dt>
                        <dd className="font-mono text-ink">{e.action}</dd>
                        <dt className="text-ink-faint">Target</dt>
                        <dd className="break-all font-mono text-ink">{e.target}</dd>
                        <dt className="text-ink-faint">Actor</dt>
                        <dd className="break-all font-mono text-ink">{e.actor}{e.actor_email && ` · ${e.actor_email}`}</dd>
                        <dt className="text-ink-faint">Time</dt>
                        <dd className="text-ink">{formatDateTime(e.created_at)}</dd>
                        {e.details && (
                          <>
                            <dt className="text-ink-faint">Details</dt>
                            <dd>
                              <pre className="overflow-x-auto rounded-[10px] border border-line bg-surface p-3 font-mono text-[0.7rem] text-ink">{JSON.stringify(e.details, null, 2)}</pre>
                            </dd>
                          </>
                        )}
                      </dl>
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ul>
        )}
        <p className="border-t border-line px-5 py-3 text-xs text-ink-faint">
          Showing {rows.length} of the latest {q.data?.length ?? 0} events. The log keeps the 100 most recent.
        </p>
      </Card>
    </Page>
  );
}

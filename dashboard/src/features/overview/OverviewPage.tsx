import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  Gauge,
  Inbox,
  MessagesSquare,
  ScrollText,
  Sparkles,
  Timer,
} from 'lucide-react';
import { useMe } from '@/lib/api/endpoints/account';
import { useAudit, useMembers, useTenant } from '@/lib/api/endpoints/business';
import { useSupportStats, useUsageSummary } from '@/lib/api/endpoints/stats';
import { useRecentTickets } from '@/lib/api/endpoints/tickets';
import { describeAudit } from '@/lib/audit';
import { planUsage } from '@/lib/billing';
import { cn } from '@/lib/cn';
import {
  dayRange,
  formatCompact,
  formatCurrency,
  formatDate,
  formatDuration,
  formatMs,
  formatNumber,
  formatPercent,
  formatRelative,
  previousRange,
} from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import { useStoredState } from '@/hooks';
import { Avatar, Card, EmptyState, ErrorState, Page, PageHeader, Segmented, Skeleton, SkeletonRows } from '@/components/ui';
import { BarList, Legend, TrendChart, type Series } from '@/components/charts';
import { compareStat, StatCard } from '@/components/domain/StatCard';
import { PriorityBadge, TicketStatusBadge } from '@/components/domain/badges';

type Days = '7' | '30' | '90';
type Metric = 'requests' | 'total_tokens' | 'estimated_cost';

const SUPPORT_SERIES: Series[] = [
  { key: 'conversations', label: 'Conversations', slot: 1 },
  { key: 'tickets_created', label: 'Tickets opened', slot: 2 },
  { key: 'tickets_closed', label: 'Tickets closed', slot: 3 },
];

const METRIC: Record<Metric, { label: string; format: (n: number) => string }> = {
  requests: { label: 'Requests', format: formatNumber },
  total_tokens: { label: 'Tokens', format: formatCompact },
  estimated_cost: { label: 'Cost', format: formatCurrency },
};

/** Monthly limits reset on the 1st, UTC. */
function nextMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const { bots, businessName, bot, can, href } = useScopeCtx();
  const me = useMe();
  const [days, setDays] = useStoredState<Days>('truplexy.overview.days', '30');
  const [statsScope, setStatsScope] = useState<'bot' | 'business'>('bot');
  const [metric, setMetric] = useState<Metric>('requests');
  const range = useMemo(() => dayRange(Number(days)), [days]);
  const prevRange = useMemo(() => previousRange(range), [range]);

  const usage = useUsageSummary(range);
  const support = useSupportStats(range, statsScope);
  const prevSupport = useSupportStats(prevRange, statsScope);
  const tenant = useTenant();

  const s = support.data;
  // A placeholder still holds the last range's previous period, which would compare the wrong days.
  const p = prevSupport.isPlaceholderData ? undefined : prevSupport.data;
  const u = usage.data;
  const t = tenant.data;
  const firstName = me.data?.user.name?.split(' ')[0];

  const vs = `vs previous ${days} days`;
  const replyTarget = t ? t.reply_target_hours * 3600 : undefined;
  const firstReply = s?.first_response.median_seconds;
  const overTarget = firstReply != null && replyTarget != null && firstReply > replyTarget;
  const plan = t ? planUsage(t) : undefined;
  const backlogCounts = s
    ? [
        { key: 'open', label: 'Open', value: s.backlog.total, to: 'tickets' },
        { key: 'overdue', label: 'Overdue', value: s.backlog.overdue, to: 'tickets?flag=overdue' },
        { key: 'unassigned', label: 'Unassigned', value: s.backlog.unassigned, to: 'tickets?flag=unassigned' },
      ]
    : [];

  return (
    <Page>
      <PageHeader
        eyebrow={businessName}
        title={
          <>
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </>
        }
        description={`How ${bot.name} is doing, and what needs your team.`}
        actions={
          <>
            {bots.length > 1 && (
              <Segmented
                label="Stats scope"
                value={statsScope}
                onChange={setStatsScope}
                options={[
                  { value: 'bot', label: 'This bot' },
                  { value: 'business', label: 'All bots' },
                ]}
              />
            )}
            <Segmented
              label="Date range"
              value={days}
              onChange={setDays}
              options={[
                { value: '7', label: '7d' },
                { value: '30', label: '30d' },
                { value: '90', label: '90d' },
              ]}
            />
          </>
        }
      />

      {support.isError && !s ? (
        <Card>
          <ErrorState error={support.error} onRetry={() => support.refetch()} />
        </Card>
      ) : (
        <div className={cn('grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3 transition-opacity', support.isPlaceholderData && 'opacity-60')}>
          <StatCard
            label="Conversations"
            icon={<MessagesSquare />}
            loading={!s}
            value={formatNumber(s?.conversations.total)}
            delta={compareStat(s?.conversations.total, p?.conversations.total, { better: 'none', title: vs })}
            sub={s && `${formatNumber(s.conversations.handed_off)} handed to a person · ${formatNumber(s.conversations.escalated)} escalated`}
            trend={s?.by_day.map((d) => d.conversations)}
          />
          <StatCard
            label="Resolved by AI"
            icon={<Sparkles />}
            loading={!s}
            value={formatPercent(s?.conversations.deflection_rate)}
            delta={compareStat(s?.conversations.deflection_rate, p?.conversations.deflection_rate, { kind: 'points', title: vs })}
            sub={s && `${formatNumber(s.conversations.ai_only)} conversations without a person`}
            meter={s?.conversations.deflection_rate ?? 0}
            info="Share of conversations the assistant handled alone: no handoff, no escalation, no ticket from the customer."
          />
          <StatCard
            label="First reply"
            icon={<Timer />}
            loading={!s || !t}
            value={formatDuration(firstReply)}
            delta={compareStat(firstReply, p?.first_response.median_seconds, { better: 'down', title: vs })}
            sub={s && t && `Median · target ${formatDuration(replyTarget)} · 90% within ${formatDuration(s.first_response.p90_seconds)}`}
            meter={firstReply != null && replyTarget ? Math.min(1, firstReply / replyTarget) : 0}
            tone={overTarget ? 'warn' : undefined}
            info="How long customers wait for a person's first reply on a ticket. The bar fills toward the reply target in Settings."
          />
          <StatCard
            label="Tickets closed"
            icon={<CheckCircle2 />}
            loading={!s}
            value={formatNumber(s?.tickets.closed)}
            delta={compareStat(s?.tickets.closed, p?.tickets.closed, { title: vs })}
            sub={s && `of ${formatNumber(s.tickets.created)} opened · ${formatDuration(s.resolution.median_seconds)} median to close`}
            trend={s?.by_day.map((d) => d.tickets_closed)}
          />
          <StatCard
            label="Cost per AI resolution"
            icon={<Coins />}
            loading={!s}
            value={formatCurrency(s?.cost.per_ai_resolved)}
            delta={compareStat(s?.cost.per_ai_resolved, p?.cost.per_ai_resolved, { better: 'down', title: vs })}
            sub={s && `${formatCurrency(s.cost.total)} in this period · ${formatCurrency(s.cost.per_conversation)} per conversation`}
            trend={s?.by_day.map((d) => d.ticket_cost)}
            info="AI cost for each conversation the assistant resolved without a person. Estimated; billing may differ."
          />
          <StatCard
            label="Plan usage"
            icon={<Gauge />}
            loading={!t}
            value={t ? (plan ? formatPercent(plan.share) : 'Unlimited') : '—'}
            sub={
              t &&
              (plan
                ? `${formatCompact(plan.used)} of ${formatCompact(plan.limit)} ${plan.unit} this month · resets ${formatDate(nextMonthStart(), { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
                : `No monthly limit on the ${t.plan} plan`)
            }
            // Unlimited plans get an empty bar so the card keeps the same footer as its neighbours.
            meter={t ? (plan?.share ?? 0) : undefined}
            tone={plan && plan.share >= 1 ? 'danger' : plan && plan.share >= 0.9 ? 'warn' : undefined}
            info="This month's replies and tokens across every bot, against your plan. Shows whichever is closer to its limit."
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Conversations and tickets" description="Per day, in UTC." actions={<Legend series={SUPPORT_SERIES} />}>
          {s ? <TrendChart data={s.by_day} series={SUPPORT_SERIES} height={260} /> : <Skeleton className="h-[260px]" />}
        </Card>
        <Card title="Backlog" description="Open tickets right now, by priority.">
          {s ? (
            <div className="grid gap-6">
              <div className="grid grid-cols-3 gap-2">
                {backlogCounts.map((b) => (
                  <Link
                    key={b.key}
                    to={href(b.to)}
                    className="grid gap-0.5 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 transition-colors hover:border-line-strong"
                  >
                    <span className="text-xs text-ink-faint">{b.label}</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-ink">{formatNumber(b.value)}</span>
                  </Link>
                ))}
              </div>
              <div className="grid gap-2">
                <p className="mono text-ink-faint">By priority</p>
                <div className="flex flex-wrap gap-2">
                  {(['urgent', 'high', 'normal', 'low'] as const).map((p) => (
                    <Link
                      key={p}
                      to={href(`tickets?priority=${p}`)}
                      className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 transition-colors hover:border-line-strong"
                    >
                      <PriorityBadge priority={p} />
                      <span className="font-mono text-xs tabular-nums text-ink">{s.backlog.by_priority[p] ?? 0}</span>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-[0.8125rem]">
                <div>
                  <p className="text-ink-faint">Time to close, median</p>
                  <p className="font-semibold text-ink">{formatDuration(s.resolution.median_seconds)}</p>
                </div>
                <div>
                  <p className="text-ink-faint">Reopened</p>
                  <p className="font-semibold text-ink">
                    {formatPercent(s.tickets.reopen_rate)} <span className="font-normal text-ink-faint">of closed</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <SkeletonRows rows={3} />
          )}
        </Card>
      </div>

      <Card
        title="AI usage"
        description={u ? `${formatNumber(u.requests)} requests · ${formatCompact(u.total_tokens)} tokens · ${formatCurrency(u.estimated_cost)} · ${formatMs(u.avg_latency_ms)} average latency` : 'Model requests for this bot.'}
        actions={
          <Segmented
            size="xs"
            label="Metric"
            value={metric}
            onChange={setMetric}
            options={(Object.keys(METRIC) as Metric[]).map((k) => ({ value: k, label: METRIC[k].label }))}
          />
        }
      >
        {u ? (
          <TrendChart data={u.by_day} series={[{ key: metric, label: METRIC[metric].label, slot: 1 }]} kind="bar" format={METRIC[metric].format} height={220} />
        ) : usage.isError ? (
          <ErrorState compact error={usage.error} onRetry={() => usage.refetch()} />
        ) : (
          <Skeleton className="h-[220px]" />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Models" description="Requests per model.">
          {u ? (
            <BarList
              items={u.by_model.map((m) => ({ key: m.model, label: m.model.split('/').pop()!, value: m.requests, hint: formatCurrency(m.estimated_cost) }))}
            />
          ) : (
            <SkeletonRows rows={3} />
          )}
        </Card>
        <Card title="Answer quality" description={u ? `${formatNumber(u.rag.requests)} answers used the knowledge base.` : undefined}>
          {u ? (
            <ul className="grid gap-3.5 text-[0.8125rem]">
              {[
                { label: 'No answer found', v: u.rag.no_answer_rate, bad: true, hint: 'Add knowledge for these questions.' },
                { label: 'Handed to a person', v: u.rag.handoff_rate, bad: true },
                { label: 'Asked to clarify', v: u.rag.clarification_rate },
                { label: 'Served from cache', v: u.rag.cache_hit_rate },
                { label: 'Degraded retrieval', v: u.rag.degraded_rate, bad: true },
              ].map((r) => (
                <li key={r.label} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">{r.label}</span>
                    <span className={cn('font-mono text-xs tabular-nums', r.bad && r.v > 0.15 ? 'text-warn' : 'text-ink')}>{formatPercent(r.v, 1)}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(1, r.v * 100)}%` }} />
                  </div>
                </li>
              ))}
              <li className="flex justify-between border-t border-line pt-3 text-xs text-ink-faint">
                <span>Retrieval, average</span>
                <span className="font-mono text-ink">{formatMs(u.rag.avg_retrieval_ms)}</span>
              </li>
            </ul>
          ) : (
            <SkeletonRows rows={4} />
          )}
        </Card>
        <Card
          title="Tool calls"
          description={u ? `${formatNumber(u.tool_calls.total)} calls · ${formatNumber(u.tool_calls.errors)} errors · ${formatMs(u.tool_calls.avg_latency_ms)} average` : undefined}
        >
          {u ? (
            <BarList
              empty="No tool calls in this period."
              items={u.tool_calls.by_tool.map((tc) => ({
                key: tc.name,
                label: <span className="font-mono text-xs">{tc.name}</span>,
                value: tc.calls,
                hint: tc.errors ? `${tc.errors} err` : undefined,
              }))}
            />
          ) : (
            <SkeletonRows rows={3} />
          )}
        </Card>
      </div>

      <div className={cn('grid gap-4', can('audit.read') && 'lg:grid-cols-2')}>
        {can('tickets.read') && <RecentTickets />}
        {can('audit.read') && <RecentActivity />}
      </div>
    </Page>
  );
}

function RecentTickets() {
  const { href } = useScopeCtx();
  const q = useRecentTickets(7);
  return (
    <Card
      title="Recent tickets"
      flush
      actions={
        <Link to={href('tickets')} className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-accent hover:underline">
          All tickets <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      {q.isPending ? (
        <SkeletonRows rows={5} className="p-4" />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState compact icon={<Inbox />} title="No tickets yet" description="When customers need a person, their tickets show up here." />
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((t) => (
            <li key={t.id}>
              <Link to={href(`tickets/${t.id}`)} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60">
                <span className={cn('size-2 shrink-0 rounded-full', t.needs_reply ? 'bg-btn' : 'bg-transparent')} aria-label={t.needs_reply ? 'Needs reply' : undefined} />
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="truncate text-[0.8125rem] font-semibold text-ink">{t.subject}</p>
                  <p className="truncate text-xs text-ink-faint">
                    {t.assignee_name ?? 'Unassigned'} · {formatRelative(t.updated_at)}
                  </p>
                </div>
                <div className="hidden shrink-0 items-center gap-2 sm:flex">
                  {t.priority !== 'normal' && <PriorityBadge priority={t.priority} />}
                  <TicketStatusBadge status={t.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentActivity() {
  const { href } = useScopeCtx();
  const q = useAudit();
  const members = useMembers();
  const nameOf = (id: string) => members.data?.find((m) => m.user_id === id)?.name;
  return (
    <Card
      title="Team activity"
      flush
      actions={
        <Link to={href('logs')} className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-accent hover:underline">
          Full log <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      {q.isPending ? (
        <SkeletonRows rows={5} className="p-4" />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState compact icon={<ScrollText />} title="No activity yet" />
      ) : (
        <ul className="divide-y divide-line">
          {q.data.slice(0, 7).map((e) => {
            const d = describeAudit(e, nameOf);
            const actor = e.actor === 'service' ? 'Admin key' : (nameOf(e.actor) ?? e.actor_email ?? 'Someone');
            return (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                <Avatar name={actor} email={e.actor_email} size={26} className="mt-0.5" />
                <p className="min-w-0 flex-1 text-[0.8125rem] text-ink-muted">
                  <span className="font-semibold text-ink">{actor}</span> {d.verb}
                  {d.target && <span className="font-semibold text-ink"> {d.target}</span>}
                  {d.extra}
                  <span className="block text-xs text-ink-faint">{formatRelative(e.created_at)}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

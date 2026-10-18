import { useMemo, useState } from 'react';
import { Activity, Bot, Coins, Gauge, Hash, MessagesSquare, Ticket, Users } from 'lucide-react';
import { useTenant } from '@/lib/api/endpoints/business';
import { useSupportStats, useUsageSummary } from '@/lib/api/endpoints/stats';
import { dayRange, formatCompact, formatCurrency, formatDate, formatMs, formatNumber, formatPercent } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import { useStoredState } from '@/hooks';
import { Card, DataTable, ErrorState, Page, PageHeader, Segmented, Skeleton, SkeletonRows, type Column } from '@/components/ui';
import { TrendChart } from '@/components/charts';
import { StatCard } from '@/components/domain/StatCard';

type Days = '7' | '30' | '90';
type Metric = 'estimated_cost' | 'requests' | 'total_tokens';

const METRIC: Record<Metric, { label: string; format: (n: number) => string }> = {
  estimated_cost: { label: 'Cost', format: formatCurrency },
  requests: { label: 'Requests', format: formatNumber },
  total_tokens: { label: 'Tokens', format: formatCompact },
};

interface Row {
  id: string;
  label: string;
  requests: number;
  tokens: number;
  cost: number;
  latency: number;
}

/** Monthly limits reset on the 1st, UTC. */
function nextMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/** What this business and bot use: the plan's allowances, the volume handled, and what the model costs. */
export default function UsagePage() {
  const { bot } = useScopeCtx();
  const [days, setDays] = useStoredState<Days>('truplexy.usage.days', '30');
  const [metric, setMetric] = useState<Metric>('estimated_cost');
  const range = useMemo(() => dayRange(Number(days)), [days]);
  const usage = useUsageSummary(range);
  const support = useSupportStats(range, 'bot');
  const tenant = useTenant();
  const u = usage.data;
  const s = support.data;
  const t = tenant.data;

  // The API reports the five busiest models; the rest of the requests are counted in the totals.
  const { rows, otherRequests } = useMemo(() => {
    if (!u) return { rows: [] as Row[], otherRequests: 0 };
    const reported = u.by_model.reduce((n, m) => n + m.requests, 0);
    const out: Row[] = u.by_model
      .map((m) => ({ id: m.model, label: m.model.split('/').pop()!, requests: m.requests, tokens: m.total_tokens, cost: m.estimated_cost, latency: m.avg_latency_ms }))
      .sort((a, b) => b.requests - a.requests);
    return { rows: out, otherRequests: Math.max(0, u.requests - reported) };
  }, [u]);

  const columns: Column<Row>[] = [
    {
      key: 'model',
      header: 'Model',
      cell: (r) => (
        <span className="grid min-w-0">
          <span className="font-semibold text-ink">{r.label}</span>
          <span className="truncate font-mono text-[0.68rem] text-ink-faint">{r.id}</span>
        </span>
      ),
    },
    { key: 'requests', header: 'Requests', align: 'right', cell: (r) => <Num v={r.requests} f={formatNumber} /> },
    {
      key: 'share',
      header: 'Share',
      hideBelowLg: true,
      cell: (r) =>
        !u?.requests ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(r.requests / u.requests) * 100}%` }} />
            </span>
            <span className="text-xs tabular-nums text-ink-muted">{formatPercent(r.requests / u.requests)}</span>
          </span>
        ),
    },
    { key: 'tokens', header: 'Tokens', align: 'right', hideBelowLg: true, cell: (r) => <Num v={r.tokens} f={formatCompact} /> },
    { key: 'cost', header: 'Cost', align: 'right', cell: (r) => <Num v={r.cost} f={formatCurrency} /> },
    { key: 'latency', header: 'Avg latency', align: 'right', hideBelowLg: true, cell: (r) => <Num v={r.latency} f={formatMs} /> },
  ];

  const resets = formatDate(nextMonthStart(), { month: 'short', day: 'numeric', timeZone: 'UTC' });
  /** A plan allowance as a card; a limit of 0 means unlimited. */
  const allowance = (label: string, icon: React.ReactNode, used: number | undefined, limit: number | undefined, format: (n: number) => string, info: string) => {
    const capped = Boolean(limit && limit > 0);
    const share = capped && used !== undefined ? used / limit! : 0;
    return (
      <StatCard
        key={label}
        label={label}
        icon={icon}
        loading={!t}
        value={used === undefined ? '—' : format(used)}
        sub={capped ? `of ${format(limit!)}${label === 'Replies' || label === 'Tokens' ? ` · resets ${resets}` : ''}` : 'No limit on your plan'}
        meter={t ? (capped ? share : 0) : undefined}
        tone={share >= 1 ? 'danger' : share >= 0.9 ? 'warn' : undefined}
        info={info}
      />
    );
  };

  return (
    <Page>
      <PageHeader
        title="Usage"
        description={`What your plan allows and what ${bot.name} is using: replies, tokens, conversations and model costs.`}
        actions={
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
        }
      />

      <section className="grid gap-3" aria-labelledby="usage-plan">
        <h2 id="usage-plan" className="text-[0.9375rem] font-bold text-ink">
          Your plan, this month
        </h2>
        {tenant.isError && !t ? (
          <Card>
            <ErrorState compact error={tenant.error} onRetry={() => tenant.refetch()} />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {allowance('Tokens', <Hash />, t?.usage.tokens_this_month, t?.limits.tokens_per_month, formatCompact, 'Tokens used by every bot this month, against your plan.')}
            {allowance('Replies', <MessagesSquare />, t?.usage.replies_this_month, t?.limits.replies_per_month, formatNumber, 'Replies sent by every bot this month, against your plan.')}
            {allowance('Bots', <Bot />, t?.usage.bots, t?.limits.bots, formatNumber, 'Bots in this business.')}
            {allowance('Team members', <Users />, t?.usage.members, t?.limits.members, formatNumber, 'People in this business.')}
          </div>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="usage-bot">
        <h2 id="usage-bot" className="text-[0.9375rem] font-bold text-ink">
          {bot.name}, last {days} days
        </h2>
        {usage.isError && !u ? (
          <Card>
            <ErrorState error={usage.error} onRetry={() => usage.refetch()} />
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Conversations" icon={<MessagesSquare />} loading={!s} value={formatNumber(s?.conversations.total)} sub={s && `${formatPercent(s.conversations.deflection_rate)} answered by the assistant alone`} trend={s?.by_day.map((d) => d.conversations)} />
              <StatCard label="Tickets opened" icon={<Ticket />} loading={!s} value={formatNumber(s?.tickets.created)} sub={s && `${formatNumber(s.tickets.closed)} closed · ${formatNumber(s.conversations.handed_off)} handed to a person`} trend={s?.by_day.map((d) => d.tickets_created)} />
              <StatCard label="Cost per conversation" icon={<Coins />} loading={!s} value={formatCurrency(s?.cost.per_conversation)} sub={s && `${formatCurrency(s.cost.per_ai_resolved)} per answer without a person`} />
              <StatCard label="Requests" icon={<Activity />} loading={!u} value={formatNumber(u?.requests)} trend={u?.by_day.map((d) => d.requests)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Tokens"
                icon={<Hash />}
                loading={!u}
                value={formatCompact(u?.total_tokens)}
                sub={u && `${formatCompact(u.input_tokens)} in · ${formatCompact(u.output_tokens)} out`}
              />
              <StatCard
                label="Cost"
                icon={<Coins />}
                loading={!u}
                value={formatCurrency(u?.estimated_cost)}
                sub={u && u.requests > 0 ? `${formatCurrency(u.estimated_cost / u.requests)} per request` : undefined}
                info="What you were billed: each model's price, fees included."
                trend={u?.by_day.map((d) => d.estimated_cost)}
              />
              <StatCard label="Average latency" icon={<Gauge />} loading={!u} value={formatMs(u?.avg_latency_ms)} sub="From request to full reply" />
            </div>

            <Card
              title="Per day"
              description="Model requests made for this bot's customers, per UTC day."
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
                <TrendChart data={u.by_day} series={[{ key: metric, label: METRIC[metric].label, slot: 1 }]} kind="bar" format={METRIC[metric].format} height={240} />
              ) : (
                <Skeleton className="h-[240px]" />
              )}
            </Card>

            <Card title="By model" description="The models that answered in this period. Truplexy picks one for each message." flush>
              {!u ? (
                <div className="p-5">
                  <SkeletonRows rows={4} />
                </div>
              ) : (
                <DataTable columns={columns} rows={rows} getKey={(r) => r.id} />
              )}
              {otherRequests > 0 && (
                <p className="border-t border-line px-5 py-3 text-xs text-ink-faint">
                  The usage report breaks out the five busiest models; {formatNumber(otherRequests)} requests to other models aren't listed.
                </p>
              )}
            </Card>
          </>
        )}
      </section>
    </Page>
  );
}

function Num({ v, f }: { v: number; f: (n: number) => string }) {
  return <span className="text-xs tabular-nums text-ink">{f(v)}</span>;
}

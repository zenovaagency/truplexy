import { useMemo, useState } from 'react';
import { Activity, Coins, Gauge, Hash } from 'lucide-react';
import { useUsageSummary } from '@/lib/api/endpoints/stats';
import { cn } from '@/lib/cn';
import { dayRange, formatCompact, formatCurrency, formatMs, formatNumber, formatPercent } from '@/lib/format';
import { useStoredState } from '@/hooks';
import { Card, DataTable, ErrorState, Segmented, Skeleton, SkeletonRows, type Column } from '@/components/ui';
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

/** Model usage for this bot: which models answered, and what they cost. */
export default function UsageTab() {
  const [days, setDays] = useStoredState<Days>('truplexy.llm.days', '30');
  const [metric, setMetric] = useState<Metric>('estimated_cost');
  const range = useMemo(() => dayRange(Number(days)), [days]);
  const usage = useUsageSummary(range);
  const u = usage.data;

  // The API reports the five busiest models; the rest of the requests are counted in the totals above.
  const { rows, otherRequests } = useMemo(() => {
    if (!u) return { rows: [] as Row[], otherRequests: 0 };
    const reported = u.by_model.reduce((s, m) => s + m.requests, 0);
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

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-ink-muted">Model requests made for this bot's customers, per UTC day.</p>
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
      </div>

      {usage.isError && !u ? (
        <Card>
          <ErrorState error={usage.error} onRetry={() => usage.refetch()} />
        </Card>
      ) : (
        <>
          <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4 transition-opacity', usage.isPlaceholderData && 'opacity-60')}>
            <StatCard label="Requests" icon={<Activity />} loading={!u} value={formatNumber(u?.requests)} trend={u?.by_day.map((d) => d.requests)} />
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
    </div>
  );
}

function Num({ v, f }: { v: number; f: (n: number) => string }) {
  return <span className="text-xs tabular-nums text-ink">{f(v)}</span>;
}

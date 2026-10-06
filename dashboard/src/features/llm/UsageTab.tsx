import { useMemo, useState } from 'react';
import { Activity, Coins, Gauge, Hash } from 'lucide-react';
import { useModels } from '@/lib/api/endpoints/bot';
import { useUsageSummary } from '@/lib/api/endpoints/stats';
import { cn } from '@/lib/cn';
import { dayRange, formatCompact, formatCurrency, formatMs, formatNumber, formatPercent, formatPerM } from '@/lib/format';
import { useOpenRouterModels } from '@/lib/openrouter';
import { useStoredState } from '@/hooks';
import { Badge, Card, DataTable, ErrorState, Segmented, Skeleton, SkeletonRows, type Column } from '@/components/ui';
import { TrendChart } from '@/components/charts';
import { StatCard } from '@/components/domain/StatCard';
import { useBotDraft } from './draft';

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
  listed: boolean;
  offered: boolean;
  current: boolean;
  /** Null when the model isn't in the API's top-5 breakdown, so its usage is unknown. */
  requests: number | null;
  tokens: number | null;
  cost: number | null;
  latency: number | null;
}

/** Model usage for this bot: every listed model, with what it costs. */
export default function UsageTab() {
  const { ws } = useBotDraft();
  const [days, setDays] = useStoredState<Days>('truplexy.llm.days', '30');
  const [metric, setMetric] = useState<Metric>('estimated_cost');
  const range = useMemo(() => dayRange(Number(days)), [days]);
  const usage = useUsageSummary(range);
  const models = useModels();
  const prices = useOpenRouterModels();
  const u = usage.data;

  const savedModel = ws.bot.model || models.data?.find((m) => m.is_default)?.id;

  const { rows, otherRequests } = useMemo(() => {
    if (!u || !models.data) return { rows: [] as Row[], otherRequests: 0 };
    const used = new Map(u.by_model.map((m) => [m.model, m]));
    const reported = u.by_model.reduce((s, m) => s + m.requests, 0);
    const other = Math.max(0, u.requests - reported);
    const out: Row[] = models.data.map((m) => {
      const x = used.get(m.id);
      used.delete(m.id);
      return {
        id: m.id,
        label: m.label,
        listed: true,
        offered: m.offered,
        current: m.id === savedModel,
        // The API reports the top five models; without a remainder, the others had none.
        requests: x?.requests ?? (other ? null : 0),
        tokens: x?.total_tokens ?? (other ? null : 0),
        cost: x?.estimated_cost ?? (other ? null : 0),
        latency: x?.avg_latency_ms ?? null,
      };
    });
    // Models used in the period but no longer in the catalog.
    for (const x of used.values()) {
      out.push({ id: x.model, label: x.model.split('/').pop()!, listed: false, offered: false, current: false, requests: x.requests, tokens: x.total_tokens, cost: x.estimated_cost, latency: x.avg_latency_ms });
    }
    out.sort((a, b) => (b.requests ?? -1) - (a.requests ?? -1));
    return { rows: out, otherRequests: other };
  }, [u, models.data, savedModel]);

  const columns: Column<Row>[] = [
    {
      key: 'model',
      header: 'Model',
      cell: (r) => (
        <span className="grid min-w-0">
          <span className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
            {r.label}
            {r.current && <Badge tone="accent">In use</Badge>}
            {!r.listed && <Badge tone="outline">Removed</Badge>}
            {r.listed && !r.offered && <Badge tone="warn">No longer offered</Badge>}
          </span>
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
        r.requests == null || !u?.requests ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(r.requests / u.requests) * 100}%` }} />
            </span>
            <span className="font-mono text-xs tabular-nums text-ink-muted">{formatPercent(r.requests / u.requests)}</span>
          </span>
        ),
    },
    { key: 'tokens', header: 'Tokens', align: 'right', hideBelowLg: true, cell: (r) => <Num v={r.tokens} f={formatCompact} /> },
    { key: 'cost', header: 'Cost', align: 'right', cell: (r) => <Num v={r.cost} f={formatCurrency} /> },
    { key: 'latency', header: 'Avg latency', align: 'right', hideBelowLg: true, cell: (r) => <Num v={r.latency} f={formatMs} /> },
    {
      key: 'price',
      header: 'List price in / out',
      align: 'right',
      cell: (r) => {
        const p = prices.data?.byId.get(r.id);
        return p ? (
          <span className="whitespace-nowrap font-mono text-xs tabular-nums text-ink-muted">
            {formatPerM(p.inPerM)} / {formatPerM(p.outPerM)}
          </span>
        ) : (
          <span className="text-xs text-ink-faint">{prices.isPending ? '…' : 'Unavailable'}</span>
        );
      },
    },
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
              label="Estimated cost"
              icon={<Coins />}
              loading={!u}
              value={formatCurrency(u?.estimated_cost)}
              sub={u && u.requests > 0 ? `${formatCurrency(u.estimated_cost / u.requests)} per request` : undefined}
              info="As OpenRouter reported for each request. Billing may differ."
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

          <Card title="By model" description="Every model offered to your business, with what it was used for in this period and its list price per million tokens." flush>
            {!u || models.isPending ? (
              <div className="p-5">
                <SkeletonRows rows={4} />
              </div>
            ) : models.isError ? (
              <ErrorState compact error={models.error} onRetry={() => models.refetch()} />
            ) : (
              <DataTable columns={columns} rows={rows} getKey={(r) => r.id} />
            )}
            {otherRequests > 0 && (
              <p className="border-t border-line px-5 py-3 text-xs text-ink-faint">
                The usage report breaks out the five busiest models; {formatNumber(otherRequests)} requests to other models show as —.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Num({ v, f }: { v: number | null; f: (n: number) => string }) {
  return v == null ? <span className="text-ink-faint">—</span> : <span className="font-mono text-xs tabular-nums text-ink">{f(v)}</span>;
}

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { formatDay, formatNumber } from '@/lib/format';
import { formatLatency } from '@/lib/performance';

export interface RequestsChartDay {
  date: string;
  requests: number;
  errors: number;
  /** null on a day with no requests: a gap, not a 0 ms point. */
  p95: number | null;
}

const axis = { stroke: 'var(--color-ink-faint)', fontSize: 11, tickLine: false, axisLine: false } as const;

const compact = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n));

function Tip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload as RequestsChartDay;
  const rows: [string, string, string][] = [
    ['var(--chart-1)', 'Requests', formatNumber(d.requests)],
    ['var(--chart-3)', 'Errors', formatNumber(d.errors)],
    ['var(--chart-2)', 'p95 latency', d.p95 == null ? 'No requests' : formatLatency(d.p95)],
  ];
  return (
    <div className="min-w-[170px] rounded-[10px] border border-line bg-surface px-3 py-2.5 text-xs shadow-md">
      <p className="mb-1.5 font-semibold text-ink">{typeof label === 'string' ? formatDay(label) : label}</p>
      <ul className="grid gap-1">
        {rows.map(([c, name, value]) => (
          <li key={name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="size-2 rounded-[2px]" style={{ background: c }} />
              {name}
            </span>
            <span className="tabular-nums text-ink">{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Requests and errors per day as bars, p95 latency as a line on the right axis. */
export default function RequestsChart({ data, height = 260 }: { data: RequestsChartDay[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full [&_.recharts-surface]:overflow-visible">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="0" />
          <XAxis dataKey="date" {...axis} tickFormatter={(d: string) => formatDay(d)} minTickGap={28} tickMargin={8} />
          <YAxis yAxisId="count" {...axis} width={44} allowDecimals={false} tickFormatter={compact} />
          <YAxis yAxisId="ms" orientation="right" {...axis} width={52} tickFormatter={(n: number) => formatLatency(n)} />
          <Tooltip cursor={{ fill: 'var(--color-surface-2)' }} content={(p) => <Tip {...(p as TooltipContentProps)} />} />
          <Bar yAxisId="count" dataKey="requests" name="Requests" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          <Bar yAxisId="count" dataKey="errors" name="Errors" fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          <Line
            yAxisId="ms"
            type="monotone"
            dataKey="p95"
            name="p95 latency"
            stroke="var(--chart-2)"
            strokeWidth={2}
            connectNulls={false}
            dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--chart-2)' }}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-surface)' }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

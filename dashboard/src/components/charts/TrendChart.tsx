import { useId } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { formatDay } from '@/lib/format';

export interface Series {
  key: string;
  label: string;
  /** Categorical slot 1–4, in fixed order (see --chart-* in app.css). */
  slot: 1 | 2 | 3 | 4;
}

export interface TrendChartProps {
  data: readonly object[];
  series: Series[];
  /** Field holding the YYYY-MM-DD day. */
  x?: string;
  format?: (n: number) => string;
  height?: number;
  kind?: 'area' | 'bar';
  stacked?: boolean;
}

const color = (slot: number) => `var(--chart-${slot})`;

function ChartTooltip({ active, payload, label, series, format }: TooltipContentProps & { series: Series[]; format: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[160px] rounded-[10px] border border-line bg-surface px-3 py-2.5 text-xs shadow-md">
      <p className="mb-1.5 font-semibold text-ink">{typeof label === 'string' ? formatDay(label) : label}</p>
      <ul className="grid gap-1">
        {series.map((s) => {
          const p = payload.find((x) => x.dataKey === s.key);
          if (!p) return null;
          return (
            <li key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-muted">
                <span className="size-2 rounded-[2px]" style={{ background: color(s.slot) }} />
                {s.label}
              </span>
              <span className="font-mono tabular-nums text-ink">{format(Number(p.value ?? 0))}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A daily trend on one y-axis. Hover shows every series for that day. */
export default function TrendChart({ data, series, x = 'date', format = (n) => n.toLocaleString(), height = 240, kind = 'area', stacked }: TrendChartProps) {
  const gid = useId().replace(/:/g, '');
  const axis = { stroke: 'var(--color-ink-faint)', fontSize: 11, tickLine: false, axisLine: false } as const;
  // Small values (a few cents a day) need fractional ticks in their own format.
  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => Number((d as Record<string, unknown>)[s.key]) || 0)));
  const small = max > 0 && max < 5;
  const common = (
    <>
      <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="0" />
      <XAxis dataKey={x} {...axis} tickFormatter={(d: string) => formatDay(d)} minTickGap={28} tickMargin={8} />
      <YAxis {...axis} width={small ? 52 : 44} tickFormatter={(n: number) => (small ? format(n) : compactTick(n))} allowDecimals={small} />
      <Tooltip
        cursor={kind === 'area' ? { stroke: 'var(--color-line-strong)', strokeWidth: 1 } : { fill: 'var(--color-surface-2)' }}
        content={(p) => <ChartTooltip {...(p as TooltipContentProps)} series={series} format={format} />}
      />
    </>
  );
  return (
    <div style={{ height }} className="w-full [&_.recharts-surface]:overflow-visible">
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'bar' ? (
          <BarChart data={data as object[]} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="22%">
            {common}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId={stacked ? 'a' : undefined}
                fill={color(s.slot)}
                radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
                stroke="var(--color-surface)"
                strokeWidth={stacked ? 1 : 0}
                maxBarSize={22}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        ) : (
          <AreaChart data={data as object[]} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color(s.slot)} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={color(s.slot)} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {common}
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stackId={stacked ? 'a' : undefined}
                stroke={color(s.slot)}
                strokeWidth={2}
                fill={`url(#${gid}-${s.key})`}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-surface)' }}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function compactTick(n: number) {
  if (Math.abs(n) >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n * 100) / 100);
}

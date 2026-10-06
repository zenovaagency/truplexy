import { lazy, Suspense, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui';
import type { Series, TrendChartProps } from './TrendChart';

export type { Series };

// recharts is the heaviest dependency: it loads with the first chart, not the app.
const LazyTrend = lazy(() => import('./TrendChart'));

export function TrendChart(props: TrendChartProps) {
  return (
    <Suspense fallback={<Skeleton style={{ height: props.height ?? 240 }} />}>
      <LazyTrend {...props} />
    </Suspense>
  );
}

/** Legend for ≥ 2 series: identity never rests on colour alone. */
export function Legend({ series, values, className }: { series: Series[]; values?: Record<string, ReactNode>; className?: string }) {
  if (series.length < 2) return null;
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-xs', className)}>
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-ink-muted">
          <span className="size-2.5 rounded-[3px]" style={{ background: `var(--chart-${s.slot})` }} />
          {s.label}
          {values?.[s.key] != null && <span className="font-mono tabular-nums text-ink">{values[s.key]}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Ranked horizontal bars in plain HTML: lighter than an SVG chart and
 * readable on a phone. Each bar's value is labelled, so there is no axis.
 */
export function BarList({
  items,
  format = (n) => n.toLocaleString(),
  empty = 'No data in this period.',
  max,
}: {
  items: { key: string; label: ReactNode; value: number; hint?: ReactNode }[];
  format?: (n: number) => string;
  empty?: ReactNode;
  max?: number;
}) {
  if (!items.length) return <p className="py-6 text-center text-[0.8125rem] text-ink-faint">{empty}</p>;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="grid gap-3">
      {items.map((i) => (
        <li key={i.key} className="grid gap-1.5" title={`${typeof i.label === 'string' ? i.label : i.key}: ${format(i.value)}`}>
          <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="truncate font-medium text-ink">{i.label}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-ink-muted">
              {format(i.value)}
              {i.hint && <span className="ml-2 text-ink-faint">{i.hint}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(2, (i.value / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A tiny trend line for stat cards. Pure SVG, no library. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('h-7 w-full overflow-visible', className)} aria-hidden>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="var(--chart-1)" opacity={0.08} />
      <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A proportion split into segments (e.g. backlog by status), with a legend below. */
export function SplitBar({ parts, format = (n) => n.toLocaleString() }: { parts: { key: string; label: string; value: number; slot: 1 | 2 | 3 | 4 }[]; format?: (n: number) => string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="grid gap-3">
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-surface-3">
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => <div key={p.key} title={`${p.label}: ${format(p.value)}`} style={{ flex: p.value, background: `var(--chart-${p.slot})` }} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="size-2 rounded-[2px]" style={{ background: `var(--chart-${p.slot})` }} />
              {p.label}
            </span>
            <span className="font-mono tabular-nums text-ink">{format(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

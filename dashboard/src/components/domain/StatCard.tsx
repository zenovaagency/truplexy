import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Skeleton, Tip } from '@/components/ui';
import { Sparkline } from '@/components/charts';

export interface StatDelta {
  label: string;
  direction: 'up' | 'down' | 'flat';
  tone: 'good' | 'bad' | 'neutral';
  /** What the change is measured against, e.g. "vs previous 30 days". */
  title?: string;
}

/**
 * The change from `prev` to `curr`: relative ("+12%") or, for rates, in percentage points ("+3.1 pts").
 * Undefined when either side is missing, or when a relative change has nothing to compare with.
 */
export function compareStat(
  curr: number | null | undefined,
  prev: number | null | undefined,
  { kind = 'relative', better = 'up', title }: { kind?: 'relative' | 'points'; better?: 'up' | 'down' | 'none'; title?: string } = {},
): StatDelta | undefined {
  if (curr == null || prev == null || Number.isNaN(curr) || Number.isNaN(prev)) return undefined;
  if (kind === 'relative' && prev === 0) return undefined;
  const change = kind === 'points' ? (curr - prev) * 100 : ((curr - prev) / Math.abs(prev)) * 100;
  const flat = Math.abs(change) < (kind === 'points' ? 0.1 : 0.5);
  const direction = flat ? 'flat' : change > 0 ? 'up' : 'down';
  const tone = flat || better === 'none' ? 'neutral' : direction === better ? 'good' : 'bad';
  const size = Math.abs(change);
  const label = flat
    ? 'No change'
    : kind === 'points'
      ? `${change > 0 ? '+' : '−'}${size.toFixed(1)} pts`
      : `${change > 0 ? '+' : '−'}${size >= 10 ? Math.round(size) : size.toFixed(1)}%`;
  return { label, direction, tone, title };
}

/** A headline number: label, value, one line of context, an optional change, and an optional trend or meter. */
export function StatCard({
  label,
  value,
  delta,
  sub,
  icon,
  trend,
  meter,
  info,
  loading,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: StatDelta;
  sub?: ReactNode;
  icon?: ReactNode;
  trend?: number[];
  /** A 0–1 fill shown as a thin bar along the bottom. */
  meter?: number;
  info?: string;
  loading?: boolean;
  tone?: 'warn' | 'danger';
  className?: string;
}) {
  const hasFooter = trend !== undefined || meter !== undefined;
  return (
    <div className={cn('panel relative flex h-full min-h-[132px] flex-col gap-3 overflow-hidden p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink-muted">
          {label}
          {info && (
            <Tip content={info}>
              <button type="button" className="text-ink-faint hover:text-ink [@media(pointer:coarse)]:min-h-0" aria-label="About this number">
                <Info className="size-3.5" />
              </button>
            </Tip>
          )}
        </p>
        {icon && <span className="grid size-8 place-items-center rounded-[10px] bg-surface-2 text-ink-faint [&_svg]:size-4">{icon}</span>}
      </div>
      {loading ? (
        <div className="grid gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3.5 w-36" />
        </div>
      ) : (
        <div className="grid gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className={cn('text-[1.75rem] font-bold leading-none tracking-tight tabular-nums text-ink', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')}>
              {value}
            </p>
            {delta && <DeltaPill delta={delta} />}
          </div>
          {sub && <p className="line-clamp-2 text-xs text-ink-faint">{sub}</p>}
        </div>
      )}
      {hasFooter && (
        <div className="mt-auto flex h-7 items-end">
          {loading ? null : meter !== undefined ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn('h-full rounded-full bg-[var(--chart-1)]', tone === 'warn' && 'bg-warn', tone === 'danger' && 'bg-danger')}
                style={{ width: `${Math.min(100, Math.max(1, meter * 100))}%` }}
              />
            </div>
          ) : (
            trend && <Sparkline values={trend} />
          )}
        </div>
      )}
    </div>
  );
}

function DeltaPill({ delta }: { delta: StatDelta }) {
  const Icon = delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <span
      title={delta.title}
      aria-label={delta.title ? `${delta.label} ${delta.title}` : delta.label}
      className={cn(
        'inline-flex items-center gap-0.5 self-center rounded-full px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums',
        delta.tone === 'good' && 'bg-resolved-soft text-resolved',
        delta.tone === 'bad' && 'bg-danger-soft text-danger',
        delta.tone === 'neutral' && 'bg-surface-2 text-ink-muted',
      )}
    >
      <Icon className="size-3" aria-hidden />
      {delta.label}
    </span>
  );
}

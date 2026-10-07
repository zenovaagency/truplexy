import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Skeleton, Tip } from '@/components/ui';
import { Sparkline } from '@/components/charts';

/** A headline number: label, value, one line of context, and an optional trend or meter. */
export function StatCard({
  label,
  value,
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
          <p className={cn('text-[1.75rem] font-bold leading-none tracking-tight tabular-nums text-ink', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')}>
            {value}
          </p>
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

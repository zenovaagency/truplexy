import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Skeleton, Tip } from '@/components/ui';
import { Sparkline } from '@/components/charts';

/** A headline number: label, value, one line of context, and an optional trend. */
export function StatCard({
  label,
  value,
  sub,
  icon,
  trend,
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
  info?: string;
  loading?: boolean;
  tone?: 'warn' | 'danger';
  className?: string;
}) {
  return (
    <div className={cn('panel relative flex min-h-[132px] flex-col gap-3 overflow-hidden p-4 sm:p-5', className)}>
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
          {sub && <p className="text-xs text-ink-faint">{sub}</p>}
        </div>
      )}
      {trend && !loading && <Sparkline values={trend} className="mt-auto" />}
    </div>
  );
}

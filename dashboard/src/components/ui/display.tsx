import type { ComponentProps, ReactNode } from 'react';
import { AlertCircle, Check, Copy, Eye, EyeOff, Lock, RefreshCw, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { initials } from '@/lib/format';
import { useCopy } from '@/hooks';
import { Button } from './button';
import { Tip } from './overlay';

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

export type Tone = 'neutral' | 'accent' | 'live' | 'warn' | 'danger' | 'violet' | 'cyan' | 'outline';

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-muted',
  accent: 'bg-accent-soft text-accent',
  live: 'bg-live-soft text-live',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  violet: 'bg-violet-soft text-violet-ink',
  cyan: 'bg-qualified-soft text-qualified',
  outline: 'border border-line text-ink-muted',
};

export function Badge({ tone = 'neutral', dot, className, children, ...rest }: ComponentProps<'span'> & { tone?: Tone; dot?: boolean }) {
  return (
    <span className={cn('chip', TONE[tone], className)} {...rest}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** A small count pill, e.g. next to a nav item or a tab. */
export function Count({ n, tone = 'neutral', className }: { n?: number; tone?: 'neutral' | 'accent' | 'danger'; className?: string }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        'inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 font-mono text-[0.65rem] font-semibold tabular-nums',
        tone === 'accent' && 'bg-btn text-white',
        tone === 'danger' && 'bg-danger text-white dark:text-paper',
        tone === 'neutral' && 'bg-surface-3 text-ink-muted',
        className,
      )}
    >
      {n > 999 ? '999+' : n}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Loading, empty, error                                               */
/* ------------------------------------------------------------------ */

export function Skeleton({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('skeleton', className)} aria-hidden {...rest} />;
}

export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('grid gap-2.5', className)} aria-busy aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14', className)}>
      {icon && (
        <span className="relative grid size-12 place-items-center rounded-2xl border border-line bg-surface-2 text-ink-faint [&_svg]:size-5">
          {icon}
        </span>
      )}
      <div className="grid max-w-sm gap-1">
        <p className="text-[0.9375rem] font-bold text-ink">{title}</p>
        {description && <p className="text-[0.8125rem] text-ink-muted">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className, compact }: { error: unknown; onRetry?: () => void; className?: string; compact?: boolean }) {
  const d = describeError(error);
  return (
    <EmptyState
      compact={compact}
      className={className}
      icon={<AlertCircle className="text-danger" />}
      title={d.title}
      description={
        <>
          {d.detail}
          {d.requestId && <span className="mt-1 block font-mono text-[0.7rem] text-ink-faint">Request {d.requestId}</span>}
        </>
      }
      action={
        onRetry && (
          <Button size="xs" onClick={onRetry} leading={<RefreshCw />}>
            Try again
          </Button>
        )
      }
    />
  );
}

export function NoAccess({ what = 'this page', permission }: { what?: string; permission?: string }) {
  return (
    <EmptyState
      icon={<Lock />}
      title="You don't have access"
      description={
        <>
          Your role can't open {what}. Ask an owner or admin of this business if you need it.
          {permission && <span className="mt-2 block font-mono text-[0.7rem] text-ink-faint">Needs {permission}</span>}
        </>
      }
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return <RefreshCw className={cn('size-4 animate-spin text-ink-faint', className)} aria-label="Loading" />;
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

const AVATAR_BG = ['#2338e6', '#6a2bff', '#0b6e86', '#15803d', '#9a4b00', '#c026d3', '#1f7bff', '#be123c'];

export function Avatar({ name, email, src, size = 28, className }: { name?: string | null; email?: string | null; src?: string | null; size?: number; className?: string }) {
  const seed = (email || name || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(src)}
        className={cn('inline-block shrink-0 rounded-full bg-surface-2 object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center rounded-full font-semibold text-white select-none', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38), background: AVATAR_BG[seed % AVATAR_BG.length] }}
      aria-hidden
    >
      {initials(name, email)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export function Progress({ value, tone = 'accent', className, label }: { value: number; tone?: 'accent' | 'warn' | 'danger' | 'live'; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const bar = { accent: 'bg-btn', warn: 'bg-warn', danger: 'bg-danger', live: 'bg-live' }[tone];
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-expo)]', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Usage against a limit, coloured as it fills. */
export function LimitBar({ label, used, limit, format = String }: { label: ReactNode; used: number; limit: number; format?: (n: number) => string }) {
  // A limit of 0 means unlimited.
  const ratio = limit > 0 ? used / limit : 0;
  // Full is a warning; only going over is an error.
  const tone = ratio > 1 ? 'danger' : ratio >= 0.8 ? 'warn' : 'accent';
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span className="font-medium text-ink">{label}</span>
        <span className="font-mono text-xs tabular-nums text-ink-muted">
          {format(used)} / {limit > 0 ? format(limit) : 'Unlimited'}
        </span>
      </div>
      <Progress value={ratio} tone={tone} label={typeof label === 'string' ? label : undefined} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Copy and secrets                                                    */
/* ------------------------------------------------------------------ */

export function CopyButton({ value, label = 'Copy', className, size = 'xs' }: { value: string; label?: string; className?: string; size?: 'xs' | 'sm' }) {
  const { copied, copy } = useCopy();
  return (
    <Tip content={copied ? 'Copied' : label}>
      <Button size={size} icon variant="quiet" className={className} onClick={() => void copy(value)} aria-label={label}>
        {copied ? <Check className="text-live" /> : <Copy />}
      </Button>
    </Tip>
  );
}

export function CopyField({ value, mono = true, className, masked }: { value: string; mono?: boolean; className?: string; masked?: boolean }) {
  const [show, setShow] = useState(!masked);
  return (
    <div className={cn('flex h-[38px] items-center gap-1 rounded-[10px] border border-line bg-surface-2 pl-3 pr-1', className)}>
      <code className={cn('flex-1 truncate text-[0.8125rem] text-ink', mono && 'font-mono text-xs')}>{show ? value : '•'.repeat(Math.min(32, value.length))}</code>
      {masked && (
        <Button size="xs" icon variant="quiet" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide' : 'Show'}>
          {show ? <EyeOff /> : <Eye />}
        </Button>
      )}
      <CopyButton value={value} />
    </div>
  );
}

/** A secret shown exactly once (new API key, webhook secret). */
export function SecretOnce({ value, title = 'Copy this now', description }: { value: string; title?: string; description?: ReactNode }) {
  return (
    <div className="grid gap-3 rounded-[14px] border border-warn/30 bg-warn-soft p-4">
      <div className="flex gap-2.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
        <div className="grid gap-0.5">
          <p className="text-[0.8125rem] font-bold text-ink">{title}</p>
          <p className="text-xs text-ink-muted">
            {description ?? "It won't be shown again. Store it in your server's secret manager. Never put it in a browser, app or public repo."}
          </p>
        </div>
      </div>
      <CopyField value={value} className="bg-surface" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('kbd', className)}>{children}</kbd>;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';

/** Label/value pairs, e.g. in a detail sidebar. */
export function DescList({ items, className }: { items: { label: ReactNode; value: ReactNode; hidden?: boolean }[]; className?: string }) {
  return (
    <dl className={cn('grid gap-3', className)}>
      {items
        .filter((i) => !i.hidden)
        .map((i, idx) => (
          <div key={idx} className="grid grid-cols-[minmax(96px,40%)_1fr] items-baseline gap-3 text-[0.8125rem]">
            <dt className="text-ink-faint">{i.label}</dt>
            <dd className="min-w-0 break-words text-ink">{i.value}</dd>
          </div>
        ))}
    </dl>
  );
}

export function Callout({
  tone = 'accent',
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: 'accent' | 'warn' | 'danger' | 'neutral' | 'live';
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = {
    accent: 'border-accent/20 bg-accent-soft [&>svg]:text-accent',
    warn: 'border-warn/30 bg-warn-soft [&>svg]:text-warn',
    danger: 'border-danger/30 bg-danger-soft [&>svg]:text-danger',
    neutral: 'border-line bg-surface-2 [&>svg]:text-ink-faint',
    live: 'border-live/25 bg-live-soft [&>svg]:text-live',
  }[tone];
  return (
    <div className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[14px] border px-4 py-3 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', t, className)}>
      {icon}
      <div className="grid min-w-[200px] flex-1 gap-0.5 text-[0.8125rem]">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children && <div className="text-ink-muted">{children}</div>}
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  );
}

import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

export interface StatusProps {
  /** Large visual above the text: a numeral or an icon tile. */
  hero?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small print under the actions, e.g. an error code for support. */
  detail?: ReactNode;
  className?: string;
}

/** The centered block of a status page: hero, heading, copy, actions. */
export function StatusContent({ hero, eyebrow, title, description, actions, detail, className }: StatusProps) {
  return (
    <div className={cn('grid w-full max-w-[520px] justify-items-center gap-4 text-center', className)}>
      {hero}
      <div className="grid justify-items-center gap-2.5">
        {eyebrow && <p className="mono text-accent">{eyebrow}</p>}
        <h1 className="text-balance text-[1.75rem] font-bold leading-tight tracking-tight text-ink sm:text-[2.25rem]">{title}</h1>
        {description && <div className="max-w-[440px] text-pretty text-[0.9375rem] leading-relaxed text-ink-muted">{description}</div>}
      </div>
      {actions && <div className="mt-3 grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-center">{actions}</div>}
      {detail && <div className="mt-1">{detail}</div>}
    </div>
  );
}

/** The thread motif, broken: this path leads nowhere. */
export function NotFoundHero({ size = 'lg' }: { size?: 'md' | 'lg' }) {
  return (
    <div className="grid justify-items-center gap-3" aria-hidden>
      <p
        className={cn(
          'gradient-text font-bold leading-none tracking-[-0.05em] tabular-nums',
          size === 'lg' ? 'text-[5.5rem] sm:text-[8rem]' : 'text-[4rem] sm:text-[5.5rem]',
        )}
      >
        404
      </p>
      <div className={cn('flex items-center gap-3', size === 'lg' ? 'w-40 sm:w-52' : 'w-32 sm:w-40')}>
        <span className="thread-h flex-1" />
        <span className="size-1.5 rounded-full bg-line-strong" />
        <span className="h-0.5 flex-1 rounded-full bg-line" />
      </div>
    </div>
  );
}

export interface NotFoundCopy {
  title?: ReactNode;
  description?: ReactNode;
  /** Where the main button leads instead of the dashboard, e.g. back to the ticket list. */
  back?: { to: string; label: string };
}

/**
 * The 404 body: for unknown addresses, pages the role can't open (never
 * revealed), and records that don't exist or sit outside this business.
 */
export function NotFoundState({ title, description, back, size = 'lg', className }: NotFoundCopy & { size?: 'md' | 'lg'; className?: string }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // React Router keeps a history index; 0 means this tab opened straight onto the missing page.
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

  return (
    <StatusContent
      className={className}
      hero={<NotFoundHero size={size} />}
      eyebrow="Page not found"
      title={title ?? "This page doesn't exist"}
      description={
        description ?? (
          <>
            <p>Nothing lives at this address. It may have moved, or the link has a typo.</p>
            <code className="mt-3 inline-block max-w-full break-all rounded-lg border border-line bg-surface-2 px-2.5 py-1 font-mono text-xs text-ink-muted">
              {pathname}
            </code>
          </>
        )
      }
      actions={
        <>
          <Button asChild variant="accent" size="md" className="w-full sm:w-auto" leading={back ? <ArrowLeft /> : <LayoutDashboard />}>
            <Link to={back?.to ?? '/'}>{back?.label ?? 'Go to dashboard'}</Link>
          </Button>
          {!back && canGoBack && (
            <Button variant="ghost" size="md" className="w-full sm:w-auto" leading={<ArrowLeft />} onClick={() => navigate(-1)}>
              Go back
            </Button>
          )}
        </>
      }
    />
  );
}

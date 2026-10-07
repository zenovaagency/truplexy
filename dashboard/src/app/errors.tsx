import type { ReactNode } from 'react';
import { isRouteErrorResponse, Link, useLocation, useNavigate, useRouteError } from 'react-router';
import { ArrowLeft, LayoutDashboard, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { BrandMark } from '@/components/layout/Brand';
import { cn } from '@/lib/cn';

function FullPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-paper px-4">
      <div className="aurora" />
      <div className="relative grid justify-items-center gap-6">
        <BrandMark className="h-8" />
        <div className="panel w-full max-w-md">{children}</div>
      </div>
    </main>
  );
}

interface StatusProps {
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

/** A whole-screen status page (404, sign-in errors) with the brand header and footer. */
export function StatusScreen(props: StatusProps) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-paper">
      <div className="aurora" />
      <header className="relative px-4 pt-6 sm:px-8 sm:pt-8">
        <Link to="/" aria-label="Truplexy" className="inline-block">
          <BrandMark className="h-7" />
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <StatusContent {...props} />
      </main>
      <footer className="relative px-4 pb-6 text-center text-xs text-ink-faint sm:pb-8">© {new Date().getFullYear()} Truplexy</footer>
    </div>
  );
}

/** The thread motif, broken: this path leads nowhere. */
function NotFoundHero() {
  return (
    <div className="grid justify-items-center gap-3" aria-hidden>
      <p className="gradient-text text-[5.5rem] font-bold leading-none tracking-[-0.05em] tabular-nums sm:text-[8rem]">404</p>
      <div className="flex w-40 items-center gap-3 sm:w-52">
        <span className="thread-h flex-1" />
        <span className="size-1.5 rounded-full bg-line-strong" />
        <span className="h-0.5 flex-1 rounded-full bg-line" />
      </div>
    </div>
  );
}

export function NotFound({ inShell }: { inShell?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // React Router keeps a history index; 0 means this tab opened straight onto the missing page.
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

  const content: StatusProps = {
    hero: <NotFoundHero />,
    eyebrow: 'Page not found',
    title: "This page doesn't exist",
    description: (
      <>
        <p>Nothing lives at this address. It may have moved, or the link has a typo.</p>
        <code className="mt-3 inline-block max-w-full break-all rounded-lg border border-line bg-surface-2 px-2.5 py-1 font-mono text-xs text-ink-muted">
          {pathname}
        </code>
      </>
    ),
    actions: (
      <>
        <Button asChild variant="accent" size="md" className="w-full sm:w-auto" leading={<LayoutDashboard />}>
          <Link to="/">Go to dashboard</Link>
        </Button>
        {canGoBack && (
          <Button variant="ghost" size="md" className="w-full sm:w-auto" leading={<ArrowLeft />} onClick={() => navigate(-1)}>
            Go back
          </Button>
        )}
      </>
    ),
  };

  if (inShell) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-4 py-12">
        <StatusContent {...content} />
      </div>
    );
  }
  return <StatusScreen {...content} />;
}

/** After a deploy, old chunk names 404: a reload picks up the new build. */
const isChunkError = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(e.message);

export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound inShell />;
  const chunk = isChunkError(error);
  if (!chunk) console.error(error);
  return (
    <div className="py-16">
      <EmptyState
        icon={<TriangleAlert className="text-danger" />}
        title={chunk ? 'A new version is available' : 'This page hit an error'}
        description={
          chunk
            ? 'Truplexy was updated while this tab was open. Reload to continue.'
            : 'Reload to try again. If it keeps happening, tell us what you clicked.'
        }
        action={
          <Button variant="accent" onClick={() => window.location.reload()} leading={<RefreshCw />}>
            Reload
          </Button>
        }
      />
    </div>
  );
}

export { FullPage };

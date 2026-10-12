import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button, EmptyState, NotFoundState, StatusContent, type NotFoundCopy, type StatusProps } from '@/components/ui';
import { BrandMark } from '@/components/layout/Brand';

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

/** The brand header and footer around a whole-screen status page. */
function ScreenFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-paper">
      <div className="aurora" />
      <header className="relative px-4 pt-6 sm:px-8 sm:pt-8">
        <Link to="/" aria-label="Truplexy" className="inline-block">
          <BrandMark className="h-7" />
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 py-12 sm:px-8">{children}</main>
      <footer className="relative px-4 pb-6 text-center text-xs text-ink-faint sm:pb-8">© {new Date().getFullYear()} Truplexy</footer>
    </div>
  );
}

/** A whole-screen status page (404, sign-in errors) with the brand header and footer. */
export function StatusScreen(props: StatusProps) {
  return (
    <ScreenFrame>
      <StatusContent {...props} />
    </ScreenFrame>
  );
}

/**
 * The 404. Full screen outside the app (unknown addresses, the platform
 * console for non-admins, a business you can't open); inline inside the
 * shell (unknown tabs, pages your role can't open, missing records).
 */
export function NotFound({ variant = 'screen', ...copy }: NotFoundCopy & { variant?: 'screen' | 'inline' }) {
  if (variant === 'inline')
    return (
      <div className="grid justify-items-center px-4 py-16 sm:py-24">
        <NotFoundState size="md" {...copy} />
      </div>
    );
  return (
    <ScreenFrame>
      <NotFoundState {...copy} />
    </ScreenFrame>
  );
}

/** After a deploy, old chunk names 404: a reload picks up the new build. */
const isChunkError = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(e.message);

export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
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

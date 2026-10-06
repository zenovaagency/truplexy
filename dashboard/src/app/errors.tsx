import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Compass, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
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

export function NotFound({ inShell }: { inShell?: boolean }) {
  const body = (
    <EmptyState
      icon={<Compass />}
      title="Page not found"
      description="This page doesn't exist, or it moved."
      action={
        <Button asChild variant="accent">
          <Link to="/">Go to dashboard</Link>
        </Button>
      }
    />
  );
  return inShell ? <div className="py-16">{body}</div> : <FullPage>{body}</FullPage>;
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

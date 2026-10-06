import { useEffect, useMemo } from 'react';
import { Navigate, Outlet, useLocation, useOutletContext, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useMe } from '@/lib/api/endpoints/account';
import type { Bot, Business, Permission } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/AuthProvider';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions';
import { qk } from '@/lib/query-keys';
import { lastScope, rememberScope, ScopeContext, scopePath, useScopeCtx, type ScopeContextValue } from '@/lib/session/scope-context';
import { Button, EmptyState, ErrorState, NoAccess } from '@/components/ui';
import { LogoMark } from '@/components/layout/Brand';
import { AppShell } from './layouts/AppShell';
import { FullPage } from './errors';

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper" aria-busy aria-label="Loading">
      <div className="grid justify-items-center gap-4">
        <LogoMark className="h-9 animate-pulse" />
        <div className="relative h-0.5 w-28 overflow-hidden rounded-full bg-surface-3">
          <div className="thread-h absolute inset-y-0 w-1/2 animate-route-bar" />
        </div>
      </div>
    </div>
  );
}

/** Signed-in pages. Signed-out visitors go to sign-in and come back after. */
export function RequireAuth() {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'signedOut') {
    const next = loc.pathname === '/' ? '' : `?next=${encodeURIComponent(loc.pathname + loc.search)}`;
    return <Navigate to={`/sign-in${next}`} replace />;
  }
  return <Outlet />;
}

/** "/" → the last business and bot used, the first one, the platform console, or onboarding. */
export function RootRedirect() {
  const me = useMe();
  if (me.isPending) return <Splash />;
  if (me.isError)
    return (
      <FullPage>
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </FullPage>
    );
  const { memberships, platform_admin } = me.data;
  const last = lastScope();
  const remembered = last && memberships.find((m) => m.tenant_id === last.tenant && m.bots.some((b) => b.id === last.bot));
  if (remembered) return <Navigate to={scopePath(last)} replace />;
  const first = memberships.find((m) => m.bots.length);
  if (first) return <Navigate to={scopePath({ tenant: first.tenant_id, bot: first.bots[0]!.id })} replace />;
  if (platform_admin) return <Navigate to="/platform" replace />;
  return <Navigate to="/onboarding" replace />;
}

/**
 * Every /t/:tenant/:bot page. Resolves the membership from GET /me, builds
 * the permission check, and renders the shell. Platform admins may open a
 * business they don't belong to; they pass every check.
 */
export function ScopeLayout() {
  const { tenant = '', bot = '' } = useParams();
  const loc = useLocation();
  const me = useMe();
  const membership = me.data?.memberships.find((m) => m.tenant_id === tenant);
  const isPlatformAdmin = me.data?.platform_admin ?? false;
  const scope = useMemo(() => ({ tenant, bot }), [tenant, bot]);
  const visiting = Boolean(me.data && !membership && isPlatformAdmin);

  // A platform admin visiting: read the business and its bots through the API (same cache keys as the pages).
  const visitBusiness = useQuery({
    queryKey: qk.tenant(scope, 'business'),
    queryFn: ({ signal }) => api<Business>('/tenant', { scope, signal }),
    enabled: visiting,
  });
  const visitBots = useQuery({
    queryKey: qk.tenant(scope, 'bots'),
    queryFn: ({ signal }) => api<{ data: Bot[] }>('/bots', { scope, signal }).then((r) => r.data),
    enabled: visiting,
  });

  const bots = membership?.bots ?? visitBots.data?.map((b) => ({ id: b.id, name: b.name }));
  const currentBot = bots?.find((b) => b.id === bot);

  useEffect(() => {
    if (membership && currentBot) rememberScope(scope);
  }, [membership, currentBot, scope]);

  const value = useMemo<ScopeContextValue | null>(() => {
    if (!me.data || !bots || !currentBot) return null;
    const role = membership?.role ?? null;
    const perms = new Set<Permission>(role ? (me.data.roles?.[role] ?? DEFAULT_ROLE_PERMISSIONS[role]) : []);
    return {
      scope,
      membership,
      businessName: membership?.name ?? visitBusiness.data?.name ?? tenant,
      businessStatus: membership?.status ?? visitBusiness.data?.status ?? 'active',
      bot: currentBot,
      bots,
      role,
      isPlatformAdmin,
      can: (p) => isPlatformAdmin || perms.has(p),
      href: (path = 'overview') => scopePath(scope, path),
    };
  }, [me.data, bots, currentBot, membership, scope, tenant, isPlatformAdmin, visitBusiness.data]);

  if (me.isPending || (visiting && visitBots.isPending)) return <Splash />;
  if (me.isError)
    return (
      <FullPage>
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </FullPage>
    );
  if (!membership && !isPlatformAdmin) {
    return (
      <FullPage>
        <EmptyState
          icon={<Building2 />}
          title="You're not a member of this business"
          description="It may have been removed, or your access ended. Ask an owner to invite you again."
          action={
            <Button asChild variant="accent">
              <a href="/">Go to my dashboard</a>
            </Button>
          }
        />
      </FullPage>
    );
  }
  if (visiting && visitBots.isError)
    return (
      <FullPage>
        <ErrorState error={visitBots.error} onRetry={() => visitBots.refetch()} />
      </FullPage>
    );
  // Unknown bot in the URL: same page on the business's first bot.
  if (bots && !currentBot) {
    const first = bots[0];
    if (!first) return <Navigate to="/" replace />;
    const rest = loc.pathname.split('/').slice(4).join('/');
    return <Navigate to={scopePath({ tenant, bot: first.id }, rest || 'overview')} replace />;
  }
  if (!value) return <Splash />;

  return (
    <ScopeContext.Provider value={value}>
      <AppShell variant="business" />
    </ScopeContext.Provider>
  );
}

export function RequirePermission({ permission, what }: { permission: Permission; what: string }) {
  const { can } = useScopeCtx();
  // Pass the parent's outlet context through, so gated child routes still receive it.
  const ctx = useOutletContext();
  return can(permission) ? <Outlet context={ctx} /> : <div className="py-16"><NoAccess what={what} permission={permission} /></div>;
}

export function RequirePlatformAdmin() {
  const me = useMe();
  if (me.isPending) return <Splash />;
  if (!me.data?.platform_admin)
    return (
      <FullPage>
        <NoAccess what="the platform console" permission="platform_admin" />
      </FullPage>
    );
  return <Outlet />;
}

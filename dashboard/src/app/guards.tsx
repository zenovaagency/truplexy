import { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useOutletContext, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useMe } from '@/lib/api/endpoints/account';
import type { Bot, Business, Permission } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/AuthProvider';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions';
import { qk } from '@/lib/query-keys';
import { activeScope, ScopeContext, scopeLink, scopeOf, setActiveScope, useScopeCtx, type ScopeContextValue } from '@/lib/session/scope-context';
import { ErrorState, NoAccess } from '@/components/ui';
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

/** Old /t/:tenant/:bot/... links (bookmarks, shared links): select that scope and show the plain URL. */
export function LegacyScopeRedirect() {
  const { tenant = '', bot = '', '*': rest = '' } = useParams();
  const { search } = useLocation();
  const link = scopeLink({ tenant, bot }, rest || 'overview');
  return <Navigate to={link.to + search} state={link.state} replace />;
}

/**
 * Every business page. The scope comes from the navigation that switched to
 * it, else this tab's last scope, else the first business with a bot; it is
 * never in the URL. Resolves the membership from GET /me, builds the
 * permission check, and renders the shell. Platform admins may open a
 * business they don't belong to; they pass every check.
 */
export function ScopeLayout() {
  const loc = useLocation();
  const me = useMe();
  const [stored, setStored] = useState(activeScope);
  const requested = scopeOf(loc.state) ?? stored;
  const memberships = me.data?.memberships;
  const isPlatformAdmin = me.data?.platform_admin ?? false;

  // A business you no longer belong to falls back to your first one; platform admins may visit any.
  const requestedMember = requested && memberships?.find((m) => m.tenant_id === requested.tenant && m.bots.length);
  const visiting = Boolean(requested && memberships && isPlatformAdmin && !memberships.some((m) => m.tenant_id === requested.tenant));
  const first = memberships?.find((m) => m.bots.length);
  const tenant = requestedMember || visiting ? requested!.tenant : (first?.tenant_id ?? '');
  const wantedBot = requested?.tenant === tenant ? requested.bot : '';
  const membership = memberships?.find((m) => m.tenant_id === tenant);
  const tenantScope = useMemo(() => ({ tenant, bot: wantedBot }), [tenant, wantedBot]);

  // A platform admin visiting: read the business and its bots through the API (same cache keys as the pages).
  const visitBusiness = useQuery({
    queryKey: qk.tenant(tenantScope, 'business'),
    queryFn: ({ signal }) => api<Business>('/tenant', { scope: tenantScope, signal }),
    enabled: visiting,
  });
  const visitBots = useQuery({
    queryKey: qk.tenant(tenantScope, 'bots'),
    queryFn: ({ signal }) => api<{ data: Bot[] }>('/bots', { scope: tenantScope, signal }).then((r) => r.data),
    enabled: visiting,
  });

  const bots = membership?.bots ?? visitBots.data?.map((b) => ({ id: b.id, name: b.name }));
  // Unknown bot: the business's first bot, on the same page.
  const currentBot = bots?.find((b) => b.id === wantedBot) ?? bots?.[0];
  const botId = currentBot?.id ?? '';
  const scope = useMemo(() => ({ tenant, bot: botId }), [tenant, botId]);

  useEffect(() => {
    if (!currentBot) return;
    setActiveScope(scope, { remember: Boolean(membership) });
    setStored((s) => (s?.tenant === scope.tenant && s.bot === scope.bot ? s : scope));
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
      href: (path = 'overview') => `/${path}`,
    };
  }, [me.data, bots, currentBot, membership, scope, tenant, isPlatformAdmin, visitBusiness.data]);

  if (me.isPending || (visiting && visitBots.isPending)) return <Splash />;
  if (me.isError)
    return (
      <FullPage>
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </FullPage>
    );
  if (visiting && visitBots.isError)
    return (
      <FullPage>
        <ErrorState error={visitBots.error} onRetry={() => visitBots.refetch()} />
      </FullPage>
    );
  // No business with a bot to show: the platform console, or onboarding.
  if (!currentBot) return <Navigate to={isPlatformAdmin ? '/platform' : '/onboarding'} replace />;
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

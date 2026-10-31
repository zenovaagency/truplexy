import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, hasCode } from '@/lib/api/client';
import { useMe } from '@/lib/api/endpoints/account';
import type { Bot, Business, Permission } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/AuthProvider';
import { isNotFoundError, isScopeLostError } from '@/lib/errors';
import { notifyInfo } from '@/lib/notify';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions';
import { qk } from '@/lib/query-keys';
import {
  activeScope,
  clearActiveScope,
  isSharedScope,
  ScopeContext,
  scopeLink,
  scopeOf,
  setActiveScope,
  useScopeCtx,
  type ScopeContextValue,
  type ScopeState,
} from '@/lib/session/scope-context';
import { ErrorState } from '@/components/ui';
import { Loader } from '@/components/ui/loader';
import { AppShell } from './layouts/AppShell';
import { FullPage, NotFound } from './errors';

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper" aria-busy>
      <Loader size={44} className="text-ink" />
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
  return <Navigate to={link.to + search} state={{ ...link.state, shared: true } satisfies ScopeState} replace />;
}

/**
 * The business (or bot) this tab is on stopped answering: deleted, or the
 * person was removed. Forget it, reload who they are, and move them on;
 * ScopeLayout then picks their next business (or onboarding) from /me.
 */
function useScopeLostRedirect(tenant: string, enabled: boolean) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !tenant) return;
    const lost = (error: unknown) => {
      if (!isScopeLostError(error) || handled.current === tenant) return;
      handled.current = tenant;
      const botOnly = hasCode(error, 'BOT_NOT_FOUND');
      clearActiveScope();
      void qc.invalidateQueries({ queryKey: qk.me }).then(() => {
        if (!botOnly) qc.removeQueries({ predicate: (q) => q.queryKey[1] === tenant && (q.queryKey[0] === 'tenant' || q.queryKey[0] === 'bot') });
        navigate('/overview', { replace: true, state: { lost: true } });
        notifyInfo(
          botOnly ? 'That bot was deleted' : 'That business is no longer available',
          botOnly ? "You're now on another bot of this business." : "It was removed, or you're no longer a member.",
        );
      });
    };
    const unsubQueries = qc.getQueryCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'error') lost(e.action.error);
    });
    const unsubMutations = qc.getMutationCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'error') lost(e.action.error);
    });
    return () => {
      unsubQueries();
      unsubMutations();
    };
  }, [qc, navigate, tenant, enabled]);
}

/**
 * Every business page. The scope comes from the navigation that switched to
 * it, else this tab's last scope, else the first business with a bot; it is
 * never in the URL. Resolves the membership from GET /me, builds the
 * permission check, and renders the shell. Platform admins may open a
 * business they don't belong to; they pass every check. A shared link to a
 * business you can't open is a 404; a remembered one quietly falls back.
 */
export function ScopeLayout() {
  const loc = useLocation();
  const me = useMe();
  const [stored, setStored] = useState(activeScope);
  // After losing a business the remembered scope is gone too: start again from /me.
  const lostScope = Boolean((loc.state as { lost?: boolean } | null)?.lost);
  useEffect(() => {
    if (lostScope) setStored(null);
  }, [lostScope]);
  const requested = scopeOf(loc.state) ?? (lostScope ? null : stored);
  const shared = isSharedScope(loc.state);
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

  const bots = membership?.bots ?? visitBots.data?.map((b) => ({ id: b.id, name: b.name, avatar_url: b.avatar_url }));
  // Unknown bot: the business's first bot, on the same page.
  const currentBot = bots?.find((b) => b.id === wantedBot) ?? bots?.[0];
  const botId = currentBot?.id ?? '';
  const scope = useMemo(() => ({ tenant, bot: botId }), [tenant, botId]);
  useScopeLostRedirect(tenant, Boolean(membership));

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
      businessPlan: membership?.plan ?? visitBusiness.data?.plan ?? '',
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
  // A link to a business you can't open: never say whether it exists.
  if (shared && requested && !requestedMember && !visiting) return <NotFound />;
  const visitError = visiting ? (visitBots.error ?? visitBusiness.error) : null;
  if (visitError && isNotFoundError(visitError))
    return (
      <NotFound
        title="This business doesn't exist"
        description="It was deleted, or the link is wrong. Deleted businesses can be restored from the platform console for 30 days."
        back={{ to: '/platform/businesses', label: 'Platform console' }}
      />
    );
  if (visitError)
    return (
      <FullPage>
        <ErrorState error={visitError} onRetry={() => void Promise.all([visitBots.refetch(), visitBusiness.refetch()])} />
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

/** A page the role can't open is a 404, like one that doesn't exist; the nav never shows it either. */
export function RequirePermission({ permission }: { permission: Permission }) {
  const { can } = useScopeCtx();
  // Pass the parent's outlet context through, so gated child routes still receive it.
  const ctx = useOutletContext();
  return can(permission) ? <Outlet context={ctx} /> : <NotFound variant="inline" />;
}

/** The platform console is a 404 to everyone but platform admins. */
export function RequirePlatformAdmin() {
  const me = useMe();
  if (me.isPending) return <Splash />;
  if (me.isError)
    return (
      <FullPage>
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </FullPage>
    );
  if (!me.data.platform_admin) return <NotFound />;
  return <Outlet />;
}

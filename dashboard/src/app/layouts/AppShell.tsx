import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useNavigation } from 'react-router';
import { Dialog as D } from 'radix-ui';
import { ArrowLeft, FlaskConical, Menu as MenuIcon, PauseCircle, Search, ShieldCheck } from 'lucide-react';
import { useHealth } from '@/lib/api/endpoints/account';
import { useTenant } from '@/lib/api/endpoints/business';
import { useTicketCounts } from '@/lib/api/endpoints/tickets';
import { cn } from '@/lib/cn';
import { formatCompact } from '@/lib/format';
import { useLiveUpdates, type LiveStatus } from '@/lib/realtime';
import { useScopeCtx } from '@/lib/session/scope-context';
import { useHotkeys, useIsDesktop, useIsTablet, useStoredState } from '@/hooks';
import { BUSINESS_NAV, PLATFORM_NAV, type NavItem } from '@/app/nav';
import { Badge, Button, Kbd, MOD, Progress, Tip } from '@/components/ui';
import { Sidebar } from '@/components/layout/Sidebar';
import { ScopeSwitcher } from '@/components/layout/ScopeSwitcher';
import { UserMenu } from '@/components/layout/UserMenu';
import { CommandPalette } from '@/components/layout/CommandPalette';

const MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

/**
 * The frame around every signed-in page: sidebar (full ≥ 1280px, icon rail
 * from 768px, drawer below), top bar, and the routed page.
 */
export function AppShell({ variant }: { variant: 'business' | 'platform' }) {
  const isDesktop = useIsDesktop();
  const isTablet = useIsTablet();
  const [pinnedCollapsed, setPinnedCollapsed] = useStoredState('truplexy.sidebar.collapsed', false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const navigation = useNavigation();
  const loc = useLocation();

  const collapsed = isTablet && (!isDesktop || pinnedCollapsed);
  const sidebarW = !isTablet ? '0px' : collapsed ? 'var(--rail-w)' : 'var(--sidebar-w)';

  useHotkeys({ 'mod+k': () => setPalette((o) => !o), '/': () => setPalette(true) });

  const sidebar = (inDrawer: boolean) =>
    variant === 'business' ? (
      <BusinessSidebar
        collapsed={inDrawer ? false : collapsed}
        onNavigate={inDrawer ? () => setDrawer(false) : undefined}
        onToggleCollapsed={!inDrawer && isDesktop ? () => setPinnedCollapsed(!pinnedCollapsed) : undefined}
      />
    ) : (
      <PlatformSidebar collapsed={inDrawer ? false : collapsed} onNavigate={inDrawer ? () => setDrawer(false) : undefined} />
    );

  return (
    <div className="min-h-dvh bg-paper" style={{ ['--shell-sidebar' as string]: sidebarW }}>
      {/* Route-change progress: lazy pages load their chunk on first visit. */}
      {navigation.state === 'loading' && (
        <div className="fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden" role="progressbar" aria-label="Loading page">
          <div className="thread-h h-full w-1/3 animate-route-bar" />
        </div>
      )}

      {isTablet && (
        <aside
          className="fixed inset-y-0 left-0 z-30 border-r border-line bg-paper transition-[width] duration-300 ease-[var(--ease-out-expo)]"
          style={{ width: 'var(--shell-sidebar)' }}
        >
          {sidebar(false)}
        </aside>
      )}

      {!isTablet && (
        <D.Root open={drawer} onOpenChange={setDrawer}>
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] animate-fade-in" />
            <D.Content className="fixed inset-y-0 left-0 z-50 w-[min(300px,86vw)] border-r border-line bg-paper shadow-lg outline-none animate-slide-in-left">
              <D.Title className="sr-only">Navigation</D.Title>
              <D.Description className="sr-only">Pages in this workspace</D.Description>
              {sidebar(true)}
            </D.Content>
          </D.Portal>
        </D.Root>
      )}

      <div className="flex min-h-dvh flex-col transition-[padding] duration-300 ease-[var(--ease-out-expo)]" style={{ paddingLeft: 'var(--shell-sidebar)' }}>
        <header className="sticky top-0 z-20 flex h-[var(--topbar-h)] shrink-0 items-center gap-2 border-b border-line bg-paper/85 px-3 backdrop-blur-md sm:px-5">
          {!isTablet && (
            <Button icon variant="quiet" onClick={() => setDrawer(true)} aria-label="Open navigation">
              <MenuIcon />
            </Button>
          )}
          {variant === 'business' ? (
            <ScopeSwitcher />
          ) : (
            <div className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink">
              <ShieldCheck className="size-4 text-accent" />
              Platform console
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {MOCKS && (
              <Tip content="Sample data, stored in this browser. Use the account menu to preview other roles.">
                <span>
                  <Badge tone="violet" className="hidden sm:inline-flex">
                    <FlaskConical className="size-3" /> Demo
                  </Badge>
                </span>
              </Tip>
            )}
            <button
              type="button"
              onClick={() => setPalette(true)}
              className="hidden h-9 w-56 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[0.8125rem] text-ink-faint transition-colors hover:border-line-strong lg:flex"
            >
              <Search className="size-4" />
              <span className="flex-1 truncate whitespace-nowrap text-left">Search or jump to…</span>
              <Kbd>{MOD}</Kbd>
              <Kbd>K</Kbd>
            </button>
            <Button icon variant="quiet" className="lg:hidden" onClick={() => setPalette(true)} aria-label="Search">
              <Search />
            </Button>
            {variant === 'business' && <LiveIndicator />}
            <ApiStatusDot />
            <UserMenu />
          </div>
        </header>

        {variant === 'business' && <SuspendedBanner />}

        <main id="main" className="flex-1" key={variant === 'business' ? loc.pathname.split('/').slice(0, 4).join('/') : 'platform'}>
          <Outlet />
        </main>
      </div>

      <CommandPalette open={palette} onOpenChange={setPalette} />
      {variant === 'business' && <GoShortcuts />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BusinessSidebar({ collapsed, onNavigate, onToggleCollapsed }: { collapsed: boolean; onNavigate?: () => void; onToggleCollapsed?: () => void }) {
  const { can, href, isPlatformAdmin, membership } = useScopeCtx();
  const counts = useTicketCounts(can('tickets.read'));
  const sections = BUSINESS_NAV.map((s) => ({ ...s, items: s.items.filter((i) => !i.permission || can(i.permission)) }));
  const plan = membership?.plan;
  return (
    <Sidebar
      sections={sections}
      hrefFor={(i: NavItem) => href(i.path)}
      counts={{ tickets: counts.data?.needs_reply }}
      collapsed={collapsed}
      onNavigate={onNavigate}
      onToggleCollapsed={onToggleCollapsed}
      homeHref={href('overview')}
      badge={plan && <Badge tone="accent" className="ml-auto capitalize">{plan}</Badge>}
      footer={
        <div className="grid gap-2">
          {!collapsed && can('members.read') && <PlanUsage />}
          {isPlatformAdmin && (
            <Tip content="Platform console" side="right" disabled={!collapsed}>
              <Link
                to="/platform"
                onClick={onNavigate}
                className={cn(
                  'flex h-9 items-center gap-3 rounded-[10px] text-[0.8125rem] font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink',
                  collapsed ? 'justify-center' : 'px-3',
                )}
              >
                <ShieldCheck className="size-[18px] text-ink-faint" />
                {!collapsed && 'Platform console'}
              </Link>
            </Tip>
          )}
        </div>
      }
    />
  );
}

/** Replies this month against the plan: the limit that stops the assistant answering. */
function PlanUsage() {
  const { href } = useScopeCtx();
  const t = useTenant();
  if (!t.data) return null;
  const used = t.data.usage.replies_this_month;
  const limit = t.data.limits.replies_per_month;
  const ratio = limit ? used / limit : 0;
  return (
    <Link to={href('settings/plan')} className="grid gap-2 rounded-[12px] border border-line bg-surface p-3 transition-colors hover:border-line-strong">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-ink">AI replies</span>
        <span className="font-mono tabular-nums text-ink-faint">
          {formatCompact(used)} / {limit > 0 ? formatCompact(limit) : '∞'}
        </span>
      </div>
      <Progress value={ratio} tone={ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warn' : 'accent'} label="AI replies this month" />
    </Link>
  );
}

function PlatformSidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <Sidebar
      sections={PLATFORM_NAV}
      hrefFor={(i) => i.path}
      collapsed={collapsed}
      onNavigate={onNavigate}
      homeHref="/platform"
      badge={<Badge tone="warn" className="ml-auto">Admin</Badge>}
      footer={
        <Tip content="Back to my businesses" side="right" disabled={!collapsed}>
          <Link
            to="/"
            onClick={onNavigate}
            className={cn(
              'flex h-9 items-center gap-3 rounded-[10px] text-[0.8125rem] font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink',
              collapsed ? 'justify-center' : 'px-3',
            )}
          >
            <ArrowLeft className="size-[18px] text-ink-faint" />
            {!collapsed && 'My businesses'}
          </Link>
        </Tip>
      }
    />
  );
}

/* ------------------------------------------------------------------ */

const LIVE_COPY: Record<LiveStatus, { label: string; tip: string }> = {
  live: { label: 'Live', tip: 'Tickets update the moment customers write.' },
  connecting: { label: 'Connecting', tip: 'Connecting to live updates…' },
  polling: { label: 'Polling', tip: "Live updates aren't available, so tickets refresh every 2 minutes." },
  off: { label: 'Off', tip: '' },
};

function LiveIndicator() {
  const status = useLiveUpdates();
  if (status === 'off') return null;
  const c = LIVE_COPY[status];
  return (
    <Tip content={c.tip}>
      <span className="hidden h-8 items-center gap-2 rounded-full border border-line bg-surface px-2.5 text-xs font-semibold text-ink-muted md:inline-flex">
        <span
          className={cn('live-dot', status !== 'live' && 'bg-ink-faint shadow-none')}
          data-pulse={status === 'live' ? '' : undefined}
        />
        {c.label}
      </span>
    </Tip>
  );
}

function ApiStatusDot() {
  const h = useHealth();
  const down = h.isError;
  if (!down) return null;
  return (
    <Tip content="The Truplexy API isn't answering. Changes may fail until it's back.">
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-danger-soft px-2.5 text-xs font-semibold text-danger">
        <span className="size-1.5 rounded-full bg-danger" /> API down
      </span>
    </Tip>
  );
}

function SuspendedBanner() {
  const { businessStatus } = useScopeCtx();
  if (businessStatus !== 'suspended') return null;
  return (
    <div className="flex items-center gap-2.5 border-b border-warn/30 bg-warn-soft px-[var(--page-x)] py-2.5 text-[0.8125rem] text-ink" role="status">
      <PauseCircle className="size-4 shrink-0 text-warn" />
      <p>
        <span className="font-semibold">This business is suspended.</span> <span className="text-ink-muted">You can read everything, but changes and AI replies are paused. Contact Truplexy support to restore it.</span>
      </p>
    </div>
  );
}

/** "g t" → Tickets, "g k" → Knowledge, and so on, for the tabs this role can open. */
function GoShortcuts() {
  const { can, href } = useScopeCtx();
  const nav = useNavigate();
  const bindings: Record<string, () => void> = {};
  for (const item of BUSINESS_NAV.flatMap((s) => s.items)) {
    if (item.key && (!item.permission || can(item.permission))) bindings[`g ${item.key}`] = () => nav(href(item.path));
  }
  useHotkeys(bindings);
  return null;
}

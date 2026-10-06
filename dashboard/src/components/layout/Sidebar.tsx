import type { ReactNode } from 'react';
import { Link, NavLink, useMatch, useResolvedPath } from 'react-router';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { NavItem, NavSection } from '@/app/nav';
import { Count, Tip } from '@/components/ui';
import { BrandMark, LogoMark } from './Brand';

export interface SidebarProps {
  sections: NavSection[];
  hrefFor: (item: NavItem) => string;
  counts?: Record<string, number | undefined>;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  footer?: ReactNode;
  homeHref: string;
  badge?: ReactNode;
}

export function Sidebar({ sections, hrefFor, counts, collapsed, onToggleCollapsed, onNavigate, footer, homeHref, badge }: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-[var(--topbar-h)] shrink-0 items-center gap-2', collapsed ? 'justify-center px-2' : 'px-5')}>
        <NavLink to={homeHref} onClick={onNavigate} className="flex items-center gap-2 rounded-lg" aria-label="Truplexy home">
          {collapsed ? <LogoMark className="h-7" /> : <BrandMark className="h-[26px]" />}
        </NavLink>
        {!collapsed && badge}
      </div>

      <nav className={cn('flex-1 overflow-y-auto pb-4', collapsed ? 'px-2.5' : 'px-3')} aria-label="Main">
        {sections.map((s) =>
          s.items.length ? (
            <div key={s.label} className="mt-4 first:mt-1">
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />
              ) : (
                <p className="mono mb-1.5 px-3 text-[0.62rem] text-ink-faint">{s.label}</p>
              )}
              <ul className="grid gap-0.5">
                {s.items.map((item) => {
                  const Icon = item.icon;
                  const n = counts?.[item.id];
                  const link = (
                    <NavItemLink
                      to={hrefFor(item)}
                      onNavigate={onNavigate}
                      onPrefetch={item.prefetch}
                      collapsed={collapsed}
                      icon={<Icon className="size-[18px] shrink-0" />}
                      label={item.label}
                      count={n}
                    />
                  );
                  return (
                    <li key={item.id}>
                      {collapsed ? (
                        <Tip content={n ? `${item.label} · ${n}` : item.label} side="right">
                          {link}
                        </Tip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null,
        )}
      </nav>

      {footer && <div className={cn('shrink-0 border-t border-line', collapsed ? 'p-2' : 'p-3')}>{footer}</div>}
      {onToggleCollapsed && (
        <div className={cn('shrink-0 border-t border-line p-2', collapsed ? 'flex justify-center' : '')}>
          <Tip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={cn('btn btn-quiet btn-xs [&_svg]:size-4', collapsed ? 'btn-icon' : 'w-full justify-start gap-2.5 px-3')}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              {!collapsed && <span className="text-xs">Collapse</span>}
            </button>
          </Tip>
        </div>
      )}
    </div>
  );
}

/**
 * A nav link with a plain string className. (A NavLink's function className
 * doesn't survive Radix's Slot, which the rail's tooltips wrap it in.)
 */
function NavItemLink({
  to,
  onNavigate,
  onPrefetch,
  collapsed,
  icon,
  label,
  count,
  ...rest
}: {
  to: string;
  onNavigate?: () => void;
  onPrefetch?: () => Promise<unknown>;
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  onFocus?: React.FocusEventHandler<HTMLAnchorElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLAnchorElement>;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  const path = useResolvedPath(to);
  const active = Boolean(useMatch({ path: path.pathname, end: false }));
  return (
    <Link
      {...rest}
      to={to}
      // Compose with the tooltip trigger's handlers, which arrive in rest.
      onClick={(e) => (rest.onClick?.(e), onNavigate?.())}
      onMouseEnter={(e) => (rest.onMouseEnter?.(e), void onPrefetch?.())}
      onFocus={(e) => (rest.onFocus?.(e), void onPrefetch?.())}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'group relative flex h-9 items-center gap-3 rounded-[10px] text-[0.8125rem] font-semibold transition-colors [@media(pointer:coarse)]:h-11',
        collapsed ? 'justify-center px-0' : 'px-3',
        active ? 'bg-surface text-ink shadow-sm ring-1 ring-line [&>svg]:text-accent' : 'text-ink-muted hover:bg-surface-2 hover:text-ink [&>svg]:text-ink-faint',
      )}
    >
      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[image:var(--gradient-brand)]" aria-hidden />}
      {icon}
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && <Count n={count} tone="accent" />}
      {collapsed && count ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-btn ring-2 ring-paper" /> : null}
    </Link>
  );
}

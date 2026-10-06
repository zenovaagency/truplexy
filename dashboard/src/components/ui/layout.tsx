import { Fragment, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { Count } from './display';

/* ------------------------------------------------------------------ */
/* Page frame                                                          */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="grid min-w-0 max-w-2xl gap-1.5">
        {eyebrow && <p className="mono text-ink-faint">{eyebrow}</p>}
        <h1 className="text-[1.375rem] font-bold leading-tight text-ink sm:text-[1.625rem]">{title}</h1>
        {description && <p className="text-[0.875rem] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Content width and vertical rhythm for a page. */
export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn('mx-auto grid w-full gap-6 px-[var(--page-x)] py-6 sm:py-8', wide ? 'max-w-[1600px]' : 'max-w-[1280px]', className)}>
      {children}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  footer,
  flush,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  /** No body padding: for tables and lists that run edge to edge. */
  flush?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn('panel flex min-w-0 flex-col', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4">
          <div className="grid min-w-0 gap-0.5">
            {title && <h2 className="text-[0.9375rem] font-bold text-ink">{title}</h2>}
            {description && <p className="text-[0.8125rem] text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('flex-1', !flush && 'p-5', bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-line px-5 py-3">{footer}</footer>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export interface TabItem {
  to: string;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  end?: boolean;
  hidden?: boolean;
}

/** Route-backed sub-navigation: each tab is a URL, so it can be linked and reloaded. */
export function SubNav({ items, className }: { items: TabItem[]; className?: string }) {
  return (
    <nav
      className={cn('-mx-[var(--page-x)] overflow-x-auto px-[var(--page-x)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
      aria-label="Sections"
    >
      <div className="flex min-w-max gap-1 border-b border-line">
        {items
          .filter((i) => !i.hidden)
          .map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                cn(
                  'relative -mb-px inline-flex h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[0.8125rem] font-semibold transition-colors [&_svg]:size-4',
                  isActive ? 'border-accent text-ink' : 'border-transparent text-ink-faint hover:text-ink',
                )
              }
            >
              {i.icon}
              {i.label}
              <Count n={i.count} />
            </NavLink>
          ))}
      </div>
    </nav>
  );
}

/** A compact pill switch for a small set of options (date range, view mode). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
  className,
  label,
  stretch,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  size?: 'xs' | 'sm';
  className?: string;
  label?: string;
  /** Fill the width, options sharing it equally. */
  stretch?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn(stretch ? 'flex w-full' : 'inline-flex', 'max-w-full overflow-x-auto rounded-[11px] border border-line bg-surface-2 p-[3px] [scrollbar-width:none]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[8px] font-semibold transition-all [@media(pointer:coarse)]:min-h-9',
            'min-w-fit',
            stretch && 'flex-1 justify-center',
            size === 'xs' ? 'h-[26px] px-2.5 text-xs' : 'h-[30px] px-3 text-[0.8125rem]',
            value === o.value ? 'bg-surface text-ink shadow-sm dark:bg-surface-3 dark:ring-1 dark:ring-line-strong' : 'text-ink-faint hover:text-ink',
          )}
        >
          {o.label}
          <Count n={o.count} tone={value === o.value ? 'accent' : 'neutral'} />
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DataTable: a table at md and up, stacked cards below.                */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide on the card layout (phones). */
  hideOnCard?: boolean;
  /** Hide below lg in the table layout. */
  hideBelowLg?: boolean;
  align?: 'left' | 'right';
}

export function DataTable<T>({
  columns,
  rows,
  getKey,
  onRowClick,
  onRowHover,
  card,
  empty,
  className,
  selectedKey,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  onRowHover?: (row: T) => void;
  /** Custom card for phones; defaults to label/value pairs. */
  card?: (row: T) => ReactNode;
  empty?: ReactNode;
  className?: string;
  selectedKey?: string;
  footer?: ReactNode;
}) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className={className}>
      <div className="hidden overflow-x-auto md:block">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn(c.hideBelowLg && 'hidden lg:table-cell', c.align === 'right' && 'text-right', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const k = getKey(r);
              return (
                <tr
                  key={k}
                  data-clickable={onRowClick ? '' : undefined}
                  aria-selected={selectedKey === k || undefined}
                  className={cn(selectedKey === k && '[&>td]:bg-accent-soft/60')}
                  onClick={onRowClick && ((e) => !(e.target as HTMLElement).closest('button,a,input,select,label') && onRowClick(r))}
                  onMouseEnter={onRowHover && (() => onRowHover(r))}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn(c.hideBelowLg && 'hidden lg:table-cell', c.align === 'right' && 'text-right', c.className)}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={getKey(r)}>
            <div
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick && ((e) => !(e.target as HTMLElement).closest('button,a,input,select,label') && onRowClick(r))}
              onKeyDown={onRowClick && ((e) => e.key === 'Enter' && onRowClick(r))}
              className={cn('block px-4 py-3.5', onRowClick && 'cursor-pointer active:bg-surface-2')}
            >
              {card ? (
                card(r)
              ) : (
                <dl className="grid gap-1.5">
                  {columns
                    .filter((c) => !c.hideOnCard)
                    .map((c, i) =>
                      i === 0 ? (
                        <div key={c.key} className="mb-0.5 font-semibold text-ink">
                          {c.cell(r)}
                        </div>
                      ) : (
                        <Fragment key={c.key}>
                          <div className="flex items-center justify-between gap-3 text-[0.8125rem]">
                            <dt className="mono text-ink-faint">{c.header}</dt>
                            <dd className="min-w-0 text-right text-ink">{c.cell(r)}</dd>
                          </div>
                        </Fragment>
                      ),
                    )}
                </dl>
              )}
            </div>
          </li>
        ))}
      </ul>
      {footer}
    </div>
  );
}

/** "Load more" for cursor-paged lists. */
export function LoadMore({ hasMore, loading, onLoad, shown, total }: { hasMore?: boolean; loading?: boolean; onLoad: () => void; shown?: number; total?: number }) {
  if (!hasMore && !total) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-ink-faint">
      <span>{shown != null && total != null ? `Showing ${shown} of ${total}` : shown != null ? `${shown} shown` : ''}</span>
      {hasMore && (
        <button type="button" className="btn btn-xs btn-ghost" onClick={onLoad} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

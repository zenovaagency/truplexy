import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink, Search } from 'lucide-react';
import type { KnowledgeSite, SitePage, SitePageStatus, SiteRefresh, SiteStatus } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { Badge, Button, Input, Progress, Select, Tip, type Tone } from '@/components/ui';
import { Loader } from '@/components/ui/loader';

/* Pieces shared by the Add website dialog, the Websites tab and a website's drawer. */

const SITE_STATUS: Record<SiteStatus, { label: string; tone: Tone }> = {
  mapping: { label: 'Finding pages', tone: 'accent' },
  review: { label: 'Waiting for import', tone: 'warn' },
  syncing: { label: 'Syncing', tone: 'accent' },
  ready: { label: 'Up to date', tone: 'live' },
  failed: { label: 'Failed', tone: 'danger' },
  deleting: { label: 'Removing', tone: 'neutral' },
};

export function SiteStatusBadge({ site }: { site: Pick<KnowledgeSite, 'status' | 'last_synced_at'> }) {
  const s = SITE_STATUS[site.status];
  const busy = site.status === 'mapping' || site.status === 'syncing' || site.status === 'deleting';
  return (
    <Badge tone={s.tone}>
      {busy ? <Loader size={12} label={null} /> : site.status === 'failed' ? <AlertTriangle className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
      {site.status === 'syncing' && !site.last_synced_at ? 'Importing' : s.label}
    </Badge>
  );
}

const PAGE_STATUS: Record<SitePageStatus, { label: string; tone: Tone }> = {
  new: { label: 'Not added', tone: 'outline' },
  indexing: { label: 'Indexing', tone: 'accent' },
  indexed: { label: 'Learned', tone: 'live' },
  failed: { label: 'Failed', tone: 'danger' },
  gone: { label: 'Gone', tone: 'warn' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

export const REFRESH_OPTIONS: { value: SiteRefresh; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'off', label: 'Only when I sync' },
];

export function RefreshSelect({ value, onChange, disabled }: { value: SiteRefresh; onChange: (v: SiteRefresh) => void; disabled?: boolean }) {
  return <Select size="sm" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as SiteRefresh)} options={REFRESH_OPTIONS} aria-label="Check for changes" />;
}

/** How far the running sync is, 0–1. */
export const syncProgress = (s: KnowledgeSite) => (s.counts.selected ? (s.counts.selected - s.counts.pending) / s.counts.selected : 0);

export function SyncProgress({ site }: { site: KnowledgeSite }) {
  const done = site.counts.selected - site.counts.pending;
  return (
    <div className="grid gap-1.5" aria-live="polite">
      <Progress value={site.phase === 'map' ? 0.02 : syncProgress(site)} label="Sync progress" />
      <p className="text-xs text-ink-faint">
        {site.phase === 'map'
          ? 'Looking for new pages…'
          : `${formatNumber(done)} of ${formatNumber(site.counts.selected)} pages checked · ${formatNumber(site.counts.indexed)} learned`}
        {site.counts.failed > 0 && ` · ${formatNumber(site.counts.failed)} failed`}
      </p>
    </div>
  );
}

/** A page's address without the site's origin, for lists. */
export const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || '/';
  } catch {
    return url;
  }
};

/** Pages grouped by the first part of their path, home and top-level pages first. */
function groupPages(pages: SitePage[]) {
  const groups = new Map<string, SitePage[]>();
  for (const p of pages) {
    const segments = pathOf(p.url).split('?')[0]!.split('/').filter(Boolean);
    const key = segments.length > 1 ? `/${segments[0]}` : '/';
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
}

/**
 * The pages of a website, grouped by section, with a tick for each. `showStatus` adds each page's state once the site
 * is imported.
 */
export function PageList({
  pages,
  onToggle,
  editable,
  busy,
  showStatus,
}: {
  pages: SitePage[];
  onToggle: (urls: string[], selected: boolean) => void;
  editable: boolean;
  busy?: boolean;
  showStatus?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const q = search.trim().toLowerCase();
  const shown = useMemo(() => (q ? pages.filter((p) => `${p.url} ${p.title ?? ''}`.toLowerCase().includes(q)) : pages), [pages, q]);
  const groups = useMemo(() => groupPages(shown), [shown]);

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input size="sm" className="pl-9" placeholder="Search pages" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search pages" />
      </div>
      {groups.length === 0 && <p className="text-[0.8125rem] text-ink-faint">No pages match.</p>}
      <div className="grid gap-2">
        {groups.map(([key, list]) => {
          const ticked = list.filter((p) => p.selected).length;
          // Long sections start folded, so the list stays easy to scan.
          const open = closed[key] === undefined ? list.length <= 25 || Boolean(q) : !closed[key];
          return (
            <section key={key} className="overflow-hidden rounded-[12px] border border-line">
              <header className="flex items-center gap-2 bg-surface-2/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setClosed({ ...closed, [key]: open })}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={open}
                >
                  <ChevronDown className={cn('size-4 shrink-0 text-ink-faint transition-transform', !open && '-rotate-90')} />
                  <span className="truncate font-mono text-[0.8125rem] font-semibold text-ink">{key === '/' ? 'Main pages' : key}</span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                    {ticked} of {list.length}
                  </span>
                </button>
                {editable && (
                  <span className="flex shrink-0 gap-1">
                    <Button size="xs" variant="quiet" disabled={busy || ticked === list.length} onClick={() => onToggle(list.filter((p) => !p.selected).map((p) => p.url), true)}>
                      All
                    </Button>
                    <Button size="xs" variant="quiet" disabled={busy || ticked === 0} onClick={() => onToggle(list.filter((p) => p.selected).map((p) => p.url), false)}>
                      None
                    </Button>
                  </span>
                )}
              </header>
              {open && (
                <ul className="divide-y divide-line">
                  {list.map((p) => (
                    <li key={p.url} className="flex items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        className="checkbox shrink-0"
                        checked={p.selected}
                        disabled={!editable || busy}
                        onChange={(e) => onToggle([p.url], e.target.checked)}
                        aria-label={`Learn from ${pathOf(p.url)}`}
                      />
                      <span className="grid min-w-0 flex-1">
                        <span className={cn('truncate text-[0.8125rem] font-medium', p.selected ? 'text-ink' : 'text-ink-muted')}>{p.title || pathOf(p.url)}</span>
                        <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-xs text-ink-faint hover:text-accent">
                          <span className="truncate">{pathOf(p.url)}</span>
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      </span>
                      {p.junk_reason && !p.selected && <Badge tone="outline">{p.junk_reason}</Badge>}
                      {showStatus && (p.status !== 'new' || p.selected) && <PageStatus page={p} />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PageStatus({ page }: { page: SitePage }) {
  const s = PAGE_STATUS[page.status];
  const badge = (
    <Badge tone={s.tone}>
      {page.status === 'failed' && <AlertTriangle className="size-3" />}
      {page.status === 'new' && page.selected ? 'Waiting' : s.label}
      {page.renderer === 'browser' && page.status === 'indexed' && ' · JS'}
    </Badge>
  );
  return page.error ? (
    <Tip content={page.error}>
      <span className="shrink-0">{badge}</span>
    </Tip>
  ) : (
    <span className="shrink-0">{badge}</span>
  );
}

/** Documents in use against the most the bot may hold, with the pages about to be added. */
export function CapacityMeter({ used, adding, max }: { used: number; adding: number; max: number }) {
  const total = used + adding;
  const over = total > max;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ink-muted">
          <span className={cn('font-semibold tabular-nums', over ? 'text-danger' : 'text-ink')}>{formatNumber(total)}</span> of {formatNumber(max)} documents{adding > 0 ? ' after import' : ''}
        </span>
        {over && <span className="font-medium text-danger">Untick {formatNumber(total - max)} pages</span>}
      </div>
      <Progress value={Math.min(1, total / Math.max(1, max))} tone={over ? 'danger' : total / max >= 0.9 ? 'warn' : 'accent'} label="Knowledge base capacity" />
    </div>
  );
}

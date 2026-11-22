import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { AlertTriangle, ExternalLink, Globe, MoreHorizontal, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { isApiError } from '@/lib/api/client';
import { siteWorking, useDeleteSite, useDriveSite, useImportSite, useSite, useSites, useSyncSite, useUpdateSite } from '@/lib/api/endpoints/knowledge';
import type { KnowledgeSite } from '@/lib/api/types';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import {
  Button,
  Callout,
  Card,
  DataTable,
  DescList,
  EmptyState,
  ErrorState,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Sheet,
  Skeleton,
  SkeletonRows,
  Switch,
  useConfirm,
  type Column,
} from '@/components/ui';
import { CapacityMeter, PageList, REFRESH_OPTIONS, RefreshSelect, SiteStatusBadge, SyncProgress } from './sites-ui';

interface Ctx {
  openAddWebsite: () => void;
  openSite: (id: string) => void;
}

/** Drives a working site's steps while the list shows it; renders nothing. */
function SiteDriver({ site }: { site: KnowledgeSite }) {
  const { can } = useScopeCtx();
  useDriveSite(site, can('knowledge.write'));
  return null;
}

const nextSync = (s: KnowledgeSite) =>
  s.refresh === 'off' ? 'Only when you sync' : s.next_sync_at ? (new Date(s.next_sync_at).getTime() <= Date.now() ? 'Soon' : `In ${formatRelative(s.next_sync_at).replace(/ ago$/, '')}`) : '—';

export function useConfirmDeleteSite() {
  const del = useDeleteSite();
  const confirm = useConfirm();
  return (s: KnowledgeSite, onDeleted?: () => void) =>
    confirm({
      title: `Remove ${s.host}?`,
      description: `The ${formatNumber(s.counts.indexed)} pages learned from it leave the knowledge base, and it stops syncing. The website itself isn't touched.`,
      confirmLabel: 'Remove website',
      tone: 'danger',
      onConfirm: () => del.mutateAsync(s.id).then(() => onDeleted?.()),
    });
}

export function WebsitesTab() {
  const { can } = useScopeCtx();
  const { openAddWebsite, openSite } = useOutletContext<Ctx>();
  const sites = useSites();
  const sync = useSyncSite();
  const confirmDelete = useConfirmDeleteSite();
  const list = sites.data ?? [];

  const columns: Column<KnowledgeSite>[] = [
    {
      key: 'site',
      header: 'Website',
      cell: (s) => (
        <span className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent">
            <Globe className="size-4" />
          </span>
          <span className="grid min-w-0">
            <span className="truncate font-semibold text-ink">{s.host}</span>
            <span className="truncate text-xs text-ink-faint">{s.root_url}</span>
          </span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (s) => <SiteStatusBadge site={s} /> },
    {
      key: 'pages',
      header: 'Pages learned',
      align: 'right',
      cell: (s) => (
        <span className="tabular-nums text-ink-muted">
          {s.status === 'review' || s.status === 'mapping' ? '—' : `${formatNumber(s.counts.indexed)} of ${formatNumber(s.counts.selected)}`}
        </span>
      ),
    },
    { key: 'synced', header: 'Last synced', align: 'right', hideBelowLg: true, cell: (s) => <span className="whitespace-nowrap text-ink-muted">{s.last_synced_at ? formatRelative(s.last_synced_at) : 'Never'}</span> },
    { key: 'next', header: 'Next check', align: 'right', hideBelowLg: true, cell: (s) => <span className="whitespace-nowrap text-ink-muted">{s.status === 'ready' ? nextSync(s) : '—'}</span> },
  ];
  if (can('knowledge.write')) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      className: 'w-px',
      cell: (s) => (
        <span className="inline-flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="xs" variant="quiet" leading={<RefreshCw />} disabled={s.status !== 'ready' && s.status !== 'failed'} onClick={() => sync.mutate(s.id)}>
            Sync now
          </Button>
          <Button size="xs" icon variant="quiet" className="hover:text-danger" aria-label={`Remove ${s.host}`} disabled={s.status === 'deleting'} onClick={() => void confirmDelete(s)}>
            <Trash2 />
          </Button>
        </span>
      ),
    });
  }

  return (
    <div className="grid gap-5">
      {list.filter(siteWorking).map((s) => (
        <SiteDriver key={s.id} site={s} />
      ))}
      <Card flush>
        {sites.isPending ? (
          <SkeletonRows rows={3} className="p-4" />
        ) : sites.isError ? (
          <ErrorState error={sites.error} onRetry={() => sites.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={list}
            getKey={(s) => s.id}
            onRowClick={(s) => openSite(s.id)}
            empty={
              <EmptyState
                icon={<Globe />}
                title="Learn from your website"
                description="Add your website and the assistant learns from its pages: help articles, policies, prices. It checks for changes on its own, so answers stay current."
                action={
                  can('knowledge.write') && (
                    <Button variant="accent" leading={<Plus />} onClick={openAddWebsite}>
                      Add website
                    </Button>
                  )
                }
              />
            }
          />
        )}
      </Card>
    </div>
  );
}

/** A website's settings and pages. */
export function SiteSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = useScopeCtx();
  const writable = can('knowledge.write');
  const q = useSite(id);
  const s = q.data;
  const update = useUpdateSite();
  const sync = useSyncSite();
  const importSite = useImportSite();
  const confirmDelete = useConfirmDeleteSite();
  const [page, setPage] = useState('');
  useDriveSite(s, writable);

  const imported = s && s.status !== 'review' && s.status !== 'mapping';
  const adding = s ? s.pages.filter((p) => p.selected && !p.document_id).length : 0;
  const updateError = update.error && isApiError(update.error) ? update.error.message : undefined;
  const addPage = () => {
    if (!s || !page.trim()) return;
    update.mutate({ id: s.id, body: { add: [page.trim()] } }, { onSuccess: () => setPage('') });
  };

  return (
    <Sheet
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={s?.host ?? 'Website'}
      description={s?.root_url}
      headerExtra={
        s &&
        writable && (
          <Menu>
            <MenuTrigger asChild>
              <Button size="xs" icon variant="quiet" aria-label="Website actions">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => window.open(s.root_url, '_blank', 'noopener')}>
                <ExternalLink /> Visit the website
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger disabled={s.status === 'deleting'} onSelect={() => void confirmDelete(s, onClose)}>
                <Trash2 /> Remove website
              </MenuItem>
            </MenuContent>
          </Menu>
        )
      }
      footer={
        s &&
        writable &&
        s.status !== 'deleting' &&
        (s.status === 'review' ? (
          <Button variant="accent" loading={importSite.isPending} disabled={s.counts.selected === 0 || s.capacity.used + adding > s.capacity.max} onClick={() => importSite.mutate(s.id)}>
            Import {formatNumber(s.counts.selected)} pages
          </Button>
        ) : (
          <Button variant="accent" leading={<RefreshCw />} loading={sync.isPending} disabled={s.status !== 'ready' && s.status !== 'failed'} onClick={() => sync.mutate(s.id)}>
            {s.status === 'syncing' || s.status === 'mapping' ? 'Syncing…' : 'Sync now'}
          </Button>
        ))
      }
    >
      {q.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} compact notFound={{ title: 'Website not found', description: 'It may have been removed.', back: { to: '/knowledge/websites', label: 'Back to websites' } }} />
      ) : (
        s && (
          <div className="grid gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <SiteStatusBadge site={s} />
            </div>
            {s.status === 'syncing' && <SyncProgress site={s} />}
            {s.status === 'mapping' && <p className="text-[0.8125rem] text-ink-muted">Finding the website's pages… {s.counts.total > 0 && `${formatNumber(s.counts.total)} so far.`}</p>}
            {s.status === 'failed' && (
              <Callout tone="danger" icon={<AlertTriangle />} title="The last sync failed">
                {s.error ?? 'The website could not be read. Sync again to retry.'}
              </Callout>
            )}
            {s.status === 'review' && (
              <Callout tone="warn" icon={<Globe />} title="Not imported yet">
                Review the pages below, then import them.
              </Callout>
            )}
            {s.status === 'deleting' && <p className="text-[0.8125rem] text-ink-muted">Removing the pages learned from this website…</p>}

            {s.status !== 'deleting' && (
              <div className="grid gap-4 rounded-[14px] border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="grid gap-0.5">
                    <span className="text-[0.8125rem] font-semibold text-ink">Check for changes</span>
                    <span className="text-xs text-ink-faint">Changed pages are learned again. Unchanged pages cost nothing.</span>
                  </span>
                  {writable ? (
                    <RefreshSelect value={s.refresh} disabled={update.isPending} onChange={(refresh) => update.mutate({ id: s.id, body: { refresh } })} />
                  ) : (
                    <span className="text-[0.8125rem] text-ink">{REFRESH_OPTIONS.find((o) => o.value === s.refresh)?.label}</span>
                  )}
                </div>
                <Switch
                  label="Add new pages"
                  description="When a sync finds pages that weren't there before, learn from them too."
                  checked={s.auto_add_new}
                  disabled={!writable || update.isPending}
                  onCheckedChange={(auto_add_new) => update.mutate({ id: s.id, body: { auto_add_new } })}
                />
              </div>
            )}

            <DescList
              items={[
                { label: 'Pages learned', value: `${formatNumber(s.counts.indexed)} of ${formatNumber(s.counts.selected)} ticked`, hidden: !imported },
                { label: 'Pages found', value: formatNumber(s.counts.total) },
                { label: 'Failed', value: formatNumber(s.counts.failed), hidden: !s.counts.failed },
                { label: 'Last synced', value: s.last_synced_at ? formatDateTime(s.last_synced_at) : 'Never' },
                { label: 'Next check', value: nextSync(s), hidden: s.status !== 'ready' },
              ]}
            />

            {s.status !== 'deleting' && s.status !== 'mapping' && (
              <div className="grid gap-3">
                <p className="mono text-ink-faint">Pages</p>
                <CapacityMeter used={s.capacity.used} adding={adding} max={s.capacity.max} />
                {updateError && <p className="text-xs font-medium text-danger">{updateError}</p>}
                <PageList
                  pages={s.pages}
                  editable={writable}
                  busy={update.isPending}
                  showStatus={Boolean(imported)}
                  onToggle={(urls, selected) => urls.length && update.mutate({ id: s.id, body: selected ? { select: urls } : { unselect: urls } })}
                />
                {writable && (
                  <div className="grid gap-1.5">
                    <label htmlFor="site-add-page" className="text-[0.8125rem] font-semibold text-ink">
                      Add a page
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="site-add-page"
                        size="sm"
                        type="url"
                        value={page}
                        maxLength={2048}
                        onChange={(e) => setPage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addPage()}
                        placeholder={`${s.root_url.replace(/\/$/, '')}/…`}
                      />
                      <Button size="sm" loading={update.isPending && Boolean(page)} disabled={!page.trim()} onClick={addPage}>
                        Add
                      </Button>
                    </div>
                    <p className="text-xs text-ink-faint">A page of this website the list is missing, such as one no menu links to.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      )}
    </Sheet>
  );
}

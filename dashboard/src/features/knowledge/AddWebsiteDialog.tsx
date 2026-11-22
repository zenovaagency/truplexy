import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Globe } from 'lucide-react';
import { isApiError } from '@/lib/api/client';
import { useCreateSite, useDeleteSite, useDriveSite, useImportSite, useSite, useSyncSite, useUpdateSite } from '@/lib/api/endpoints/knowledge';
import { formatNumber } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Button, Callout, Dialog, Field, Input, Skeleton } from '@/components/ui';
import { Loader } from '@/components/ui/loader';
import { CapacityMeter, PageList, RefreshSelect, SyncProgress } from './sites-ui';

/**
 * Adds a website: the address, then mapping (the dialog drives it while open), the list of pages to review with junk
 * unticked, then the import. Closing it never stops the work: the scheduled job carries on.
 */
export function AddWebsiteDialog({ open, onClose, onOpenSite }: { open: boolean; onClose: () => void; onOpenSite: (id: string) => void }) {
  const { can } = useScopeCtx();
  const [address, setAddress] = useState('');
  const [siteId, setSiteId] = useState<string | null>(null);
  const create = useCreateSite();
  const update = useUpdateSite();
  const importSite = useImportSite();
  const sync = useSyncSite();
  const del = useDeleteSite();
  const q = useSite(siteId);
  const site = q.data;
  useDriveSite(site, can('knowledge.write'));

  const close = () => {
    setSiteId(null);
    setAddress('');
    create.reset();
    importSite.reset();
    onClose();
  };
  const start = () => {
    if (!address.trim() || create.isPending) return;
    create.mutate(address.trim(), { onSuccess: (s) => setSiteId(s.id) });
  };
  // A site that failed before anything was imported is removed, so the address can be typed again.
  const changeAddress = () => {
    if (site) del.mutate(site.id);
    setSiteId(null);
    create.reset();
  };

  const adding = site ? site.pages.filter((p) => p.selected && !p.document_id).length : 0;
  const over = site ? site.capacity.used + adding > site.capacity.max || site.counts.selected > site.max_pages : false;
  const createError = create.error && isApiError(create.error) ? create.error.message : create.error ? 'Something went wrong. Try again.' : undefined;

  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (!siteId) {
    body = (
      <div className="grid gap-4">
        <Field label="Website address" error={createError} hint="Your whole site, or one section of it, such as https://example.com/help.">
          <Input
            type="url"
            inputMode="url"
            autoFocus
            maxLength={2048}
            value={address}
            disabled={create.isPending}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            placeholder="https://example.com"
          />
        </Field>
        <Callout tone="neutral" icon={<Globe />}>
          We read your sitemap and links to list the pages, and leave out sign-in, cart and search pages. You choose what the assistant learns before anything is added.
        </Callout>
      </div>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="accent" loading={create.isPending} disabled={!address.trim()} onClick={start}>
          Find pages
        </Button>
      </>
    );
  } else if (!site) {
    body = <Skeleton className="h-24" />;
    footer = null;
  } else if (site.status === 'mapping') {
    body = (
      <div className="grid place-items-center gap-3 py-8 text-center" aria-live="polite">
        <Loader size={28} label={null} />
        <p className="text-[0.9375rem] font-semibold text-ink">Finding the pages of {site.host}…</p>
        <p className="text-xs text-ink-faint">{site.counts.total > 0 ? `${formatNumber(site.counts.total)} pages found so far` : 'Reading the sitemap and links'}</p>
      </div>
    );
    footer = (
      <Button variant="ghost" onClick={close}>
        Close
      </Button>
    );
  } else if (site.status === 'failed') {
    body = (
      <Callout tone="danger" icon={<AlertTriangle />} title={`Couldn't read ${site.host}`}>
        {site.error ?? 'The site could not be read.'}
      </Callout>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={changeAddress}>
          Change the address
        </Button>
        <Button variant="accent" loading={sync.isPending} onClick={() => sync.mutate(site.id)}>
          Try again
        </Button>
      </>
    );
  } else if (site.status === 'review') {
    body = (
      <div className="grid gap-5">
        <p className="text-[0.8125rem] text-ink-muted">
          Found <span className="font-semibold text-ink">{formatNumber(site.counts.total)}</span> pages on {site.host}. Untick any the assistant shouldn't learn from.
        </p>
        <CapacityMeter used={site.capacity.used} adding={adding} max={site.capacity.max} />
        {site.counts.selected > site.max_pages && (
          <p className="text-xs font-medium text-danger">A website can import up to {formatNumber(site.max_pages)} pages.</p>
        )}
        <PageList
          pages={site.pages}
          editable={can('knowledge.write')}
          busy={update.isPending}
          onToggle={(urls, selected) => urls.length && update.mutate({ id: site.id, body: selected ? { select: urls } : { unselect: urls } })}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="grid gap-0.5">
            <span className="text-[0.8125rem] font-semibold text-ink">Check for changes</span>
            <span className="text-xs text-ink-faint">Changed pages are learned again; new pages are added.</span>
          </span>
          <RefreshSelect value={site.refresh} disabled={update.isPending} onChange={(refresh) => update.mutate({ id: site.id, body: { refresh } })} />
        </div>
        {importSite.error && isApiError(importSite.error) && <p className="text-xs font-medium text-danger">{importSite.error.message}</p>}
      </div>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          Later
        </Button>
        <Button variant="accent" loading={importSite.isPending} disabled={site.counts.selected === 0 || over || update.isPending} onClick={() => importSite.mutate(site.id)}>
          Import {formatNumber(site.counts.selected)} {site.counts.selected === 1 ? 'page' : 'pages'}
        </Button>
      </>
    );
  } else if (site.status === 'syncing') {
    body = (
      <div className="grid gap-4">
        <p className="text-[0.9375rem] font-semibold text-ink">Learning from {site.host}…</p>
        <SyncProgress site={site} />
        <p className="text-xs text-ink-faint">You can close this window. The import keeps going in the background, and pages are used as soon as they're learned.</p>
      </div>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          Close
        </Button>
        <Button
          onClick={() => {
            close();
            onOpenSite(site.id);
          }}
        >
          Open website
        </Button>
      </>
    );
  } else {
    body = (
      <div className="grid place-items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-8 text-live" />
        <p className="text-[0.9375rem] font-semibold text-ink">
          Learned {formatNumber(site.counts.indexed)} {site.counts.indexed === 1 ? 'page' : 'pages'} from {site.host}
        </p>
        {site.counts.failed > 0 && <p className="text-xs text-ink-faint">{formatNumber(site.counts.failed)} pages couldn't be read. Open the website to see why.</p>}
      </div>
    );
    footer = (
      <>
        <Button
          variant="ghost"
          onClick={() => {
            close();
            onOpenSite(site.id);
          }}
        >
          Open website
        </Button>
        <Button variant="accent" onClick={close}>
          Done
        </Button>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      size={site?.status === 'review' ? 'lg' : 'md'}
      title="Add a website"
      description={site ? site.root_url : 'The assistant learns from your website and keeps up with its changes.'}
      footer={footer}
    >
      {body}
    </Dialog>
  );
}

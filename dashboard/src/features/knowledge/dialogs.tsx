import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  FileUp,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { hasCode, isApiError } from '@/lib/api/client';
import {
  processUntilDone,
  reindexDocument,
  useCreateArticle,
  useDeleteDocument,
  useDocument,
  useUpdateDocument,
  type ArticleInput,
} from '@/lib/api/endpoints/knowledge';
import type { DocMetadata, KnowledgeDocument } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatBytes, formatDateTime, formatNumber } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { qk } from '@/lib/query-keys';
import { useScopeCtx } from '@/lib/session/scope-context';
import { uploadMany, type UploadState } from '@/lib/upload';
import {
  Badge,
  Button,
  Callout,
  DescList,
  Dialog,
  ErrorState,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Progress,
  Segmented,
  Sheet,
  Skeleton,
  Textarea,
  useConfirm,
} from '@/components/ui';
import { DocStatusBadge } from '@/components/domain/badges';

/* ------------------------------------------------------------------ */
/* Metadata fields shared by uploads and articles                       */
/* ------------------------------------------------------------------ */

const META_FIELDS: { key: keyof DocMetadata; label: string; placeholder: string; max: number }[] = [
  { key: 'source_url', label: 'Source URL', placeholder: 'https://help.example.com/returns', max: 2000 },
  { key: 'knowledge_base_id', label: 'Knowledge base', placeholder: 'e.g. help-center', max: 64 },
  { key: 'locale', label: 'Locale', placeholder: 'e.g. en-US', max: 64 },
  { key: 'product', label: 'Product', placeholder: 'e.g. coffee-machines', max: 64 },
  { key: 'version', label: 'Version', placeholder: 'e.g. 2026', max: 64 },
];

function MetadataFields({ value, onChange, defaultOpen }: { value: DocMetadata; onChange: (v: DocMetadata) => void; defaultOpen?: boolean }) {
  const filled = META_FIELDS.filter((f) => value[f.key]).length;
  const [open, setOpen] = useState(defaultOpen || filled > 0);
  return (
    <div className="rounded-[14px] border border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={open}>
        <span className="flex-1">
          <span className="block text-[0.8125rem] font-semibold text-ink">Source and filters {filled > 0 && <Badge tone="accent" className="ml-1">{filled}</Badge>}</span>
          <span className="block text-xs text-ink-faint">A link cited with answers, and metadata that retrieval can filter on.</span>
        </span>
        <ChevronDown className={cn('size-4 text-ink-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
          {META_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} optional className={f.key === 'source_url' ? 'sm:col-span-2' : undefined}>
              <Input
                size="sm"
                value={value[f.key] ?? ''}
                placeholder={f.placeholder}
                type={f.key === 'source_url' ? 'url' : 'text'}
                onChange={(e) => onChange({ ...value, [f.key]: e.target.value.slice(0, f.max) })}
              />
            </Field>
          ))}
        </div>
      )}
    </div>
  );
}

const cleanMeta = (m: DocMetadata) => Object.fromEntries(Object.entries(m).filter(([, v]) => v?.trim())) as DocMetadata;

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

const PHASE_LABEL: Record<UploadState['phase'], string> = {
  queued: 'Waiting',
  hashing: 'Reading file',
  registering: 'Preparing',
  uploading: 'Uploading',
  processing: 'Indexing',
  indexed: 'Indexed',
  failed: 'Failed',
  duplicate: 'Already added',
};

const TEXT_EXT = /\.(md|markdown|txt|text|csv|json)$/i;
const TEXT_MAX = 5 * 1024 * 1024;

interface QueuedFile {
  key: string;
  file: File;
  state: UploadState;
  problem?: string;
}

export function UploadDialog({
  open,
  onOpenChange,
  accept,
  maxFileBytes,
  onOpenDocument,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accept: string[];
  maxFileBytes: number;
  onOpenDocument: (id: string) => void;
}) {
  const { scope } = useScopeCtx();
  const qc = useQueryClient();
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [meta, setMeta] = useState<DocMetadata>({});
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const done = files.length > 0 && files.every((f) => ['indexed', 'failed', 'duplicate'].includes(f.state.phase) || f.problem);

  useEffect(() => {
    if (open) {
      setFiles([]);
      setMeta({});
      setRunning(false);
    }
  }, [open]);

  const exts = accept
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => (a.startsWith('.') ? a : `.${a}`).toLowerCase());
  const add = useCallback(
    (list: FileList | File[]) => {
      const next = [...list].map<QueuedFile>((file) => {
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        const limit = TEXT_EXT.test(file.name) ? Math.min(TEXT_MAX, maxFileBytes) : maxFileBytes;
        const problem = !exts.includes(ext)
          ? `${ext || 'This type'} isn't supported`
          : file.size > limit
            ? `Larger than ${formatBytes(limit)}`
            : file.size === 0
              ? 'The file is empty'
              : undefined;
        return { key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, state: { phase: 'queued', progress: 0 }, problem };
      });
      setFiles((f) => [...f, ...next]);
    },
    [exts, maxFileBytes],
  );

  const start = async () => {
    const ok = files.filter((f) => !f.problem && f.state.phase === 'queued');
    if (!ok.length) return;
    setRunning(true);
    await uploadMany(scope, ok.map(({ key, file }) => ({ key, file })), cleanMeta(meta), (key, state) =>
      setFiles((all) => all.map((f) => (f.key === key ? { ...f, state } : f))),
    );
    setRunning(false);
    qc.invalidateQueries({ queryKey: qk.bot(scope, 'documents') });
  };

  const pending = files.filter((f) => !f.problem && f.state.phase === 'queued').length;
  const indexed = files.filter((f) => f.state.phase === 'indexed').length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !running && onOpenChange(o)}
      size="lg"
      title="Upload documents"
      description="Files go straight to storage and are indexed in the background. Keep this open until they finish."
      footer={
        done ? (
          <Button variant="accent" onClick={() => onOpenChange(false)}>
            Done{indexed ? ` · ${indexed} indexed` : ''}
          </Button>
        ) : (
          <>
            <Button variant="ghost" disabled={running} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="accent" loading={running} disabled={!pending} onClick={start} leading={<UploadCloud />}>
              {running ? 'Uploading…' : `Upload ${pending || ''} ${pending === 1 ? 'file' : 'files'}`}
            </Button>
          </>
        )
      }
    >
      <div className="grid gap-4">
        {!running && !done && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              add(e.dataTransfer.files);
            }}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            role="button"
            tabIndex={0}
            className={cn(
              'grid cursor-pointer place-items-center gap-2 rounded-[16px] border-2 border-dashed px-6 py-10 text-center transition-colors',
              drag ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface-2/50 hover:border-accent/60',
            )}
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-surface text-accent shadow-sm">
              <FileUp className="size-5" />
            </span>
            <p className="text-[0.875rem] font-semibold text-ink">Drop files here, or click to choose</p>
            <p className="text-xs text-ink-faint">
              {exts.join(', ')} · text up to {formatBytes(Math.min(TEXT_MAX, maxFileBytes))}, PDF, Word and HTML up to {formatBytes(maxFileBytes)}
            </p>
            <input
              ref={input}
              type="file"
              multiple
              accept={exts.join(',')}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) add(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {files.length > 0 && (
          <ul className="grid gap-2">
            {files.map((f) => {
              const s = f.state;
              const failed = s.phase === 'failed' || Boolean(f.problem);
              return (
                <li key={f.key} className={cn('grid gap-2 rounded-[12px] border px-3.5 py-3', failed ? 'border-danger/30 bg-danger-soft/50' : 'border-line bg-surface')}>
                  <div className="flex items-center gap-3">
                    <FileText className="size-4 shrink-0 text-ink-faint" />
                    <div className="grid min-w-0 flex-1">
                      <span className="truncate text-[0.8125rem] font-semibold text-ink">{f.file.name}</span>
                      <span className="text-xs text-ink-faint">
                        {formatBytes(f.file.size)} · {f.problem ?? (s.error && s.phase !== 'indexed' ? s.error : PHASE_LABEL[s.phase])}
                        {s.phase === 'processing' && s.document?.chunk_count ? ` · ${s.document.embedded_count}/${s.document.chunk_count} passages` : ''}
                      </span>
                    </div>
                    {s.phase === 'indexed' && <CheckCircle2 className="size-4 text-live" />}
                    {failed && <AlertTriangle className="size-4 text-danger" />}
                    {s.phase === 'duplicate' && s.duplicateOf && (
                      <Button size="xs" variant="ghost" onClick={() => onOpenDocument(s.duplicateOf!)}>
                        Open existing
                      </Button>
                    )}
                    {['hashing', 'registering', 'uploading', 'processing'].includes(s.phase) && <Loader2 className="size-4 animate-spin text-accent" />}
                    {s.phase === 'queued' && !running && (
                      <Button size="xs" icon variant="quiet" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles((all) => all.filter((x) => x.key !== f.key))}>
                        <X />
                      </Button>
                    )}
                  </div>
                  {(s.phase === 'uploading' || s.phase === 'processing') && (
                    <Progress value={s.phase === 'uploading' ? s.progress * 0.5 : 0.5 + s.progress * 0.5} label={`${f.file.name} progress`} />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!running && !done && <MetadataFields value={meta} onChange={setMeta} />}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Article editor (new article, or edit any indexed document's text)    */
/* ------------------------------------------------------------------ */

export function ArticleEditor({
  open,
  onOpenChange,
  doc,
  onSaved,
  onOpenDocument,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Edit this document; absent for a new article. */
  doc?: KnowledgeDocument;
  onSaved?: (doc: KnowledgeDocument) => void;
  onOpenDocument: (id: string) => void;
}) {
  const create = useCreateArticle();
  const update = useUpdateDocument();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [meta, setMeta] = useState<DocMetadata>({});
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [dupe, setDupe] = useState<string | null>(null);
  const confirm = useConfirm();
  const dirty = doc ? title !== doc.title || content !== (doc.content ?? '') : Boolean(title || content);

  useEffect(() => {
    if (!open) return;
    setTitle(doc?.title ?? '');
    setContent(doc?.content ?? '');
    setMeta(doc ? { source_url: doc.source_url, knowledge_base_id: doc.knowledge_base_id, locale: doc.locale, product: doc.product, version: doc.version } : {});
    setTab('write');
    setDupe(null);
  }, [open, doc]);

  const close = async (o: boolean) => {
    if (o || !dirty) return onOpenChange(o);
    if (await confirm({ title: 'Discard your changes?', confirmLabel: 'Discard', tone: 'danger' })) onOpenChange(false);
  };

  const save = () => {
    setDupe(null);
    const onError = (e: unknown) => {
      if (hasCode(e, 'DUPLICATE_DOCUMENT') && isApiError(e)) setDupe(e.documentId ?? '');
    };
    if (doc) {
      // Empty strings remove metadata on update.
      const body: Partial<ArticleInput> = { title: title.trim(), content, ...Object.fromEntries(META_FIELDS.map((f) => [f.key, meta[f.key]?.trim() ?? ''])) };
      update.mutate({ id: doc.id, body }, { onSuccess: (d) => (notifySuccess('Saved and reindexed'), onSaved?.(d), onOpenChange(false)), onError });
    } else {
      create.mutate(
        { title: title.trim(), content, ...cleanMeta(meta) },
        { onSuccess: (d) => (notifySuccess('Article added', `${d.chunk_count} passages indexed.`), onSaved?.(d), onOpenChange(false)), onError },
      );
    }
  };

  const busy = create.isPending || update.isPending;
  const valid = title.trim().length > 0 && title.length <= 160 && content.trim().length > 0 && content.length <= 50_000;

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      width="lg"
      title={doc ? `Edit “${doc.title}”` : 'New article'}
      description={doc ? 'Saving reindexes the document. Unchanged passages keep their embeddings.' : 'Write in Markdown. It is indexed before saving finishes, so it can take a few seconds.'}
      footer={
        <>
          <Button variant="ghost" onClick={() => void close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} disabled={!valid || (doc && !dirty && !metaChanged(doc, meta))} onClick={save}>
            {doc ? 'Save and reindex' : 'Add article'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {dupe !== null && (
          <Callout
            tone="warn"
            icon={<AlertTriangle />}
            title="This content is already in the knowledge base"
            action={dupe ? <Button size="xs" onClick={() => onOpenDocument(dupe)}>Open it</Button> : undefined}
          >
            Edit the existing document instead of adding a copy.
          </Callout>
        )}
        <Field label="Title" aside={`${title.length}/160`}>
          <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 160))} placeholder="e.g. Returns and refunds" autoFocus={!doc} />
        </Field>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.8125rem] font-semibold text-ink">Content</span>
            <Segmented size="xs" label="Editor mode" value={tab} onChange={setTab} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
          </div>
          {tab === 'write' ? (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 50_000))}
              rows={18}
              className="min-h-[360px] font-mono text-[0.8125rem]"
              placeholder={'# Returns\n\nYou can return any item within 30 days…'}
            />
          ) : (
            <div className="prose-sm min-h-[360px] rounded-[10px] border border-line bg-surface-2/40 p-4 text-ink">{content || <span className="text-ink-faint">Nothing to preview.</span>}</div>
          )}
          <p className="flex justify-between text-xs text-ink-faint">
            <span>Headings split the article into passages, so short sections with clear headings retrieve best.</span>
            <span className="tabular-nums">{formatNumber(content.length)}/50,000</span>
          </p>
        </div>
        <MetadataFields value={meta} onChange={setMeta} />
      </div>
    </Sheet>
  );
}

const metaChanged = (doc: KnowledgeDocument, m: DocMetadata) => META_FIELDS.some((f) => (doc[f.key] ?? '') !== (m[f.key] ?? ''));

/* ------------------------------------------------------------------ */
/* Document drawer                                                     */
/* ------------------------------------------------------------------ */

export function DocumentSheet({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (doc: KnowledgeDocument) => void }) {
  const { scope, can } = useScopeCtx();
  const q = useDocument(id);
  const del = useDeleteDocument();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [working, setWorking] = useState<string | null>(null);
  const writable = can('knowledge.write');
  const d = q.data;

  const reindex = async (opts: { extract?: boolean; force?: boolean }, label: string) => {
    if (!d) return;
    setWorking(label);
    try {
      let doc = await reindexDocument(scope, d.id, opts);
      if (doc.status === 'processing') doc = await processUntilDone(scope, d.id, (x) => qc.setQueryData(qk.bot(scope, 'document', d.id), (old: KnowledgeDocument | undefined) => ({ ...old, ...x })));
      qc.setQueryData(qk.bot(scope, 'document', d.id), (old: KnowledgeDocument | undefined) => ({ ...old, ...doc }));
      qc.invalidateQueries({ queryKey: qk.bot(scope, 'documents') });
      if (doc.status === 'indexed') notifySuccess('Reindexed', `${doc.chunk_count} passages.`);
      else notifyError(new Error(doc.error ?? 'Indexing failed.'), 'Indexing failed');
    } catch (e) {
      notifyError(e);
    } finally {
      setWorking(null);
    }
  };

  const remove = () =>
    d &&
    confirm({
      title: `Delete “${d.title}”?`,
      description: 'Its passages, embeddings and stored file are deleted. The assistant stops using it right away.',
      confirmLabel: 'Delete document',
      tone: 'danger',
      onConfirm: () => del.mutateAsync(d.id).then(onClose),
    });

  const editable = d && (d.source_type === 'manual' || d.status === 'indexed');

  return (
    <Sheet
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={d?.title ?? 'Document'}
      description={d ? (d.source_type === 'file' ? d.source_name : 'Article') : undefined}
      headerExtra={
        d &&
        writable && (
          <Menu>
            <MenuTrigger asChild>
              <Button size="xs" icon variant="quiet" aria-label="Document actions" disabled={Boolean(working)}>
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>Reindex</MenuLabel>
              <MenuItem onSelect={() => void reindex({}, 'Rebuilding')}>
                <RefreshCw /> Rebuild passages
              </MenuItem>
              {d.source_type === 'file' && (
                <MenuItem onSelect={() => void reindex({ extract: true }, 'Re-reading the file')}>
                  <FileText /> Re-read the file
                </MenuItem>
              )}
              <MenuItem onSelect={() => void reindex({ force: true }, 'Re-embedding')}>
                <RefreshCw /> Re-embed every passage
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger onSelect={() => void remove()}>
                <Trash2 /> Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        )
      }
      footer={
        d &&
        writable && (
          <>
            {d.status === 'failed' && (
              <Button variant="ghost" loading={working === 'Retrying'} onClick={() => void reindex({ extract: d.source_type === 'file' }, 'Retrying')} leading={<RefreshCw />}>
                Retry indexing
              </Button>
            )}
            {editable && (
              <Button variant="accent" leading={<Pencil />} onClick={() => onEdit(d)} disabled={Boolean(working)}>
                Edit content
              </Button>
            )}
          </>
        )
      }
    >
      {q.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        d && (
          <div className="grid gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <DocStatusBadge status={d.status} />
              {working && (
                <Badge tone="accent">
                  <Loader2 className="size-3 animate-spin" /> {working}…
                </Badge>
              )}
            </div>
            {d.status === 'processing' && d.chunk_count > 0 && (
              <div className="grid gap-1.5">
                <Progress value={d.embedded_count / d.chunk_count} label="Indexing progress" />
                <p className="text-xs text-ink-faint">
                  {d.embedded_count} of {d.chunk_count} passages embedded
                </p>
              </div>
            )}
            {d.status === 'failed' && d.error && (
              <Callout tone="danger" icon={<AlertTriangle />} title="Indexing failed">
                {d.error}
              </Callout>
            )}
            {d.status === 'pending_upload' && (
              <Callout tone="warn" icon={<AlertTriangle />} title="The upload never finished">
                Upload the file again, or delete this entry.
              </Callout>
            )}
            <DescList
              items={[
                { label: 'Type', value: d.source_type === 'file' ? (d.mime_type ?? 'File') : 'Article (Markdown)' },
                { label: 'Size', value: formatBytes(d.byte_size) },
                { label: 'Passages', value: formatNumber(d.chunk_count) },
                { label: 'Tokens', value: formatNumber(d.token_count) },
                {
                  label: 'Source URL',
                  value: d.source_url ? (
                    <a href={d.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-accent hover:underline">
                      {d.source_url} <ExternalLink className="size-3 shrink-0" />
                    </a>
                  ) : (
                    '—'
                  ),
                },
                { label: 'Knowledge base', value: d.knowledge_base_id, hidden: !d.knowledge_base_id },
                { label: 'Locale', value: d.locale, hidden: !d.locale },
                { label: 'Product', value: d.product, hidden: !d.product },
                { label: 'Version', value: d.version, hidden: !d.version },
                { label: 'Indexed', value: formatDateTime(d.indexed_at), hidden: !d.indexed_at },
                { label: 'Updated', value: formatDateTime(d.updated_at) },
                { label: 'ID', value: <span className="font-mono text-xs">{d.id}</span> },
              ]}
            />
            <div className="grid gap-2">
              <p className="mono text-ink-faint">Content</p>
              {d.content ? (
                <div className="prose-sm max-h-[520px] overflow-y-auto rounded-[12px] border border-line bg-surface-2/40 p-4 text-ink">{d.content}</div>
              ) : (
                <p className="text-[0.8125rem] text-ink-faint">No text yet.</p>
              )}
            </div>
          </div>
        )
      )}
    </Sheet>
  );
}

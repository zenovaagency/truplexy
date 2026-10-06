import { useMemo, useState } from 'react';
import { Outlet, useOutletContext, useSearchParams } from 'react-router';
import { BookOpen, CheckCircle2, FilePlus2, FileText, FlaskConical, Search, Sparkles, TriangleAlert, Upload } from 'lucide-react';
import { useTenant } from '@/lib/api/endpoints/business';
import { useDocuments, useSearchKnowledge } from '@/lib/api/endpoints/knowledge';
import type { KnowledgeDocument, SearchFilters } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatBytes, formatMs, formatNumber, formatRelative } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import { useDebounce } from '@/hooks';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadMore,
  Page,
  PageHeader,
  Progress,
  SkeletonRows,
  SubNav,
  Textarea,
  Tip,
  type Column,
} from '@/components/ui';
import { DocStatusBadge } from '@/components/domain/badges';
import { ArticleEditor, DocumentSheet, UploadDialog } from './dialogs';

interface Ctx {
  openUpload: () => void;
  openArticle: () => void;
  openDoc: (id: string) => void;
}

/** Defaults until the first list response says otherwise. */
const DEFAULT_ACCEPT = ['.md', '.markdown', '.txt', '.text', '.csv', '.json', '.html', '.htm', '.pdf', '.docx'];

export default function KnowledgePage() {
  const { can, href, bot } = useScopeCtx();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<KnowledgeDocument | null>(null);
  // The documents query already has the limits; reuse its cache.
  const docs = useDocuments({});
  const first = docs.data?.pages[0];
  const accept = first?.accept;
  const uploadAccept = typeof accept === 'string'
    ? accept.split(',')
    : Array.isArray(accept) && accept.every((ext) => typeof ext === 'string')
      ? accept
      : DEFAULT_ACCEPT;

  const setParam = (k: string, v?: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        v ? n.set(k, v) : n.delete(k);
        return n;
      },
      { replace: true },
    );

  const ctx: Ctx = {
    openUpload: () => setParam('upload', '1'),
    openArticle: () => setParam('article', 'new'),
    openDoc: (id) => setParams((p) => {
      const n = new URLSearchParams(p);
      n.delete('upload');
      n.delete('article');
      n.set('doc', id);
      return n;
    }),
  };

  return (
    <Page>
      <PageHeader
        title="Knowledge base"
        description={`What ${bot.name} knows. Answers are drawn from these documents and cite them.`}
        actions={
          can('knowledge.write') && (
            <>
              <Button variant="ghost" leading={<FilePlus2 />} onClick={ctx.openArticle}>
                Write article
              </Button>
              <Button variant="accent" leading={<Upload />} onClick={ctx.openUpload}>
                Upload files
              </Button>
            </>
          )
        }
      />
      <SubNav
        items={[
          { to: href('knowledge'), label: 'Documents', icon: <BookOpen />, end: true, count: first?.total },
          { to: href('knowledge/search'), label: 'Test retrieval', icon: <FlaskConical /> },
        ]}
      />
      <Outlet context={ctx} />

      {can('knowledge.write') && (
        <>
          <UploadDialog
            open={params.get('upload') === '1'}
            onOpenChange={(o) => !o && setParam('upload')}
            accept={uploadAccept}
            maxFileBytes={first?.max_file_bytes ?? 25 * 1024 * 1024}
            onOpenDocument={ctx.openDoc}
          />
          <ArticleEditor
            open={params.get('article') === 'new' || Boolean(editing)}
            doc={editing ?? undefined}
            onOpenChange={(o) => {
              if (!o) {
                setEditing(null);
                setParam('article');
              }
            }}
            onOpenDocument={(id) => {
              setEditing(null);
              ctx.openDoc(id);
            }}
          />
        </>
      )}
      <DocumentSheet id={params.get('doc')} onClose={() => setParam('doc')} onEdit={(d) => setEditing(d)} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */

export function DocumentsTab() {
  const { can } = useScopeCtx();
  const { openUpload, openArticle, openDoc } = useOutletContext<Ctx>();
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const list = useDocuments({ q: q || undefined });
  const all = useDocuments({});
  const tenant = useTenant();
  const docs = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  const meta = all.data?.pages[0];
  // 0 means unlimited, for both the plan and the server.
  const planMax = tenant.data?.limits.documents_per_bot || Infinity;
  const max = Math.min(meta?.max_documents || Infinity, planMax);

  const columns: Column<KnowledgeDocument>[] = [
    {
      key: 'title',
      header: 'Document',
      cell: (d) => (
        <span className="flex items-center gap-3">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-[9px]', d.source_type === 'file' ? 'bg-qualified-soft text-qualified' : 'bg-accent-soft text-accent')}>
            {d.source_type === 'file' ? <FileText className="size-4" /> : <Sparkles className="size-4" />}
          </span>
          <span className="grid min-w-0">
            <span className="truncate font-semibold text-ink">{d.title}</span>
            <span className="truncate text-xs text-ink-faint">
              {d.source_type === 'file' ? d.source_name : 'Article'}
              {d.product && ` · ${d.product}`}
              {d.locale && ` · ${d.locale}`}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (d) =>
        d.status === 'processing' && d.chunk_count ? (
          <span className="grid w-28 gap-1">
            <DocStatusBadge status={d.status} />
            <Progress value={d.embedded_count / d.chunk_count} />
          </span>
        ) : d.status === 'failed' && d.error ? (
          <Tip content={d.error}>
            <span>
              <DocStatusBadge status={d.status} />
            </span>
          </Tip>
        ) : (
          <DocStatusBadge status={d.status} />
        ),
    },
    { key: 'chunks', header: 'Passages', align: 'right', hideBelowLg: true, cell: (d) => <span className="tabular-nums text-ink-muted">{formatNumber(d.chunk_count)}</span> },
    { key: 'size', header: 'Size', align: 'right', hideBelowLg: true, cell: (d) => <span className="tabular-nums text-ink-muted">{formatBytes(d.byte_size)}</span> },
    { key: 'updated', header: 'Updated', align: 'right', cell: (d) => <span className="whitespace-nowrap text-ink-muted">{formatRelative(d.updated_at)}</span> },
  ];

  return (
    <div className="grid gap-5">
      <div className="panel grid w-full max-w-sm content-center gap-2 p-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-ink">Capacity</span>
          <span className="font-mono tabular-nums text-ink-faint">
            {formatNumber(meta?.total ?? 0)} / {Number.isFinite(max) ? formatNumber(max) : '—'}
          </span>
        </div>
        <Progress value={Number.isFinite(max) && meta ? meta.total / max : 0} tone={meta && meta.total / max >= 0.9 ? 'warn' : 'accent'} label="Documents used" />
        <span className="text-[0.7rem] text-ink-faint">Documents for this bot on your plan</span>
      </div>
      <Card flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input size="sm" className="pl-9" placeholder="Search titles and file names" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search documents" />
          </div>
        </div>
        {list.isPending ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={docs}
            getKey={(d) => d.id}
            onRowClick={(d) => openDoc(d.id)}
            className={cn(list.isFetching && !list.isFetchingNextPage && 'opacity-70 transition-opacity')}
            empty={
              q ? (
                <EmptyState compact icon={<Search />} title="No documents match" description="Try another search." />
              ) : (
                <EmptyState
                  icon={<BookOpen />}
                  title="Teach your assistant"
                  description="Upload help articles, policies, FAQs or product sheets. The assistant answers from them and cites them."
                  action={
                    can('knowledge.write') && (
                      <>
                        <Button variant="accent" leading={<Upload />} onClick={openUpload}>
                          Upload files
                        </Button>
                        <Button leading={<FilePlus2 />} onClick={openArticle}>
                          Write an article
                        </Button>
                      </>
                    )
                  }
                />
              )
            }
            footer={<LoadMore hasMore={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => list.fetchNextPage()} shown={docs.length} total={list.data?.pages[0]?.total} />}
          />
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Test retrieval                                                      */
/* ------------------------------------------------------------------ */

const CONFIDENCE = {
  high: { label: 'High confidence', tone: 'live' as const },
  low: { label: 'Low confidence', tone: 'warn' as const },
  none: { label: 'No match', tone: 'danger' as const },
};

const TIMINGS: [string, string][] = [
  ['rewrite_ms', 'Rewrite'],
  ['embed_ms', 'Embed'],
  ['dense_ms', 'Vector search'],
  ['lexical_ms', 'Keyword search'],
  ['load_ms', 'Load passages'],
  ['rerank_ms', 'Rerank'],
];

export function SearchTab() {
  const { openDoc } = useOutletContext<Ctx>();
  const search = useSearchKnowledge();
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(4);
  const [filters, setFilters] = useState<SearchFilters>({});
  const r = search.data;

  const run = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const f = Object.fromEntries(Object.entries(filters).filter(([, v]) => v?.trim()));
    search.mutate({ query: query.trim(), top_k: topK, filters: Object.keys(f).length ? f : undefined });
  };

  const timings = r ? TIMINGS.map(([k, label]) => ({ k, label, v: Number(r.trace[k] ?? 0) })).filter((t) => t.v > 0) : [];
  const total = r ? Number(r.trace.total_ms ?? r.trace.retrieval_ms ?? 0) : 0;

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card title="Ask a question" description="Runs retrieval exactly as a reply would, without the cache, and shows why each passage was chosen." className="self-start">
        <form onSubmit={run} className="grid gap-4">
          <Field label="Customer question">
            <Textarea rows={3} value={query} onChange={(e) => setQuery(e.target.value.slice(0, 4000))} placeholder="e.g. Can I return an opened coffee grinder?" />
          </Field>
          <Field label="Passages to return" aside={topK}>
            <input type="range" min={1} max={20} value={topK} onChange={(e) => setTopK(Number(e.target.value))} className="w-full accent-[var(--color-btn)]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {(['knowledge_base_id', 'locale', 'product', 'version'] as const).map((k) => (
              <Field key={k} label={k === "knowledge_base_id" ? "Knowledge base" : k[0]!.toUpperCase() + k.slice(1)}>
                <Input size="sm" value={filters[k] ?? ''} onChange={(e) => setFilters({ ...filters, [k]: e.target.value.slice(0, 64) })} />
              </Field>
            ))}
          </div>
          <Button type="submit" variant="accent" loading={search.isPending} disabled={!query.trim()} leading={<Search />}>
            Test retrieval
          </Button>
        </form>
      </Card>

      <div className="grid content-start gap-5">
        {!r && !search.isPending && !search.isError && (
          <Card>
            <EmptyState icon={<FlaskConical />} title="See what the assistant would read" description="Ask a question your customers ask. You'll see the passages it would answer from, and how each was ranked." />
          </Card>
        )}
        {search.isPending && (
          <Card>
            <SkeletonRows rows={4} />
          </Card>
        )}
        {search.isError && (
          <Card>
            <ErrorState error={search.error} />
          </Card>
        )}
        {r && !search.isPending && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={CONFIDENCE[r.result.confidence].tone} dot>
                {CONFIDENCE[r.result.confidence].label}
              </Badge>
              <Badge tone="outline">{r.result.candidates} candidates</Badge>
              <Badge tone="outline">{formatNumber(r.result.context_tokens)} context tokens</Badge>
              <Badge tone="outline">{formatMs(total)}</Badge>
              {r.trace.rewrite && r.trace.rewrite !== r.result.query && (
                <span className="text-xs text-ink-faint">
                  Rewritten as “<span className="text-ink">{String(r.trace.rewrite)}</span>”
                </span>
              )}
            </div>
            {r.result.fallback && (
              <Callout tone="warn" icon={<TriangleAlert />} title="Nothing matched closely">
                The assistant would likely say it doesn't know, or hand off. Add a document that answers this question.
              </Callout>
            )}
            {r.result.degraded.length > 0 && (
              <Callout tone="warn" icon={<TriangleAlert />} title="Some stages were skipped">
                {r.result.degraded.join(', ')} failed, so results may be less accurate.
              </Callout>
            )}

            <Card title="Passages the model reads" description="Numbered as they appear in the prompt.">
              {r.result.passages.length ? (
                <ol className="grid gap-3">
                  {r.result.passages.map((p, i) => (
                    <li key={p.id} className="grid gap-1.5 rounded-[12px] border border-line p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="grid size-6 place-items-center rounded-[7px] bg-accent-soft font-mono text-xs font-bold text-accent">{i + 1}</span>
                        <button type="button" onClick={() => openDoc(p.document_id)} className="truncate text-[0.8125rem] font-semibold text-ink hover:text-accent hover:underline">
                          {p.title}
                        </button>
                        {p.section && <span className="truncate text-xs text-ink-faint">› {p.section}</span>}
                      </div>
                      <p className="line-clamp-4 whitespace-pre-wrap text-[0.8125rem] text-ink-muted">{p.content}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[0.8125rem] text-ink-faint">No passages were selected.</p>
              )}
            </Card>

            <Card title="Ranking" description="Every candidate, in final order. Lower ranks are better; scores are higher-is-better." flush>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Passage</th>
                      <th className="text-right">Keyword</th>
                      <th className="text-right">Vector</th>
                      <th className="text-right">Fused</th>
                      <th className="text-right">Rerank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.hits.map((h, i) => (
                      <tr key={h.id} className={cn(!h.selected && 'opacity-60')}>
                        <td className="font-mono text-xs">{i + 1}</td>
                        <td>
                          <span className="flex items-center gap-2">
                            {h.selected && <CheckCircle2 className="size-3.5 shrink-0 text-live" aria-label="Selected" />}
                            <span className="grid min-w-0">
                              <span className="truncate font-medium text-ink">{h.title}</span>
                              {h.heading && <span className="truncate text-xs text-ink-faint">{h.heading}</span>}
                            </span>
                          </span>
                        </td>
                        <td className="text-right font-mono text-xs">{h.keyword_rank ?? '—'}</td>
                        <td className="text-right font-mono text-xs">
                          {h.vector_rank ?? '—'}
                          {h.vector_score != null && <span className="ml-1 text-ink-faint">({h.vector_score.toFixed(2)})</span>}
                        </td>
                        <td className="text-right font-mono text-xs">{h.fused_score?.toFixed(3) ?? '—'}</td>
                        <td className="text-right font-mono text-xs">{h.rerank_score?.toFixed(3) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {timings.length > 0 && (
              <Card title="Where the time went">
                <ul className="grid gap-2.5">
                  {timings.map((t) => (
                    <li key={t.k} className="grid grid-cols-[120px_minmax(0,1fr)_70px] items-center gap-3 text-[0.8125rem]">
                      <span className="text-ink-muted">{t.label}</span>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(2, (t.v / Math.max(total, 1)) * 100)}%` }} />
                      </div>
                      <span className="text-right font-mono text-xs tabular-nums text-ink">{formatMs(t.v)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

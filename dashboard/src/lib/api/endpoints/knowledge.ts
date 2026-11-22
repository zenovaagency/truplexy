import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, hasCode, type Scope } from '@/lib/api/client';
import type { DocMetadata, DocumentList, DocumentStatus, KnowledgeDocument, KnowledgeReview, KnowledgeSite, KnowledgeSiteDetail, KnowledgeSuggestion, SearchFilters, SearchResult, SiteProgress, SiteRefresh, UploadRegistration, Workspace } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

export interface DocumentQuery {
  q?: string;
  status?: DocumentStatus;
}

export function useDocuments(params: DocumentQuery) {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: qk.bot(scope, 'documents', params),
    queryFn: ({ pageParam, signal }) =>
      api<DocumentList>('/knowledge/documents', { scope, signal, query: { ...params, limit: 50, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
    // Documents still indexing in the background (daily job) show up on refetch.
    refetchInterval: (q) => (q.state.data?.pages.some((p) => p.data.some((d) => d.status === 'processing')) ? 10_000 : false),
  });
}

export function useDocument(id: string | null) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'document', id),
    queryFn: ({ signal }) => api<KnowledgeDocument>(`/knowledge/documents/${id}`, { scope, signal }),
    enabled: Boolean(id),
  });
}

export type ArticleInput = { title: string; content: string; source_name?: string } & DocMetadata;

export function useCreateArticle() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ArticleInput) => api<KnowledgeDocument>('/knowledge/documents', { method: 'POST', body, scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'documents') }),
    meta: { silentCodes: ['DUPLICATE_DOCUMENT'] },
  });
}

export function useUpdateDocument() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<ArticleInput> }) =>
      api<KnowledgeDocument>(`/knowledge/documents/${id}`, { method: 'PUT', body, scope }),
    onSuccess: (doc) => {
      qc.setQueryData(qk.bot(scope, 'document', doc.id), doc);
      qc.invalidateQueries({ queryKey: qk.bot(scope, 'documents') });
    },
    meta: { silentCodes: ['DUPLICATE_DOCUMENT'] },
  });
}

export function useDeleteDocument() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/knowledge/documents/${id}`, { method: 'DELETE', scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'documents') }),
    meta: { success: 'Document deleted' },
  });
}

export const processDocument = (scope: Scope, id: string, signal?: AbortSignal) =>
  api<KnowledgeDocument>(`/knowledge/documents/${id}/process`, { method: 'POST', scope, signal });

export const reindexDocument = (scope: Scope, id: string, opts: { extract?: boolean; force?: boolean }) =>
  api<KnowledgeDocument>(`/knowledge/documents/${id}/reindex`, {
    method: 'POST',
    scope,
    query: { extract: opts.extract || undefined, force: opts.force || undefined },
  });

export type UploadBody = { filename: string; size: number; sha256: string };

/** With `replace_existing`, a file named like one already uploaded replaces it. */
export const registerUpload = (scope: Scope, body: UploadBody & { title?: string; replace_existing?: boolean } & DocMetadata) =>
  api<UploadRegistration>('/knowledge/uploads', { method: 'POST', body, scope });

/** Registers a new version of an uploaded file; it is read on the next /process. */
export const registerReplace = (scope: Scope, id: string, body: UploadBody) =>
  api<UploadRegistration>(`/knowledge/documents/${id}/replace`, { method: 'POST', body, scope });

/** The uploaded file with this name, ignoring case, if there is one. */
export const findDocumentByName = async (scope: Scope, name: string) =>
  (await api<DocumentList>('/knowledge/documents', { scope, query: { source_name: name, limit: 1 } })).data[0];

/**
 * Indexes a document to completion: repeats /process while it is
 * processing, pausing when two calls in a row show no progress.
 */
export async function processUntilDone(
  scope: Scope,
  id: string,
  onProgress?: (doc: KnowledgeDocument) => void,
  signal?: AbortSignal,
) {
  let stalls = 0;
  let last = -1;
  for (;;) {
    const doc = await processDocument(scope, id, signal);
    onProgress?.(doc);
    if (doc.status !== 'processing') return doc;
    stalls = doc.embedded_count === last ? stalls + 1 : 0;
    last = doc.embedded_count;
    if (stalls >= 2) await new Promise((r) => setTimeout(r, 2500));
  }
}

export function useSearchKnowledge() {
  const scope = useScope();
  return useMutation({
    mutationFn: (body: { query: string; top_k?: number; filters?: SearchFilters }) =>
      api<SearchResult>('/knowledge/search', { method: 'POST', body, scope }),
  });
}

/* Suggestions learned from closed tickets (v2) ---------------------------- */

export function useKnowledgeSuggestions(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'kb-suggestions'),
    queryFn: ({ signal }) => api<{ data: KnowledgeSuggestion[] }>('/knowledge/suggestions', { scope, signal }),
    select: (r) => r.data,
    enabled,
    // New ones arrive from a job every few minutes.
    refetchInterval: 120_000,
  });
}

/** Adds a suggestion to the knowledge base, with the person's edits, and indexes it to completion. */
export function useAcceptSuggestion() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title, content }: { id: string; title: string; content: string }) => {
      const r = await api<{ suggestion: KnowledgeSuggestion; document: KnowledgeDocument }>(`/knowledge/suggestions/${id}/accept`, {
        method: 'POST',
        body: { title, content },
        scope,
      });
      return r.document.status === 'processing' ? await processUntilDone(scope, r.document.id) : r.document;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.bot(scope, 'kb-suggestions') });
      qc.invalidateQueries({ queryKey: qk.bot(scope, 'documents') });
    },
    meta: { silentCodes: ['DUPLICATE_DOCUMENT'] },
  });
}

export function useDismissSuggestion() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/knowledge/suggestions/${id}/dismiss`, { method: 'POST', scope }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'kb-suggestions') }),
  });
}

/**
 * Turns learning from closed tickets on or off for the bot and saves it. Only that setting
 * changes, so when a teammate saved first it is applied once more on their version.
 */
export function useLearnFromTickets() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (on: boolean) => {
      const attempt = async (fresh: boolean) => {
        const load = { queryKey: qk.bot(scope, 'workspace'), queryFn: ({ signal }: { signal: AbortSignal }) => api<Workspace>('/workspace', { scope, signal }) };
        const ws = fresh ? await qc.fetchQuery({ ...load, staleTime: 0 }) : await qc.ensureQueryData(load);
        const bot = { ...ws.bot, knowledge: { ...ws.bot.knowledge, learnFromTickets: on } };
        return api<Workspace>('/workspace', { method: 'PUT', body: { name: ws.name, bot, revision: ws.revision }, scope });
      };
      try {
        return await attempt(false);
      } catch (e) {
        if (!hasCode(e, 'WORKSPACE_CONFLICT')) throw e;
        return attempt(true);
      }
    },
    onSuccess: (ws) => qc.setQueryData(qk.bot(scope, 'workspace'), ws),
    meta: { success: 'Saved' },
  });
}

/** Drafts a ticket's suggestion now, whether or not the bot learns on its own (the ticket's Train bot button). Billed like a reply. */
export function useLearnFromTicket() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => api<KnowledgeSuggestion>(`/tickets/${ticketId}/learn`, { method: 'POST', scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'kb-suggestions') }),
    // The ticket explains these itself.
    meta: { silentCodes: ['NOTHING_TO_LEARN', 'SUGGESTION_HANDLED', 'ALREADY_COVERED'] },
  });
}

/* Review of the closed-ticket backlog (v2) -------------------------------- */

/** Where the bot's review of its closed tickets stands. */
export function useKnowledgeReview(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'kb-review'),
    queryFn: ({ signal }) => api<KnowledgeReview>('/knowledge/suggestions/review', { scope, signal }),
    enabled,
    // A job reads the queued tickets a few at a time, so look again soon while any wait.
    refetchInterval: (query) => (query.state.data && query.state.data.queued > 0 ? 15_000 : 120_000),
  });
}

/** Queues the closed tickets a person answered that were never read, to be drafted into suggestions. Billed like a reply each. */
export function useReviewClosedTickets() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limit?: number) =>
      api<{ queued: number; unreviewed_left: number }>('/knowledge/suggestions/review', { method: 'POST', body: limit ? { limit } : {}, scope }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.bot(scope, 'kb-review') });
      qc.invalidateQueries({ queryKey: qk.bot(scope, 'kb-suggestions') });
    },
    // The card says so itself.
    meta: { silentCodes: ['NOTHING_TO_REVIEW'] },
  });
}

/* Websites the bot learns from (v2) --------------------------------------- */

/** A site whose work (mapping, importing, syncing, deleting) runs in steps. */
export const siteWorking = (s: Pick<KnowledgeSite, 'status'>) => s.status === 'mapping' || s.status === 'syncing' || s.status === 'deleting';

export function useSites(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'sites'),
    queryFn: ({ signal }) => api<{ data: KnowledgeSite[] }>('/knowledge/sites', { scope, signal }),
    select: (r) => r.data,
    enabled,
    // The scheduled job carries on work no one is watching, and starts syncs that are due.
    refetchInterval: (q) => (q.state.data?.data.some(siteWorking) ? 15_000 : 300_000),
  });
}

export function useSite(id: string | null) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'site', id),
    queryFn: ({ signal }) => api<KnowledgeSiteDetail>(`/knowledge/sites/${id}`, { scope, signal }),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data && siteWorking(q.state.data) ? 8_000 : false),
  });
}

/** Puts a site's new state in the list and its detail, keeping the detail's pages until it is fetched again. */
function storeSite(qc: QueryClient, scope: Scope, site: KnowledgeSite | KnowledgeSiteDetail) {
  qc.setQueryData<{ data: KnowledgeSite[] }>(qk.bot(scope, 'sites'), (old) => {
    if (!old) return old;
    const { pages: _p, capacity: _c, ...summary } = site as KnowledgeSiteDetail;
    return { data: old.data.some((s) => s.id === site.id) ? old.data.map((s) => (s.id === site.id ? summary : s)) : [...old.data, summary] };
  });
  qc.setQueryData<KnowledgeSiteDetail>(qk.bot(scope, 'site', site.id), (old) => ('pages' in site ? site : old ? { ...old, ...site } : old));
}

export function useCreateSite() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api<KnowledgeSite>('/knowledge/sites', { method: 'POST', body: { url }, scope }),
    onSuccess: (site) => storeSite(qc, scope, site),
    // The dialog shows why the address was refused.
    meta: { silentCodes: ['INVALID_REQUEST'] },
  });
}

export type SiteUpdate = { refresh?: SiteRefresh; auto_add_new?: boolean; select?: string[]; unselect?: string[]; add?: string[] };

export function useUpdateSite() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SiteUpdate }) => api<KnowledgeSiteDetail>(`/knowledge/sites/${id}`, { method: 'PUT', body, scope }),
    onSuccess: (site) => storeSite(qc, scope, site),
  });
}

export function useImportSite() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<KnowledgeSite>(`/knowledge/sites/${id}/import`, { method: 'POST', scope }),
    onSuccess: (site) => storeSite(qc, scope, site),
  });
}

export function useSyncSite() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<KnowledgeSite>(`/knowledge/sites/${id}/sync`, { method: 'POST', scope }),
    onSuccess: (site) => storeSite(qc, scope, site),
    meta: { success: 'Sync started' },
  });
}

export function useDeleteSite() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<KnowledgeSite>(`/knowledge/sites/${id}`, { method: 'DELETE', scope }),
    onSuccess: (site) => storeSite(qc, scope, site),
    meta: { success: 'Removing the website and its pages' },
  });
}

export const stepSite = (scope: Scope, id: string, signal?: AbortSignal) =>
  api<SiteProgress>(`/knowledge/sites/${id}/step`, { method: 'POST', scope, signal });

/**
 * Works on a site until nothing is left: repeats /step while it reports more work, pausing when two calls in a row
 * show no progress (another request, such as the scheduled job, holds it). Returns null once a deleted site is gone.
 */
export async function stepUntilDone(scope: Scope, id: string, onProgress?: (site: KnowledgeSite) => void, signal?: AbortSignal) {
  let stalls = 0;
  let last = '';
  for (;;) {
    let r: SiteProgress;
    try {
      r = await stepSite(scope, id, signal);
    } catch (e) {
      if (hasCode(e, 'SITE_NOT_FOUND')) return null;
      throw e;
    }
    onProgress?.(r.site);
    // A deleted site answers its last step with status deleting and nothing remaining.
    if (!r.remaining) return r.site.status === 'deleting' ? null : r.site;
    const c = r.site.counts;
    const mark = `${r.site.status}/${r.site.phase}/${c.total}/${c.pending}/${c.indexed}/${c.failed}`;
    stalls = mark === last ? stalls + 1 : 0;
    last = mark;
    if (stalls >= 2) await new Promise((res) => setTimeout(res, 4000));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  }
}

/**
 * Step loops running in this tab, with how many views want each, so two views of one site share one loop and the
 * loop stops when the last view goes (and restarts if a view comes straight back, as React's StrictMode does).
 */
const driving = new Map<string, { views: number; ctrl: AbortController }>();

/**
 * While a view shows a working site, drives its work with the step loop and keeps the list, the site and the
 * documents current. The scheduled job carries on when no view is open.
 */
export function useDriveSite(site: Pick<KnowledgeSite, 'id' | 'status'> | undefined, canWrite: boolean) {
  const scope = useScope();
  const qc = useQueryClient();
  const id = site?.id;
  const working = Boolean(site && siteWorking(site));
  useEffect(() => {
    if (!id || !working || !canWrite) return;
    const key = `${scope.tenant}/${scope.bot}/${id}`;
    const running = driving.get(key);
    if (running) {
      running.views++;
    } else {
      const entry = { views: 1, ctrl: new AbortController() };
      driving.set(key, entry);
      let indexed = -1;
      stepUntilDone(
        scope,
        id,
        (s) => {
          storeSite(qc, scope, s);
          // New documents show in the Documents tab as pages are indexed.
          if (s.counts.indexed !== indexed) {
            indexed = s.counts.indexed;
            qc.invalidateQueries({ queryKey: qk.bot(scope, 'documents') });
          }
        },
        entry.ctrl.signal,
      )
        .then((s) => {
          if (s === null) {
            qc.setQueryData<{ data: KnowledgeSite[] }>(qk.bot(scope, 'sites'), (old) => (old ? { data: old.data.filter((x) => x.id !== id) } : old));
            qc.removeQueries({ queryKey: qk.bot(scope, 'site', id) });
          }
        })
        .catch(() => {
          /* Stopped or failed: the scheduled job carries on, and the views refetch. */
        })
        .finally(() => {
          if (driving.get(key) === entry) driving.delete(key);
          if (!entry.ctrl.signal.aborted) {
            qc.invalidateQueries({ queryKey: qk.bot(scope, 'site', id) });
            qc.invalidateQueries({ queryKey: qk.bot(scope, 'sites') });
            qc.invalidateQueries({ queryKey: qk.bot(scope, 'documents') });
          }
        });
    }
    return () => {
      const entry = driving.get(key);
      if (!entry || --entry.views > 0) return;
      driving.delete(key);
      entry.ctrl.abort();
    };
  }, [id, working, canWrite, scope, qc]);
}

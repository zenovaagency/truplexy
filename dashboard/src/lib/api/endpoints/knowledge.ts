import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, hasCode, type Scope } from '@/lib/api/client';
import type { DocMetadata, DocumentList, DocumentStatus, KnowledgeDocument, KnowledgeSuggestion, SearchFilters, SearchResult, UploadRegistration, Workspace } from '@/lib/api/types';
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

export const registerUpload = (scope: Scope, body: { filename: string; size: number; sha256: string; title?: string } & DocMetadata) =>
  api<UploadRegistration>('/knowledge/uploads', { method: 'POST', body, scope });

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

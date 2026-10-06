import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Scope } from '@/lib/api/client';
import type { DocMetadata, DocumentList, DocumentStatus, KnowledgeDocument, SearchFilters, SearchResult, UploadRegistration } from '@/lib/api/types';
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

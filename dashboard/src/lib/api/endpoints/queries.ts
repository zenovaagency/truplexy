import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { CustomerQuery, QueryEvent, QueryInput, QueryList, QueryType, QueryTypeInput, QueryTypePreset } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

/* Queries and their types. Scope headers are required; these act on the bot. */

export interface QueryFilter {
  type?: string;
  status?: string;
  /** open, pending, done, or active (not done). */
  category?: string;
  customer?: string;
  conversation?: string;
  /** A user ID, "me" or "none". */
  assignee?: string;
  q?: string;
}

export function useQueryTypes(opts: { archived?: boolean; enabled?: boolean } = {}) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'queries', 'types', Boolean(opts.archived)),
    queryFn: ({ signal }) => api<{ data: QueryType[] }>('/query-types', { scope, signal, query: { archived: opts.archived || undefined } }).then((r) => r.data),
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useQueryTypePresets(businessType: string | undefined, enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'queries', 'presets', businessType ?? ''),
    queryFn: ({ signal }) => api<{ data: QueryTypePreset[] }>('/query-types/presets', { scope, signal, query: { business_type: businessType || undefined } }).then((r) => r.data),
    enabled,
    staleTime: Infinity,
  });
}

function useInvalidateQueries() {
  const scope = useScope();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'queries') });
}

export function useCreateQueryType() {
  const scope = useScope();
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: (body: QueryTypeInput) => api<QueryType>('/query-types', { method: 'POST', body, scope }),
    onSuccess: invalidate,
  });
}

export function useUpdateQueryType() {
  const scope = useScope();
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: QueryTypeInput }) => api<QueryType>(`/query-types/${id}`, { method: 'PATCH', body: patch, scope }),
    onSuccess: invalidate,
    meta: { success: 'Query type saved' },
  });
}

export function useDeleteQueryType() {
  const scope = useScope();
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/query-types/${id}`, { method: 'DELETE', scope }),
    onSuccess: invalidate,
    meta: { success: 'Query type deleted' },
  });
}

export function useQueries(f: QueryFilter, enabled = true) {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: qk.bot(scope, 'queries', 'list', f),
    queryFn: ({ pageParam, signal }) =>
      api<QueryList>('/queries', {
        scope,
        signal,
        query: { limit: 50, type: f.type, status: f.status, category: f.category, customer: f.customer, conversation: f.conversation, assignee: f.assignee, q: f.q || undefined, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
    placeholderData: (prev) => prev,
    enabled,
    refetchInterval: 120_000,
  });
}

export function useCustomerQuery(id: string | undefined) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'queries', 'detail', id),
    queryFn: ({ signal }) => api<CustomerQuery>(`/queries/${id}`, { scope, signal }),
    enabled: Boolean(id),
  });
}

export function useQueryEvents(id: string | undefined) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'queries', 'events', id),
    queryFn: ({ signal }) => api<{ data: QueryEvent[] }>(`/queries/${id}/events`, { scope, signal }).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function useCreateQuery() {
  const scope = useScope();
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: (body: QueryInput) => api<CustomerQuery>('/queries', { method: 'POST', body, scope }),
    onSuccess: invalidate,
    meta: { success: 'Query opened' },
  });
}

export function useUpdateQuery() {
  const scope = useScope();
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: QueryInput }) => api<CustomerQuery>(`/queries/${id}`, { method: 'PATCH', body: patch, scope }),
    onSuccess: invalidate,
  });
}

export function useDeleteQuery() {
  const scope = useScope();
  const invalidate = useInvalidateQueries();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/queries/${id}`, { method: 'DELETE', scope }),
    onSuccess: invalidate,
    meta: { success: 'Query deleted' },
  });
}

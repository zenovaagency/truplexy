import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Handoff, Ticket, TicketDetail, TicketList, TicketPatch, TicketPriority, TicketQuery, TicketReply, TicketStatus } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

/** Live updates invalidate these; the slow poll catches anything missed. */
const POLL_MS = 120_000;

export function useTickets(params: TicketQuery) {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: qk.bot(scope, 'tickets', 'list', params),
    queryFn: ({ pageParam, signal }) =>
      api<TicketList>('/tickets', { scope, signal, query: { limit: 50, ...params, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
  });
}

/** Ticket counts for the sidebar badge: the cheapest list call. */
export function useTicketCounts(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'tickets', 'counts'),
    queryFn: ({ signal }) => api<TicketList>('/tickets', { scope, signal, query: { limit: 1 } }).then((r) => r.counts),
    refetchInterval: POLL_MS,
    enabled,
    meta: { silent: true },
  });
}

export function useRecentTickets(limit = 6) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'tickets', 'recent', limit),
    queryFn: ({ signal }) => api<TicketList>('/tickets', { scope, signal, query: { limit } }).then((r) => r.data),
  });
}

export function useTicket(id: string | undefined) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'tickets', 'detail', id),
    queryFn: ({ signal }) => api<TicketDetail>(`/tickets/${id}`, { scope, signal }),
    enabled: Boolean(id),
    refetchInterval: POLL_MS,
  });
}

export function usePrefetchTicket() {
  const scope = useScope();
  const qc = useQueryClient();
  return (id: string) =>
    qc.prefetchQuery({
      queryKey: qk.bot(scope, 'tickets', 'detail', id),
      queryFn: ({ signal }) => api<TicketDetail>(`/tickets/${id}`, { scope, signal }),
      staleTime: 15_000,
    });
}

/** Puts a changed ticket into every cached list page and its detail. */
function useApplyTicket() {
  const scope = useScope();
  const qc = useQueryClient();
  return (t: Ticket) => {
    qc.setQueriesData<InfiniteData<TicketList>>({ queryKey: qk.bot(scope, 'tickets', 'list') }, (data) =>
      data ? { ...data, pages: data.pages.map((p) => ({ ...p, data: p.data.map((x) => (x.id === t.id ? { ...x, ...t } : x)) })) } : data,
    );
    qc.setQueryData<TicketDetail>(qk.bot(scope, 'tickets', 'detail', t.id), (d) => (d ? { ...d, ...t } : d));
  };
}

export function useUpdateTicket() {
  const scope = useScope();
  const qc = useQueryClient();
  const apply = useApplyTicket();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TicketPatch }) =>
      api<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: patch, scope }),
    onSuccess: (t) => {
      apply(t);
      qc.invalidateQueries({ queryKey: qk.bot(scope, 'tickets') });
    },
  });
}

export function useCreateTicket() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { subject?: string; conversation_id?: string; priority?: TicketPriority; escalated?: boolean }) =>
      api<Ticket>('/tickets', { method: 'POST', body, scope }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bot(scope, 'tickets') });
      qc.invalidateQueries({ queryKey: qk.bot(scope, 'handoffs') });
    },
  });
}

export function useDeleteTicket() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tickets/${id}`, { method: 'DELETE', scope }),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: qk.bot(scope, 'tickets', 'detail', id) });
      qc.invalidateQueries({ queryKey: qk.bot(scope, 'tickets') });
    },
    meta: { success: 'Ticket deleted' },
  });
}

export function useReplyToTicket() {
  const scope = useScope();
  const qc = useQueryClient();
  const apply = useApplyTicket();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; content: string; kind: 'reply' | 'note'; status?: TicketStatus }) =>
      api<{ reply: TicketReply; ticket: Ticket }>(`/tickets/${id}/replies`, { method: 'POST', body, scope }),
    onSuccess: ({ ticket }) => {
      apply(ticket);
      qc.invalidateQueries({ queryKey: qk.bot(scope, 'tickets') });
    },
  });
}

export function useHandoffs() {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'handoffs'),
    queryFn: ({ signal }) => api<{ data: Handoff[] }>('/handoffs', { scope, signal }).then((r) => r.data),
    refetchInterval: POLL_MS,
  });
}

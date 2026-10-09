import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Customer, CustomerDetail, CustomerInput, CustomerList } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

/* The bot's customers. Scope headers are required; these act on the bot. */

export function useCustomers(q: string | undefined) {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: qk.bot(scope, 'customers', 'list', q ?? ''),
    queryFn: ({ pageParam, signal }) => api<CustomerList>('/customers', { scope, signal, query: { limit: 50, q: q || undefined, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
    placeholderData: (prev) => prev,
  });
}

/** A customer with their latest conversations and tickets. `enabled` follows the permission. */
export function useCustomer(id: string | undefined, enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'customers', 'detail', id),
    queryFn: ({ signal }) => api<CustomerDetail>(`/customers/${id}`, { scope, signal }),
    enabled: Boolean(id) && enabled,
    staleTime: 30_000,
    // A deleted customer stays on its tickets by ID; don't toast for it.
    meta: { silent: true },
  });
}

function useInvalidateCustomers() {
  const scope = useScope();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'customers') });
}

export function useCreateCustomer() {
  const scope = useScope();
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (body: CustomerInput) => api<Customer>('/customers', { method: 'POST', body, scope }),
    onSuccess: invalidate,
    meta: { success: 'Customer added' },
  });
}

export function useUpdateCustomer() {
  const scope = useScope();
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CustomerInput }) => api<Customer>(`/customers/${id}`, { method: 'PATCH', body: patch, scope }),
    onSuccess: invalidate,
    meta: { success: 'Customer saved' },
  });
}

export function useDeleteCustomer() {
  const scope = useScope();
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/customers/${id}`, { method: 'DELETE', scope }),
    onSuccess: invalidate,
    meta: { success: 'Customer deleted. Their tickets keep working.' },
  });
}

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AddonQuote, Billing, BillingAddon, LedgerEntry } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

/* Balance and extra tokens. Scope headers are required, but these act on the business. */

export function useBilling(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.tenant(scope, 'billing'),
    queryFn: ({ signal }) => api<Billing>('/billing', { scope, signal }),
    staleTime: 30_000,
    enabled,
  });
}

export function useBillingLedger(enabled = true) {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: qk.tenant(scope, 'billing', 'ledger'),
    queryFn: ({ pageParam, signal }) =>
      api<{ data: LedgerEntry[]; next_before?: string }>('/billing/ledger', { scope, signal, query: { before: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_before,
    enabled,
  });
}

/** The price of a slider position. Pass a debounced value. */
export function useAddonQuote(millions: number | null) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.tenant(scope, 'billing', 'quote', millions),
    queryFn: ({ signal }) => api<AddonQuote>('/billing/token-addons/quote', { scope, signal, query: { millions } }),
    enabled: millions != null && millions > 0,
    placeholderData: (prev) => prev,
    staleTime: 5 * 60_000,
  });
}

export function useBuyTokens() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (millions: number) =>
      api<{ addon: BillingAddon; billing: Billing }>('/billing/token-addons', { method: 'POST', body: { millions }, scope }),
    onSuccess: (r) => {
      qc.setQueryData(qk.tenant(scope, 'billing'), r.billing);
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'billing', 'ledger') });
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'business') });
    },
    meta: { success: 'Extra tokens added for this month' },
  });
}

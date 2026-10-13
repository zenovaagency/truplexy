import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AddonQuote, Billing, BillingAddon, BillingInterval, CheckoutPlan, LedgerEntry, Subscription } from '@/lib/api/types';
import { openCheckout } from '@/lib/paddle';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

/* The plan subscription, paid through Paddle. The plan on the business changes when Paddle's webhook reaches the API. */

export function useSubscription(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.tenant(scope, 'billing', 'subscription'),
    queryFn: ({ signal }) => api<{ subscription: Subscription | null }>('/billing/subscription', { scope, signal }).then((r) => r.subscription),
    staleTime: 30_000,
    enabled,
  });
}

/** Re-reads everything a plan change touches. */
function useRefreshPlan() {
  const scope = useScope();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.tenant(scope, 'business') });
    void qc.invalidateQueries({ queryKey: qk.tenant(scope, 'billing') });
    void qc.invalidateQueries({ queryKey: qk.me });
  };
}

/**
 * Asks the API for a Paddle transaction, then opens the checkout overlay. The
 * API sets the plan from Paddle's webhook, so after the overlay reports success
 * the data is re-read a few times until it arrives.
 */
export function useStartCheckout() {
  const scope = useScope();
  const refresh = useRefreshPlan();
  return useMutation({
    mutationFn: async (v: { plan: CheckoutPlan; interval: BillingInterval }) => {
      const { transaction_id } = await api<{ transaction_id: string }>('/billing/checkout', { method: 'POST', body: v, scope });
      const opened = await openCheckout(transaction_id, {
        onCompleted: () => {
          refresh();
          // The webhook usually lands within seconds.
          for (const ms of [2_000, 5_000, 12_000]) setTimeout(refresh, ms);
        },
      });
      if (!opened) throw new Error('The payment window could not load. Turn off any ad blocker for this site and try again.');
    },
  });
}

/** Moves an existing subscription to another plan or interval. The API prorates through Paddle. */
export function useChangePlan() {
  const scope = useScope();
  const refresh = useRefreshPlan();
  return useMutation({
    mutationFn: (v: { plan: CheckoutPlan; interval: BillingInterval }) =>
      api<{ subscription: Subscription }>('/billing/subscription/change', { method: 'POST', body: v, scope }),
    onSuccess: () => {
      refresh();
      for (const ms of [2_000, 5_000]) setTimeout(refresh, ms);
    },
    meta: { success: 'Plan change requested' },
  });
}

/** Opens Paddle's customer portal (card, invoices, cancel). */
export function useBillingPortal() {
  const scope = useScope();
  return useMutation({
    mutationFn: async () => {
      const { url } = await api<{ url: string }>('/billing/portal', { method: 'POST', scope });
      window.location.assign(url);
    },
  });
}

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

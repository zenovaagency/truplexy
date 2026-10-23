import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, hasCode, type Scope } from '@/lib/api/client';
import type { AddonQuote, Billing, BillingAddon, BillingInterval, CheckoutPlan, LedgerEntry, Subscription } from '@/lib/api/types';
import { outcomeUnknown, purchaseKey, releasePurchaseKey } from '@/lib/idempotency';
import { openCheckout } from '@/lib/paddle';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* The plan subscription, paid through Paddle. The plan on the business changes when Paddle's webhook reaches the API. */

/** What GET /billing/subscription answers: the subscription, and whether a checkout now would get the free trial. */
interface SubscriptionState {
  subscription: Subscription | null;
  /** Absent from an API that predates it; read with trialEligible(). */
  trial_eligible?: boolean;
}

/** A trial is promised unless the API says there isn't one to give. */
export const trialEligible = (state: SubscriptionState | undefined) => state?.trial_eligible !== false;

function useSubscriptionState<T>(select: (state: SubscriptionState) => T, enabled: boolean) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.tenant(scope, 'billing', 'subscription'),
    queryFn: ({ signal }) => api<SubscriptionState>('/billing/subscription', { scope, signal }),
    select,
    staleTime: 30_000,
    enabled,
  });
}

export function useSubscription(enabled = true) {
  return useSubscriptionState((state) => state.subscription, enabled);
}

/** Whether to say "free trial": false once the business or the person has had one and the API enforces that. */
export function useTrialEligible(enabled = true) {
  return useSubscriptionState(trialEligible, enabled);
}

/** Re-reads everything a plan change touches. */
export function useRefreshPlan() {
  const scope = useScope();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.tenant(scope, 'business') });
    void qc.invalidateQueries({ queryKey: qk.tenant(scope, 'billing') });
    void qc.invalidateQueries({ queryKey: qk.me });
  };
}

/**
 * Asks the API for a Paddle transaction, then sends the customer to the
 * checkout page for it (see lib/paddle.ts). The API sets the plan from Paddle's
 * webhook; when the customer returns to /settings/plan?paid=1 the data is
 * re-read a few times until it arrives (see SubscriptionCard).
 */
export function useStartCheckout() {
  const scope = useScope();
  const refresh = useRefreshPlan();
  return useMutation({
    mutationFn: async (v: { plan: CheckoutPlan; interval: BillingInterval }) => {
      const create = () => api<{ transaction_id: string }>('/billing/checkout', { method: 'POST', body: v, scope });
      // Another request (a double click, a second tab) may be setting the
      // checkout up; the API answers CHECKOUT_IN_PROGRESS and shares it once it is.
      const { transaction_id } = await create().catch(async (e: unknown) => {
        if (!hasCode(e, 'CHECKOUT_IN_PROGRESS')) throw e;
        await sleep(Math.min((e as { retryAfter?: number }).retryAfter ?? 3, 10) * 1000);
        return create();
      });
      openCheckout(transaction_id, {
        // Only the mock API gets here without leaving the page.
        onCompleted: () => {
          refresh();
          for (const ms of [2_000, 5_000, 12_000]) setTimeout(refresh, ms);
        },
      });
    },
    // The business already has a subscription (another tab started it): show it.
    onError: (e) => {
      if (hasCode(e, 'SUBSCRIPTION_EXISTS')) refresh();
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

/**
 * Buys extra tokens from the balance. The purchase carries an Idempotency-Key,
 * so a request repeated after a timeout (or a second click while the first is
 * still running) is made once; see lib/idempotency.ts for when the key is kept.
 */
export async function buyTokens(scope: Scope, millions: number) {
  const intent = `${scope.tenant}:${scope.bot}:${millions}`;
  try {
    const done = await api<{ addon: BillingAddon; billing?: Billing }>('/billing/token-addons', {
      method: 'POST',
      body: { millions },
      scope,
      headers: { 'Idempotency-Key': purchaseKey(intent) },
    });
    releasePurchaseKey(intent);
    return done;
  } catch (e) {
    if (!outcomeUnknown(e)) releasePurchaseKey(intent);
    throw e;
  }
}

export function useBuyTokens() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (millions: number) => buyTokens(scope, millions),
    onSuccess: (r) => {
      // The API leaves the summary out if it couldn't read it after the purchase.
      if (r.billing) qc.setQueryData(qk.tenant(scope, 'billing'), r.billing);
      else qc.invalidateQueries({ queryKey: qk.tenant(scope, 'billing') });
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'billing', 'ledger') });
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'business') });
    },
    meta: { success: 'Extra tokens added for this month' },
  });
}

import { env } from '@/lib/env';

/**
 * Checkout does not open here. Paddle only opens checkouts on domains it has
 * approved, and the dashboard (a sign-in-only app) is not one of them, so the
 * customer is sent to the site's /pay page, which loads Paddle.js and opens the
 * transaction. The API creates the transaction (it owns the price IDs and ties
 * the checkout to the business). When the customer finishes, /pay sends them
 * back to /settings/plan?paid=1. The plan itself changes when Paddle's webhook
 * reaches the API, so the return can land a moment before the plan does.
 */

export interface CheckoutHandlers {
  /** Only the mock API calls this: it starts the trial itself. */
  onCompleted?: () => void;
}

/** The page on the approved domain that opens the checkout for a transaction. */
export const checkoutUrl = (transactionId: string) => `${env.payUrl}?_ptxn=${encodeURIComponent(transactionId)}`;

/** Sends the customer to Paddle's checkout for a transaction the API created. */
export function openCheckout(transactionId: string, { onCompleted }: CheckoutHandlers = {}) {
  // The mock API starts the trial itself, so there is nothing to pay for.
  if (env.useMocks) {
    onCompleted?.();
    return;
  }
  window.location.assign(checkoutUrl(transactionId));
}

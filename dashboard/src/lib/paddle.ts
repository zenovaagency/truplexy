import { initializePaddle, type Paddle, type PaddleEventData } from '@paddle/paddle-js';
import { env } from '@/lib/env';

/**
 * Paddle.js, loaded on first use. The API creates the transaction (it owns the
 * price IDs and ties the checkout to the business); this only opens it.
 * The plan itself changes when Paddle's webhook reaches the API, so a finished
 * checkout can land a moment before the plan does.
 */

export const paddleConfigured = env.useMocks || Boolean(env.paddleToken);

let loading: Promise<Paddle | undefined> | null = null;
const listeners = new Set<(e: PaddleEventData) => void>();

function load() {
  loading ??= initializePaddle({
    environment: env.paddleEnv,
    token: env.paddleToken,
    eventCallback: (e) => listeners.forEach((fn) => fn(e)),
  }).catch(() => {
    loading = null; // blocked by an ad blocker or offline: let the next click try again
    return undefined;
  });
  return loading;
}

export interface CheckoutHandlers {
  /** Payment (or card capture for a trial) went through. */
  onCompleted?: () => void;
  /** The overlay was closed without paying. */
  onClosed?: () => void;
}

/** Opens Paddle's overlay for a transaction the API created. Resolves false if Paddle.js could not load. */
export async function openCheckout(transactionId: string, { onCompleted, onClosed }: CheckoutHandlers = {}): Promise<boolean> {
  // The mock API starts the trial itself, so there is nothing to pay for.
  if (env.useMocks) {
    onCompleted?.();
    return true;
  }
  const paddle = await load();
  if (!paddle) return false;

  let completed = false;
  const listener = (e: PaddleEventData) => {
    if (e.name === 'checkout.completed') {
      completed = true;
      onCompleted?.();
    } else if (e.name === 'checkout.closed') {
      listeners.delete(listener);
      if (!completed) onClosed?.();
    }
  };
  listeners.add(listener);

  paddle.Checkout.open({
    transactionId,
    settings: { displayMode: 'overlay', theme: 'light', variant: 'one-page' },
  });
  return true;
}

import { isApiError } from '@/lib/api/client';

/**
 * Idempotency keys for purchases. A purchase sent again with the same key is
 * made once, so a click retried after a timeout can't charge twice. The key
 * belongs to one intent (this business buying this amount): it is reused while
 * the outcome is unknown, and dropped once the purchase is settled, so the next
 * click is a new purchase.
 */
const keys = new Map<string, string>();

function newKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The key to send for an intent, made on first use. */
export function purchaseKey(intent: string) {
  let key = keys.get(intent);
  if (!key) {
    key = newKey();
    keys.set(intent, key);
  }
  return key;
}

/** Forgets an intent's key: the next purchase for it is a new one. */
export function releasePurchaseKey(intent: string) {
  keys.delete(intent);
}

/**
 * Whether a failed purchase may have gone through, or may still be running, so
 * that the same key must be sent again: no answer, a server error, a limit, or
 * the API saying the first request is still being handled. A clear refusal
 * (not enough balance, off the slider) made nothing, and the API frees its key.
 */
export function outcomeUnknown(e: unknown) {
  if (!isApiError(e)) return true;
  return e.status === 0 || e.status >= 500 || e.status === 429 || e.code === 'REQUEST_IN_PROGRESS';
}

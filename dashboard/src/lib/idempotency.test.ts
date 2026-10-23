import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { outcomeUnknown, purchaseKey, releasePurchaseKey } from './idempotency';

const apiError = (status: number, code = 'X') => new ApiError({ code, message: 'm', status });

describe('purchase keys', () => {
  it('reuses a key for the same purchase until it is released', () => {
    const first = purchaseKey('acme:support:3');
    expect(first.length).toBeGreaterThan(8);
    expect(purchaseKey('acme:support:3')).toBe(first);
    releasePurchaseKey('acme:support:3');
    expect(purchaseKey('acme:support:3')).not.toBe(first);
  });

  it('gives each purchase its own key', () => {
    expect(purchaseKey('acme:support:1')).not.toBe(purchaseKey('acme:support:2'));
    expect(purchaseKey('acme:support:1')).not.toBe(purchaseKey('globex:support:1'));
  });
});

describe('outcomeUnknown', () => {
  it('keeps the key when the purchase may have gone through or may still be running', () => {
    expect(outcomeUnknown(apiError(0, 'NETWORK_ERROR'))).toBe(true);
    expect(outcomeUnknown(apiError(502))).toBe(true);
    expect(outcomeUnknown(apiError(503, 'IDEMPOTENCY_UNAVAILABLE'))).toBe(true);
    expect(outcomeUnknown(apiError(429, 'RATE_LIMITED'))).toBe(true);
    expect(outcomeUnknown(apiError(409, 'REQUEST_IN_PROGRESS'))).toBe(true);
    expect(outcomeUnknown(new TypeError('boom'))).toBe(true);
  });

  it('drops the key after a clear refusal, which made nothing', () => {
    expect(outcomeUnknown(apiError(402, 'INSUFFICIENT_BALANCE'))).toBe(false);
    expect(outcomeUnknown(apiError(400, 'INVALID_REQUEST'))).toBe(false);
    expect(outcomeUnknown(apiError(403, 'FORBIDDEN'))).toBe(false);
    expect(outcomeUnknown(apiError(422, 'IDEMPOTENCY_KEY_REUSED'))).toBe(false);
  });
});

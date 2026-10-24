import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { describeError } from './errors';

const error = (code: string, status: number, extra: { retryAfter?: number } = {}) => new ApiError({ code, message: 'API words', status, ...extra });

describe('describeError for billing', () => {
  it('says how long to wait after a rate limit', () => {
    expect(describeError(error('RATE_LIMITED', 429, { retryAfter: 12 }))).toMatchObject({ title: 'Too many requests', detail: 'Try again in 12 seconds.' });
    expect(describeError(error('RATE_LIMITED', 429, { retryAfter: 1 })).detail).toBe('Try again in 1 second.');
    expect(describeError(error('RATE_LIMITED', 429)).detail).toBe('Wait a few seconds, then try again.');
  });

  it('explains a checkout another request is setting up', () => {
    expect(describeError(error('CHECKOUT_IN_PROGRESS', 409, { retryAfter: 3 }))).toMatchObject({ title: 'Checkout is being set up', detail: 'Try again in 3 seconds.' });
  });

  it('tells a person with an unconfirmed email what to do', () => {
    const d = describeError(error('EMAIL_NOT_VERIFIED', 403));
    expect(d.title).toBe('Confirm your email address first');
    expect(d.detail).toMatch(/confirmation email/);
  });

  it('has plain words for the payment errors', () => {
    expect(describeError(error('SUBSCRIPTION_EXISTS', 409)).title).toBe('This business already has a subscription');
    expect(describeError(error('PAYMENT_PROVIDER_ERROR', 502)).detail).toMatch(/Nothing was charged/);
    expect(describeError(error('REQUEST_IN_PROGRESS', 409)).title).toBe('That request is still being handled');
  });
});

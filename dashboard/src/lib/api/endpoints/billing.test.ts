import { afterEach, describe, expect, it } from 'vitest';
import { configureApi } from '@/lib/api/client';
import { buyTokens, trialEligible } from './billing';

const scope = { tenant: 'acme', bot: 'support' };
const purchase = { addon: { id: 'tad_1', tokens: 1_000_000, price: 8, month: '2026-10', actor: 'u', created_at: '2026-10-01T00:00:00Z' } };

function serve(answers: Array<() => Response>) {
  const seen: Request[] = [];
  configureApi({
    transport: async (req) => {
      seen.push(req.clone());
      const next = answers.shift();
      if (!next) throw new Error('unexpected request');
      return next();
    },
  });
  return seen;
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const failure = (status: number, code: string, headers: Record<string, string> = {}) => () => json(status, { error: { code, message: code } }, headers);

afterEach(() => configureApi({ transport: (req) => fetch(req) }));

describe('buyTokens', () => {
  it('sends an Idempotency-Key, and the same one for a retry after the outcome was unknown', async () => {
    const seen = serve([failure(503, 'DATABASE_ERROR'), () => json(201, purchase)]);
    await expect(buyTokens(scope, 7)).rejects.toMatchObject({ status: 503 });
    const done = await buyTokens(scope, 7);
    expect(done.addon.id).toBe('tad_1');
    const [first, second] = seen.map((r) => r.headers.get('Idempotency-Key'));
    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(seen[0].headers.get('X-Truplexy-Tenant')).toBe('acme');
  });

  it('uses a new key for the next purchase once one has been made', async () => {
    const seen = serve([() => json(201, purchase), () => json(201, purchase)]);
    await buyTokens(scope, 8);
    await buyTokens(scope, 8);
    expect(seen[1].headers.get('Idempotency-Key')).not.toBe(seen[0].headers.get('Idempotency-Key'));
  });

  it('uses a new key after a clear refusal, since nothing was bought', async () => {
    const seen = serve([failure(402, 'INSUFFICIENT_BALANCE'), () => json(201, purchase)]);
    await expect(buyTokens(scope, 9)).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    await buyTokens(scope, 9);
    expect(seen[1].headers.get('Idempotency-Key')).not.toBe(seen[0].headers.get('Idempotency-Key'));
  });

  it('accepts a response without the billing summary', async () => {
    serve([() => json(201, purchase)]);
    const done = await buyTokens(scope, 10);
    expect(done.billing).toBeUndefined();
  });
});

describe('trialEligible', () => {
  it('promises a trial unless the API says there is none to give', () => {
    expect(trialEligible({ subscription: null, trial_eligible: true })).toBe(true);
    expect(trialEligible({ subscription: null, trial_eligible: false })).toBe(false);
  });

  it('promises one while the answer is unknown, or from an API that predates the field', () => {
    expect(trialEligible(undefined)).toBe(true);
    expect(trialEligible({ subscription: null })).toBe(true);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { api, configureApi, isApiError } from './client';

afterEach(() => configureApi({ transport: (req) => fetch(req) }));

describe('api', () => {
  it('sends the extra headers it is given', async () => {
    let seen: Request | undefined;
    configureApi({
      transport: async (req) => {
        seen = req;
        return new Response('{}', { status: 200 });
      },
    });
    await api('/x', { method: 'POST', body: {}, headers: { 'Idempotency-Key': 'abc' } });
    expect(seen?.headers.get('Idempotency-Key')).toBe('abc');
  });

  it('reports how long the API asks callers to wait', async () => {
    configureApi({
      transport: async () =>
        new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests.' } }), { status: 429, headers: { 'Retry-After': '12' } }),
    });
    const e = await api('/x').catch((x: unknown) => x);
    expect(isApiError(e) && e.code === 'RATE_LIMITED' && e.status === 429 && e.retryAfter === 12).toBe(true);
  });

  it('ignores a Retry-After it cannot read', async () => {
    configureApi({ transport: async () => new Response('{"error":{"code":"X","message":"m"}}', { status: 503, headers: { 'Retry-After': 'soon' } }) });
    const e = await api('/x').catch((x: unknown) => x);
    expect(isApiError(e) && e.retryAfter).toBeUndefined();
  });
});

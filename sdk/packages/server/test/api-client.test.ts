import { describe, expect, it, vi } from 'vitest';
import { createChatClient, TruplexyApiError } from '../src';

const identity = { contacts: [{ type: 'email', value: 'Ada@example.com', primary: true }, { type: 'app', value: '42', label: 'account' }], metadata: { plan: 'pro' } };
const make = (status = 200, data: unknown = { id: 'result' }) => {
  const fetch = vi.fn(async () => new Response(JSON.stringify(data), { status, headers: { 'X-Request-ID': 'req_header', 'Retry-After': '5' } }));
  return { fetch, client: createChatClient({ chatKey: 'secret', apiBase: 'https://test/v3/', fetch }) };
};

describe('chat API client', () => {
  it('uses server environment defaults per call and encodes conversation paths', async () => {
    const previousKey = process.env.TRUPLEXY_CHAT_KEY;
    const previousBase = process.env.TRUPLEXY_API_BASE;
    const { fetch } = make();
    const client = createChatClient({ fetch });
    try {
      delete process.env.TRUPLEXY_API_BASE;
      delete process.env.TRUPLEXY_CHAT_KEY;
      await expect(client.getProfile()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
      expect(fetch).not.toHaveBeenCalled();
      process.env.TRUPLEXY_CHAT_KEY = 'first';
      await client.getProfile();
      expect(fetch).toHaveBeenLastCalledWith('https://api.truplexy.com/v3/profile', expect.objectContaining({ headers: { Authorization: 'Bearer first' } }));
      process.env.TRUPLEXY_CHAT_KEY = 'second';
      process.env.TRUPLEXY_API_BASE = 'https://custom.test/v3/';
      await client.getConversation('conv/unsafe');
      expect(fetch).toHaveBeenLastCalledWith('https://custom.test/v3/conversations/conv%2Funsafe', expect.objectContaining({ headers: { Authorization: 'Bearer second' } }));
    } finally {
      if (previousKey === undefined) delete process.env.TRUPLEXY_CHAT_KEY; else process.env.TRUPLEXY_CHAT_KEY = previousKey;
      if (previousBase === undefined) delete process.env.TRUPLEXY_API_BASE; else process.env.TRUPLEXY_API_BASE = previousBase;
    }
  });

  it('sends the documented method, path, body and server credentials for every method', async () => {
    const { client: c, fetch } = make();
    const calls: [() => Promise<unknown>, string, string, unknown][] = [
      [() => c.getProfile(), 'GET', '/profile', undefined],
      [() => c.upsertCustomer(identity), 'PUT', '/customer', identity],
      [() => c.createConversation(), 'POST', '/conversations', undefined],
      [() => c.createConversation({ customer_id: 'cus_1', channel_id: 'chn_1' }), 'POST', '/conversations', { customer_id: 'cus_1', channel_id: 'chn_1' }],
      [() => c.getConversation('conv_1'), 'GET', '/conversations/conv_1', undefined],
      [() => c.sendMessage('conv_1', 'hello'), 'POST', '/conversations/conv_1/messages', { message: 'hello' }],
      [() => c.handoff('conv_1'), 'POST', '/conversations/conv_1/handoff', undefined],
      [() => c.escalate('conv_1'), 'POST', '/conversations/conv_1/escalate', undefined],
      [() => c.resume('conv_1'), 'POST', '/conversations/conv_1/resume', undefined],
      [() => c.createTicket('conv_1', { priority: 'high' }), 'POST', '/conversations/conv_1/ticket', { priority: 'high' }],
      [() => c.createTicket('conv_1', { subject: 'Order', keep_open: true }), 'POST', '/conversations/conv_1/ticket', { subject: 'Order', keep_open: true }],
      [() => c.closeTicket('conv_1'), 'POST', '/conversations/conv_1/ticket/close', undefined],
      [() => c.sendReply('conv_1', { content: 'hello', external_id: 'm1', escalate: true }), 'POST', '/conversations/conv_1/replies', { content: 'hello', external_id: 'm1', escalate: true }],
      [() => c.getRealtimeToken(), 'POST', '/realtime/token', undefined],
      [() => c.getRealtimeToken('conv_1'), 'POST', '/realtime/token', { conversation_id: 'conv_1' }],
    ];
    for (const [call, method, path, body] of calls) {
      expect(await call()).toEqual({ id: 'result' });
      expect(fetch).toHaveBeenLastCalledWith('https://test/v3' + path, {
        method, headers: { Authorization: 'Bearer secret', ...(body !== undefined && { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
  });

  it.each([200, 201])('returns customers from HTTP %i without filling omitted input fields', async status => {
    const { client, fetch } = make(status, { id: 'cus_1', ...identity });
    expect(await client.upsertCustomer(identity)).toEqual({ id: 'cus_1', ...identity });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a contact race once but never a conflict or another mutation', async () => {
    for (const code of ['CUSTOMER_EXISTS', 'CUSTOMER_CONFLICT']) {
      const { client, fetch } = make(409, { error: { code, message: 'failed' } });
      await expect(client.upsertCustomer(identity)).rejects.toMatchObject({ code, status: 409 });
      expect(fetch).toHaveBeenCalledTimes(code === 'CUSTOMER_EXISTS' ? 2 : 1);
    }
    const { client, fetch } = make(409, { error: { code: 'CUSTOMER_EXISTS' } });
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'CUSTOMER_EXISTS' } }), { status: 409 }));
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'cus_winner' })));
    expect(await client.upsertCustomer(identity)).toEqual({ id: 'cus_winner' });
  });

  it('preserves structured server errors, headers and extra fields', async () => {
    const { client } = make(429, { error: { code: 'PLAN_LIMIT_REACHED', message: 'Raw server detail', limit: 'tokens_per_month', request_id: 'req_body' } });
    await expect(client.sendMessage('c', 'hello')).rejects.toMatchObject({ name: 'TruplexyApiError', code: 'PLAN_LIMIT_REACHED', status: 429, requestId: 'req_body', details: { limit: 'tokens_per_month' }, retryAfter: '5' });
    const other = make(500, {});
    await expect(other.client.getProfile()).rejects.toMatchObject({ requestId: 'req_header' });
  });

  it('keeps null replies and handles invalid JSON and network failures', async () => {
    const { client, fetch } = make(200, { reply: null, status: 'escalated', sources: [] });
    expect(await client.sendMessage('c', 'hi')).toMatchObject({ reply: null, status: 'escalated' });
    fetch.mockResolvedValueOnce(new Response('<html>'));
    await expect(client.getProfile()).rejects.toBeInstanceOf(TruplexyApiError);
    fetch.mockRejectedValueOnce(new Error('network secret'));
    await expect(client.getProfile()).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', status: 502 });
  });
});

import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { loadSnippets } from '../scripts/snippets.mjs';
import { mockApi } from '../playground/mock-api.mjs';
import { createChatClient, createHandler, verifySession } from '../packages/server/src';

const base = 'https://mock.test/v3';
const options = { latency: 0, replyLatency: 0, autoAgent: false };
const identity = { name: 'Ann', contacts: [{ type: 'app', value: '42' }, { type: 'email', value: 'Ann@example.com' }] };

function nodeHelper(fetch: typeof globalThis.fetch) {
  const pack = loadSnippets('node', base);
  const js = ts.transpileModule(pack.helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  new Function('fetch', 'process', 'module', 'exports', js)(fetch, { env: { TRUPLEXY_CHAT_KEY: 'test' } }, module, module.exports);
  return module.exports;
}

describe('generated Node integration helper', () => {
  it('links the customer and channel, reuses the thread and routes replies', async () => {
    const fetch = mockApi(base, options);
    const helper = nodeHelper(fetch);
    const first = await helper.ask('tg:group:42', 'hi', identity, 'chn_web');
    const second = await helper.ask('tg:group:42', 'again', identity);
    expect(first.conversationId).toBe(second.conversationId);
    expect(helper.threadFor(first.conversationId)).toBe('tg:group:42');
    const conversation = await helper.call(`/conversations/${first.conversationId}`, undefined, 'GET');
    expect(conversation.customer_id).toMatch(/^cus_/);
    expect(conversation.channel_id).toBe('chn_web');
    const customer = await helper.upsertCustomer({ contacts: [{ type: 'email', value: 'ann@example.com' }] });
    expect(customer.id).toBe(conversation.customer_id);
    expect(customer.name).toBe('Ann');
  });

  it('retries a race once and never creates a conversation after conflict', async () => {
    for (const code of ['CUSTOMER_CONFLICT', 'CUSTOMER_EXISTS']) {
      const calls: string[] = [];
      const helper = nodeHelper(async (url) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ error: { code, message: 'conflict', request_id: 'req_1', detail: 'extra' } }), { status: 409 });
      });
      await expect(helper.ask('thread', 'hi', identity)).rejects.toMatchObject({ code, status: 409, requestId: 'req_1' });
      expect(calls).toEqual(Array(code === 'CUSTOMER_EXISTS' ? 2 : 1).fill(base + '/customer'));
    }
  });
});

describe('mock contract used by the playground and language route checks', () => {
  it('merges contacts atomically, preserves primary flags and omitted metadata', async () => {
    const chat = createChatClient({ chatKey: 'test', apiBase: base, fetch: mockApi(base, options) });
    const first = await chat.upsertCustomer({ ...identity, metadata: { tier: 1 } });
    const merged = await chat.upsertCustomer({ contacts: [{ type: 'app', value: '42', primary: false }, { type: 'phone', value: '+1 (555) 123-4567' }] });
    expect(merged.id).toBe(first.id);
    expect(merged.metadata).toEqual({ tier: 1 });
    expect(merged.contacts).toEqual(expect.arrayContaining([{ type: 'app', value: '42', primary: true }, { type: 'phone', value: '+15551234567', primary: true }]));
    await chat.upsertCustomer({ contacts: [{ type: 'app', value: 'other' }] });
    await expect(chat.upsertCustomer({ contacts: [{ type: 'app', value: '42' }, { type: 'app', value: 'other' }] })).rejects.toMatchObject({ code: 'CUSTOMER_CONFLICT' });
    expect((await chat.upsertCustomer({ contacts: [{ type: 'app', value: '42' }] })).contacts).toHaveLength(3);
  });

  it('supports escalation, resume, close and idempotent agent replies', async () => {
    const chat = createChatClient({ chatKey: 'test', apiBase: base, fetch: mockApi(base, options) });
    const customer = await chat.upsertCustomer(identity);
    const conv = await chat.createConversation({ customer_id: customer.id, channel_id: 'chn_web' });
    await expect(chat.closeTicket(conv.id)).rejects.toMatchObject({ code: 'TICKET_NOT_FOUND' });
    const ticket = await chat.createTicket(conv.id, { subject: 'Question', priority: 'high' });
    expect(ticket).toMatchObject({ customer_id: customer.id, channel_id: 'chn_web', priority: 'high' });
    expect((await chat.escalate(conv.id)).escalated).toBe(true);
    expect((await chat.sendMessage(conv.id, 'hi')).reply).toBeNull();
    expect((await chat.resume(conv.id)).escalated).toBe(false);
    expect((await chat.createTicket(conv.id)).id).toBe(ticket.id);
    const reply = { content: 'From the team', author: 'Ann', external_id: 'platform-message', escalate: true };
    const first = await chat.sendReply(conv.id, reply);
    expect(await chat.sendReply(conv.id, reply)).toEqual(first);
    expect((await chat.handoff(conv.id)).status).toBe('handoff');
    expect((await chat.closeTicket(conv.id)).status).toBe('closed');
    expect(await chat.closeTicket(conv.id)).toMatchObject({ id: ticket.id, status: 'closed' });
    expect(await chat.getConversation(conv.id)).toMatchObject({ status: 'open', escalated: false });
  });

  it('links a real widget session and filters customer records from the browser response', async () => {
    const fetch = mockApi(base, options);
    const handler = createHandler({ chatKey: 'test', apiBase: base, fetch });
    const res = await handler(new Request('https://site.test/chat', { method: 'POST', body: JSON.stringify({ action: 'message', text: 'hello', customer: { name: 'Ann', email: 'ann@example.com' } }) }));
    const data = await res.json();
    expect(data.customer).toBeUndefined();
    expect(data.ticket.customer_id).toBeUndefined();
    const id = await verifySession(data.session, 'test', 100);
    const chat = createChatClient({ chatKey: 'test', apiBase: base, fetch });
    const customer = await chat.upsertCustomer({ contacts: [{ type: 'email', value: 'ann@example.com' }] });
    expect((await chat.getConversation(id!)).customer_id).toBe(customer.id);
  });
});

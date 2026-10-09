import { describe, expect, it, vi } from 'vitest';
import { TruplexyClient } from '../src/client';
import { TruplexyRequestError } from '../src/transport';
import type { Transport } from '../src/types';

const msg = (id: string, role: 'user' | 'assistant', content: string, extra = {}) => ({ id, role, content, created_at: '2026-10-09T10:00:00Z', ...extra });

type Action = 'message' | 'history' | 'handoff' | 'live';

function fake(handlers: Partial<Record<Action, (body: any) => any>>) {
  const calls: { action: string; body: any }[] = [];
  const transport: Transport = {
    async request(action, body) {
      calls.push({ action, body });
      const h = handlers[action];
      if (!h) throw new Error(`unexpected ${action}`);
      return h(body);
    },
  };
  return { transport, calls };
}

describe('TruplexyClient', () => {
  it('sends without a session first, then with the one it got back', async () => {
    const { transport, calls } = fake({
      message: (b) => ({ session: 'S1', message: { id: 'msg_u' }, reply: `re: ${b.text}`, status: 'answered', sources: [] }),
      live: () => ({}),
    });
    const client = new TruplexyClient({ transport, store: false });
    await client.start();
    await client.send(' hi ');
    await client.send('again');
    expect(calls.filter((c) => c.action === 'message').map((c) => c.body)).toEqual([
      { text: 'hi', session: null },
      { text: 'again', session: 'S1' },
    ]);
    const s = client.getState();
    expect(s.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'hi'],
      ['assistant', 're: hi'],
      ['user', 'again'],
      ['assistant', 're: again'],
    ]);
    expect(s.sending).toBe(false);
    client.destroy();
  });

  it('shows no reply when escalated, and offers handoff when asked', async () => {
    let status = 'handoff_offered';
    const { transport } = fake({
      message: () => ({ session: 'S', reply: status === 'escalated' ? null : 'Want a person?', status, sources: [] }),
      handoff: () => ({
        session: 'S',
        conversation: { status: 'handoff', escalated: false, messages: [msg('m1', 'user', 'person'), msg('m2', 'assistant', 'Want a person?'), msg('m3', 'assistant', 'Flagged.')] },
      }),
      live: () => ({}),
    });
    const client = new TruplexyClient({ transport, store: false });
    await client.start();
    await client.send('person');
    expect(client.getState().offerHandoff).toBe(true);
    await client.handoff();
    expect(client.getState()).toMatchObject({ offerHandoff: false, handoff: true });
    expect(client.getState().messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    status = 'escalated';
    await client.send('hello?');
    expect(client.getState().escalated).toBe(true);
    expect(client.getState().messages.at(-1)).toMatchObject({ role: 'user', content: 'hello?' });
    client.destroy();
  });

  it('marks a failed message and retries it', async () => {
    let fail = true;
    const { transport } = fake({
      message: () => {
        if (fail) throw new TruplexyRequestError('PLAN_LIMIT_REACHED', 'Not now.', 503, 'req_1');
        return { session: 'S', reply: 'ok', status: 'answered' };
      },
      live: () => ({}),
    });
    const client = new TruplexyClient({ transport, store: false });
    const errors: unknown[] = [];
    client.on('error', (e) => errors.push(e));
    await client.start();
    await client.send('hi');
    const failed = client.getState().messages[0];
    expect(failed.error).toEqual({ code: 'PLAN_LIMIT_REACHED', message: 'Not now.', requestId: 'req_1' });
    expect(errors).toHaveLength(1);
    fail = false;
    await client.retry(failed.id);
    expect(client.getState().messages.map((m) => [m.content, Boolean(m.error)])).toEqual([
      ['hi', false],
      ['ok', false],
    ]);
    client.destroy();
  });

  it('restores, syncs history, maps team replies and counts unread', async () => {
    const saved = { session: 'S', messages: [{ id: 'm1', role: 'user' as const, content: 'hi', createdAt: 'x' }], seen: 1 };
    const store = { load: () => saved, save: vi.fn(), clear: vi.fn() };
    const { transport } = fake({
      history: () => ({
        session: 'S2',
        conversation: {
          status: 'open',
          escalated: true,
          messages: [
            msg('m0', 'user', '[Context only] vip'),
            msg('m1', 'user', 'hi'),
            msg('m2', 'assistant', 'hello'),
            msg('m3', 'assistant', 'Sam here', { author: 'agent', agent: 'Sam' }),
          ],
        },
      }),
      live: () => ({}),
    });
    const client = new TruplexyClient({ transport, store });
    await client.start();
    const s = client.getState();
    expect(s.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(s.messages[2].agent).toBe('Sam');
    expect(s.escalated).toBe(true);
    expect(s.unread).toBe(1);
    client.setOpen(true);
    expect(client.getState().unread).toBe(0);
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ session: 'S2', seen: 2 }));
    client.destroy();
  });

  it('forgets a conversation the server no longer knows', async () => {
    const store = {
      load: () => ({ session: 'old', messages: [{ id: 'm1', role: 'user' as const, content: 'hi', createdAt: 'x' }], seen: 0 }),
      save: vi.fn(),
      clear: vi.fn(),
    };
    const { transport, calls } = fake({
      history: () => ({ session: null }),
      message: () => ({ session: 'new', reply: 'hey', status: 'answered' }),
      live: () => ({}),
    });
    const client = new TruplexyClient({ transport, store });
    await client.start();
    expect(client.getState().messages).toEqual([]);
    await client.send('hello');
    expect(calls.find((c) => c.action === 'message')!.body.session).toBeNull();
    client.destroy();
  });

  it('refreshes when the transport pushes', async () => {
    let push = () => {};
    const transport: Transport = {
      async request(action): Promise<any> {
        if (action === 'message') return { session: 'S', reply: 'ok', status: 'answered' };
        return {
          session: 'S',
          conversation: {
            status: 'open',
            escalated: false,
            messages: [msg('m1', 'user', 'hi'), msg('m2', 'assistant', 'ok'), msg('m3', 'assistant', 'from Sam', { author: 'agent', agent: 'Sam' })],
          },
        };
      },
      listen(cb) {
        push = cb;
        return () => {};
      },
    };
    const client = new TruplexyClient({ transport, store: false });
    const arrived: string[] = [];
    client.on('message', (ms) => arrived.push(...ms.map((m) => m.content)));
    await client.start();
    await client.send('hi');
    push();
    await vi.waitFor(() => expect(client.getState().messages.at(-1)?.agent).toBe('Sam'));
    expect(arrived).toEqual(['ok', 'from Sam']);
    client.destroy();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { TruplexyClient } from '../src/client';
import { TruplexyRequestError } from '../src/transport';
import type { Transport } from '../src/types';

const msg = (id: string, role: 'user' | 'assistant', content: string, extra = {}) => ({ id, role, content, created_at: '2026-10-09T10:00:00Z', ...extra });

type Action = 'message' | 'history' | 'handoff' | 'live' | 'profile';

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
  it('surfaces live service errors and only uses configuration failures for polling fallback', async () => {
    for (const code of ['REALTIME_NOT_CONFIGURED', 'CHANNEL_DISABLED', 'NOT_CONFIGURED']) {
      const { transport } = fake({
        message: () => ({ session: 'S1', message: { id: 'm1' }, reply: 'Hi', status: 'answered' }),
        live: () => { throw new TruplexyRequestError(code, 'Live unavailable', 503, 'req_live'); },
      });
      const client = new TruplexyClient({ transport, store: false, details: 'off' });
      const errors: unknown[] = [];
      client.on('error', e => errors.push(e));
      await client.start();
      await client.send('hi');
      await new Promise(resolve => setTimeout(resolve, 0));
      if (code === 'REALTIME_NOT_CONFIGURED') expect(errors).toEqual([]);
      else {
        expect(errors).toEqual([{ code, message: 'Live unavailable', requestId: 'req_live' }]);
        expect(client.getState().error?.code).toBe(code);
      }
      client.destroy();
    }
  });

  it('asks for name and email before the first message, sends them, and remembers them with the ticket', async () => {
    const ticket = { id: 'tkt_1', subject: 'Chat with Ada', status: 'open' };
    let saved: any = { session: null, messages: [], seen: 0 };
    const store = { load: () => saved, save: (s: any) => (saved = s), clear: () => (saved = { session: null, messages: [], seen: 0 }) };
    const { transport, calls } = fake({
      message: (b) => ({ session: 'S1', message: { id: 'msg_u' }, reply: `re: ${b.text}`, status: 'answered', sources: [], ...(!b.session && { ticket }) }),
      live: () => ({}),
    });
    const client = new TruplexyClient({ transport, store });
    await client.start();

    await client.send('hello');
    expect(client.getState().needsDetails).toBe(true);
    expect(client.getState().messages).toEqual([]);
    expect(calls.some((c) => c.action === 'message')).toBe(false);

    expect(client.setCustomer('  ', 'ada@example.com')).toBe(false);
    expect(client.setCustomer('Ada', 'not-an-email')).toBe(false);
    expect(client.setCustomer(' Ada Lovelace ', ' ada@example.com ')).toBe(true);
    expect(client.getState().needsDetails).toBe(false);

    await client.send('hello');
    expect(calls.find((c) => c.action === 'message')!.body).toEqual({ text: 'hello', session: null, customer: { name: 'Ada Lovelace', email: 'ada@example.com' } });
    expect(client.getState().ticket).toEqual(ticket);
    expect(saved).toMatchObject({ session: 'S1', customer: { name: 'Ada Lovelace', email: 'ada@example.com' }, ticket });

    // A second visit: the browser already knows who this is, and which ticket.
    const again = new TruplexyClient({ transport, store });
    await again.start();
    expect(again.getState().customer).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(again.getState().ticket).toEqual(ticket);
    await again.send('more');
    expect(again.getState().needsDetails).toBe(false);

    // A new conversation keeps the visitor but not the old ticket.
    again.reset();
    expect(again.getState().customer?.name).toBe('Ada Lovelace');
    expect(again.getState().ticket).toBeNull();
    await again.send('fresh start');
    expect(again.getState().needsDetails).toBe(false);
    client.destroy();
    again.destroy();
  });

  it('lets the visitor change their mind about giving details', async () => {
    const { transport } = fake({ live: () => ({}) });
    const client = new TruplexyClient({ transport, store: false });
    await client.start();
    await client.send('hi');
    expect(client.getState().needsDetails).toBe(true);
    client.cancelDetails();
    expect(client.getState().needsDetails).toBe(false);
    client.destroy();
  });

  it('loads the business and bot profile, and works without one', async () => {
    const profile = { business: { name: 'Acme Shop', logo_url: 'https://cdn.test/l.png' }, bot: { id: 'support', name: 'Shop assistant' } };
    const withProfile = new TruplexyClient({ transport: fake({ profile: () => profile }).transport, store: false });
    await withProfile.start();
    await vi.waitFor(() => expect(withProfile.getState().profile).toEqual(profile));
    withProfile.reset();
    expect(withProfile.getState().profile).toEqual(profile);
    withProfile.destroy();

    const failing = new TruplexyClient({ transport: fake({}).transport, store: false });
    await failing.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(failing.getState().profile).toBeNull();
    expect(failing.getState().ready).toBe(true);
    failing.destroy();
  });

  it('sends without a session first, then with the one it got back', async () => {
    const { transport, calls } = fake({
      message: (b) => ({ session: 'S1', message: { id: 'msg_u' }, reply: `re: ${b.text}`, status: 'answered', sources: [] }),
      live: () => ({}),
    });
    const client = new TruplexyClient({ transport, store: false, details: 'off' });
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
    const client = new TruplexyClient({ transport, store: false, details: 'off' });
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
    const client = new TruplexyClient({ transport, store: false, details: 'off' });
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

  it('maps a notice that a person joined to a line that is not a reply and not unread', async () => {
    const { transport } = fake({
      history: () => ({
        session: 'S',
        conversation: {
          status: 'open',
          escalated: true,
          messages: [msg('m1', 'user', 'need team support'), msg('m2', 'assistant', 'Sam has joined and will reply here.', { author: 'system', agent: 'Sam' })],
        },
      }),
      live: () => ({}),
    });
    const client = new TruplexyClient({ transport, store: { load: () => ({ session: 'S', messages: [], seen: 0 }), save: vi.fn(), clear: vi.fn() }, details: 'off' });
    const onMessage = vi.fn();
    client.on('message', onMessage);
    await client.start();
    const s = client.getState();
    expect(s.messages[1]).toMatchObject({ id: 'm2', role: 'assistant', notice: true, content: 'Sam has joined and will reply here.' });
    expect(s.messages[1].agent).toBeUndefined();
    expect(s.unread).toBe(0);
    expect(onMessage).not.toHaveBeenCalled();
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
    const client = new TruplexyClient({ transport, store, details: 'off' });
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

  it('does not overwrite the saved chat when told it is open before it has started', async () => {
    const saved = { session: 'S', messages: [{ id: 'm1', role: 'user' as const, content: 'hi', createdAt: 'x' }], seen: 0, customer: { name: 'Ada', email: 'ada@example.com' }, ticket: { id: 'tkt_1', status: 'open' } };
    const store = { load: () => saved, save: vi.fn(), clear: vi.fn() };
    const { transport } = fake({ history: () => ({ session: 'S', conversation: { status: 'open', escalated: false, messages: [msg('m1', 'user', 'hi')] } }), live: () => ({}) });
    const client = new TruplexyClient({ transport, store });
    client.setOpen(true);
    expect(store.save).not.toHaveBeenCalled();
    await client.start();
    expect(client.getState()).toMatchObject({ customer: { name: 'Ada' }, ticket: { id: 'tkt_1' }, messages: [{ content: 'hi' }] });
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ session: 'S', customer: { name: 'Ada', email: 'ada@example.com' } }));
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
    const client = new TruplexyClient({ transport, store, details: 'off' });
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
    const client = new TruplexyClient({ transport, store: false, details: 'off' });
    const arrived: string[] = [];
    client.on('message', (ms) => arrived.push(...ms.map((m) => m.content)));
    await client.start();
    await client.send('hi');
    push();
    await vi.waitFor(() => expect(client.getState().messages.at(-1)?.agent).toBe('Sam'));
    expect(arrived).toEqual(['ok', 'from Sam']);
    client.destroy();
  });

  describe('a closed ticket', () => {
    const DAY = 86_400_000;
    const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
    const closedConversation = (closedAt?: string) => ({
      session: 'S',
      conversation: {
        status: 'open',
        escalated: false,
        messages: [msg('m1', 'user', 'hi'), msg('m2', 'assistant', 'hello')],
        ticket: { id: 'tkt_1', status: 'closed', ...(closedAt && { closed_at: closedAt }) },
      },
    });
    const memory = (saved: any) => ({ load: () => saved, save: vi.fn((s: any) => (saved = s)), clear: vi.fn(() => (saved = { session: null, messages: [], seen: 0 })) });
    const open = { session: 'S', messages: [{ id: 'm1', role: 'user' as const, content: 'hi', createdAt: 'x' }], seen: 0, customer: { name: 'Ada', email: 'ada@example.com' }, ticket: { id: 'tkt_1', status: 'open' } };

    it('shows the conversation read-only, stops listening and refuses to send', async () => {
      const closedAt = ago(1);
      const store = memory(open);
      const { transport, calls } = fake({ history: () => closedConversation(closedAt), live: () => ({}), message: () => ({ session: 'S', reply: 'no', status: 'answered' }) });
      const client = new TruplexyClient({ transport, store });
      await client.start();
      const s = client.getState();
      expect(s.closed).toBe(true);
      expect(s.messages.map((m) => m.content)).toEqual(['hi', 'hello']);
      expect(s.ticket).toEqual({ id: 'tkt_1', status: 'closed', closedAt });
      expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ session: 'S', ticket: { id: 'tkt_1', status: 'closed', closedAt } }));
      expect(calls.some((c) => c.action === 'live')).toBe(false);
      await client.send('one more thing');
      await client.handoff();
      expect(calls.some((c) => c.action === 'message' || c.action === 'handoff')).toBe(false);
      expect(client.getState().messages).toHaveLength(2);
      client.destroy();
    });

    it('is closed again after a reload, and a new chat starts clean but keeps the visitor', async () => {
      const closedAt = ago(1);
      const store = memory({ ...open, ticket: { id: 'tkt_1', status: 'closed', closedAt } });
      const { transport, calls } = fake({ history: () => closedConversation(closedAt), live: () => ({}), message: () => ({ session: 'S2', reply: 'hey', status: 'answered', ticket: { id: 'tkt_2', status: 'open' } }) });
      const client = new TruplexyClient({ transport, store });
      expect(client.getState().closed).toBe(false);
      await client.start();
      expect(client.getState().closed).toBe(true);

      client.reset();
      expect(client.getState()).toMatchObject({ closed: false, ticket: null, messages: [], customer: { name: 'Ada' } });
      await client.send('hello again');
      expect(calls.find((c) => c.action === 'message')!.body.session).toBeNull();
      expect(client.getState()).toMatchObject({ closed: false, ticket: { id: 'tkt_2' } });
      client.destroy();
    });

    it('forgets a conversation closed longer ago than the retention', async () => {
      const store = memory({ ...open, ticket: { id: 'tkt_1', status: 'closed', closedAt: ago(4) } });
      const { transport, calls } = fake({ history: () => closedConversation(), live: () => ({}) });
      const client = new TruplexyClient({ transport, store });
      await client.start();
      expect(client.getState()).toMatchObject({ closed: false, ticket: null, messages: [], customer: { name: 'Ada' } });
      expect(calls.some((c) => c.action === 'history')).toBe(false);
      expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ session: null, messages: [], customer: { name: 'Ada', email: 'ada@example.com' } }));
      client.destroy();
    });

    it('keeps it for the retention you set', async () => {
      const closed = { ...open, ticket: { id: 'tkt_1', status: 'closed', closedAt: ago(4) } };
      const { transport } = fake({ history: () => closedConversation(ago(4)), live: () => ({}) });
      const longer = new TruplexyClient({ transport, store: memory(closed), closedRetentionDays: 7 });
      await longer.start();
      expect(longer.getState()).toMatchObject({ closed: true, messages: [{ content: 'hi' }, { content: 'hello' }] });
      const shorter = new TruplexyClient({ transport, store: memory({ ...closed, ticket: { ...closed.ticket, closedAt: ago(2) } }), closedRetentionDays: 1 });
      await shorter.start();
      expect(shorter.getState()).toMatchObject({ closed: false, messages: [] });
      longer.destroy();
      shorter.destroy();
    });

    it('forgets one the server says closed long ago when the visitor comes back', async () => {
      const { transport } = fake({ history: () => closedConversation(ago(10)), live: () => ({}) });
      const client = new TruplexyClient({ transport, store: memory(open) });
      await client.start();
      expect(client.getState()).toMatchObject({ closed: false, ticket: null, messages: [] });
      client.destroy();
    });

    it('turns a refused message into a closed conversation, without a failed bubble', async () => {
      let closed = false;
      const { transport, calls } = fake({
        message: (b) => {
          if (b.session) throw new TruplexyRequestError('TICKET_CLOSED', 'This conversation is closed. Start a new one.', 409);
          return { session: 'S', message: { id: 'm1' }, reply: 'hello', status: 'answered', ticket: { id: 'tkt_1', status: 'open' } };
        },
        history: () => (closed ? closedConversation(ago(0)) : { session: 'S', conversation: { status: 'open', escalated: false, messages: [msg('m1', 'user', 'hi'), msg('m2', 'assistant', 'hello')] } }),
        live: () => ({}),
      });
      const client = new TruplexyClient({ transport, store: false, details: 'off' });
      const errors: unknown[] = [];
      client.on('error', (e) => errors.push(e));
      await client.start();
      await client.send('hi');
      closed = true;
      await client.send('are you there?');
      await vi.waitFor(() => expect(client.getState().closed).toBe(true));
      expect(errors).toEqual([]);
      expect(client.getState().sending).toBe(false);
      expect(client.getState().messages.map((m) => m.content)).toEqual(['hi', 'hello']);
      expect(client.getState().messages.some((m) => m.error)).toBe(false);
      expect(calls.filter((c) => c.action === 'message')).toHaveLength(2);
      client.destroy();
    });

    it('keeps old behaviour with a route that sends no ticket', async () => {
      const { transport } = fake({ history: () => ({ session: 'S', conversation: { status: 'open', escalated: false, messages: [msg('m1', 'user', 'hi')] } }), live: () => ({}) });
      const client = new TruplexyClient({ transport, store: memory(open) });
      await client.start();
      expect(client.getState()).toMatchObject({ closed: false, ticket: { id: 'tkt_1', status: 'open' } });
      client.destroy();
    });
  });
});

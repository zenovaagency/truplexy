import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/** The in-app mock API (demo mode) for taking a conversation over and handing it back. */
let db: MockDb;
const scoped = new Headers({ Authorization: 'Bearer demo', 'X-Truplexy-Tenant': 'acme', 'X-Truplexy-Bot': 'support' });

beforeEach(() => {
  localStorage.clear();
  db = loadDb(seedDb);
});

const call = (method: string, path: string, body?: unknown) => dispatch(db, { method, path, query: new URLSearchParams(), headers: scoped, body }).body as any;
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MockHttpError) return { status: e.status, code: e.code };
    throw e;
  }
  throw new Error('expected an error');
};

/** A conversation the assistant flagged, with no ticket yet, opened as a fresh ticket. */
function freshTicket() {
  const handoff = call('GET', '/handoffs').data[0];
  return call('POST', '/tickets', { conversation_id: handoff.conversation_id }) as { id: string };
}
const notices = (id: string) => (call('GET', `/tickets/${id}`).messages as any[]).filter((m) => m.author === 'system').map((m) => m.content);

describe('taking a conversation over', () => {
  it('refuses a reply until the person has taken it over, but not a note', () => {
    const { id } = freshTicket();
    expect(fails(() => call('POST', `/tickets/${id}/replies`, { kind: 'reply', content: 'Hi' }))).toEqual({ status: 409, code: 'TAKE_OVER_REQUIRED' });
    expect(call('POST', `/tickets/${id}/replies`, { kind: 'note', content: 'Looking' }).reply.kind).toBe('note');
    call('PATCH', `/tickets/${id}`, { escalated: true });
    expect(call('POST', `/tickets/${id}/replies`, { kind: 'reply', content: 'Hi' }).reply.kind).toBe('reply');
  });

  it('says so in the conversation, once, when a person joins and when they hand back', () => {
    const { id } = freshTicket();
    expect(notices(id)).toEqual([]);
    for (let i = 0; i < 2; i++) call('PATCH', `/tickets/${id}`, { escalated: true });
    call('PATCH', `/tickets/${id}`, { priority: 'high' });
    const joined = notices(id);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatch(/ has joined and will reply here\.$/);

    for (let i = 0; i < 2; i++) call('PATCH', `/tickets/${id}`, { escalated: false });
    const after = notices(id);
    expect(after).toHaveLength(2);
    expect(after[1]).toMatch(/ has handed the conversation back to the assistant\.$/);
    // The notice is a message, not a reply.
    expect(call('GET', `/tickets/${id}`).replies).toEqual([]);
  });

  it('hands back when the ticket is closed, with or without a final reply', () => {
    const closing = freshTicket();
    call('PATCH', `/tickets/${closing.id}`, { escalated: true });
    call('PATCH', `/tickets/${closing.id}`, { status: 'closed' });
    expect(notices(closing.id)).toHaveLength(2);

    const replying = call('POST', '/tickets', { conversation_id: call('GET', '/handoffs').data[0].conversation_id, escalated: true }) as { id: string };
    expect(notices(replying.id)).toHaveLength(1);
    call('POST', `/tickets/${replying.id}/replies`, { kind: 'reply', content: 'All sorted.', status: 'closed' });
    const messages = call('GET', `/tickets/${replying.id}`).messages as any[];
    expect(messages.slice(-2).map((m) => m.author)).toEqual(['agent', 'system']);
  });
});

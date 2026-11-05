import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/** The in-app mock API (demo mode) for AI drafts of a ticket reply. */
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
const tenant = () => db.tenants.find((t) => t.id === 'acme')!;

/** A conversation the assistant flagged, opened as a fresh ticket. */
function freshTicket() {
  const handoff = call('GET', '/handoffs').data[0];
  return call('POST', '/tickets', { conversation_id: handoff.conversation_id }) as { id: string };
}

describe('an AI draft of a reply', () => {
  it('returns a draft and its sources, bills one reply, and sends nothing', () => {
    const { id } = freshTicket();
    const before = call('GET', `/tickets/${id}`).messages.length;
    const replies = tenant().replies_this_month;

    const draft = call('POST', `/tickets/${id}/suggested-reply`, {});
    expect(typeof draft.content).toBe('string');
    expect(draft.content.length).toBeGreaterThan(10);
    expect(Array.isArray(draft.sources)).toBe(true);
    expect(draft.sources.length).toBeLessThanOrEqual(5);
    expect(tenant().replies_this_month).toBe(replies + 1);
    expect(call('GET', `/tickets/${id}`).messages).toHaveLength(before);
  });

  it('follows the hint', () => {
    const { id } = freshTicket();
    expect(call('POST', `/tickets/${id}/suggested-reply`, { instructions: 'Offer a refund' }).content).toMatch(/refund/i);
  });

  it('refuses a long hint, a ticket without a conversation, and a business without a plan', () => {
    const { id } = freshTicket();
    expect(fails(() => call('POST', `/tickets/${id}/suggested-reply`, { instructions: 'x'.repeat(501) }))).toEqual({ status: 400, code: 'INVALID_REQUEST' });
    const loose = call('POST', '/tickets', { subject: 'Invoice' });
    expect(fails(() => call('POST', `/tickets/${loose.id}/suggested-reply`, {}))).toEqual({ status: 400, code: 'NO_CONVERSATION' });
    tenant().plan = 'none';
    expect(fails(() => call('POST', `/tickets/${id}/suggested-reply`, {}))).toEqual({ status: 403, code: 'PLAN_LIMIT_REACHED' });
  });
});

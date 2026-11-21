import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/** The in-app mock API (demo mode) for knowledge suggestions learned from closed tickets. */
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
const suggestions = () => call('GET', '/knowledge/suggestions').data as any[];

/** A flagged conversation opened as a ticket, taken over and answered by a person. */
function answeredTicket() {
  const handoff = call('GET', '/handoffs').data[0];
  const { id } = call('POST', '/tickets', { conversation_id: handoff.conversation_id }) as { id: string };
  call('PATCH', `/tickets/${id}`, { escalated: true });
  call('POST', `/tickets/${id}/replies`, { kind: 'reply', content: 'Yes, we can set up a registry for up to 200 guests.' });
  return id;
}

describe('learning from closed tickets', () => {
  it('suggests an article when a ticket a person answered closes', () => {
    const before = suggestions().length;
    expect(before).toBeGreaterThan(0);
    const id = answeredTicket();
    expect(suggestions()).toHaveLength(before);
    call('PATCH', `/tickets/${id}`, { status: 'closed' });
    const s = suggestions().find((x) => x.ticket_id === id);
    expect(s).toMatchObject({ status: 'ready', ticket_subject: expect.any(String) });
    expect(s.content).toContain('200 guests');
  });

  it('suggests nothing while the bot does not learn from tickets', () => {
    const ws = call('GET', '/workspace');
    call('PUT', '/workspace', { name: ws.name, bot: { ...ws.bot, knowledge: { ...ws.bot.knowledge, learnFromTickets: false } }, revision: ws.revision });
    expect(call('GET', '/workspace').bot.knowledge.learnFromTickets).toBe(false);
    const id = answeredTicket();
    call('PATCH', `/tickets/${id}`, { status: 'closed' });
    expect(suggestions().some((x) => x.ticket_id === id)).toBe(false);
  });

  it('adds an accepted suggestion as an article from the ticket, with the edits', () => {
    const [s] = suggestions();
    const { document } = call('POST', `/knowledge/suggestions/${s.id}/accept`, { title: 'Edited title', content: '' });
    expect(document).toMatchObject({ title: 'Edited title', source_type: 'ticket', source_name: s.ticket_id, status: 'indexed' });
    expect(suggestions().some((x) => x.id === s.id)).toBe(false);
    expect(fails(() => call('POST', `/knowledge/suggestions/${s.id}/accept`, {}))).toEqual({ status: 409, code: 'SUGGESTION_HANDLED' });
  });

  it('keeps a dismissed suggestion out, even when its ticket closes again', () => {
    const id = answeredTicket();
    call('PATCH', `/tickets/${id}`, { status: 'closed' });
    const s = suggestions().find((x) => x.ticket_id === id);
    call('POST', `/knowledge/suggestions/${s.id}/dismiss`);
    call('PATCH', `/tickets/${id}`, { status: 'open' });
    call('PATCH', `/tickets/${id}`, { status: 'closed' });
    expect(suggestions().some((x) => x.ticket_id === id)).toBe(false);
  });

  it('refuses a duplicate of an article already in the knowledge base', () => {
    const [a, b] = suggestions();
    call('POST', `/knowledge/suggestions/${a.id}/accept`, {});
    expect(fails(() => call('POST', `/knowledge/suggestions/${b.id}/accept`, { content: a.content }))).toEqual({ status: 409, code: 'DUPLICATE_DOCUMENT' });
    expect(suggestions().some((x) => x.id === b.id)).toBe(true);
  });
});

describe('training the bot from one ticket', () => {
  it('drafts an open ticket on demand, even while the bot does not learn on its own', () => {
    const ws = call('GET', '/workspace');
    call('PUT', '/workspace', { name: ws.name, bot: { ...ws.bot, knowledge: { learnFromTickets: false } }, revision: ws.revision });
    const handoff = call('GET', '/handoffs').data[0];
    const { id } = call('POST', '/tickets', { conversation_id: handoff.conversation_id }) as { id: string };
    expect(fails(() => call('POST', `/tickets/${id}/learn`))).toEqual({ status: 400, code: 'NOT_ANSWERED' });
    call('PATCH', `/tickets/${id}`, { escalated: true });
    call('POST', `/tickets/${id}/replies`, { kind: 'reply', content: 'Yes, up to 200 guests.' });
    const s = call('POST', `/tickets/${id}/learn`);
    expect(s).toMatchObject({ ticket_id: id, status: 'ready' });
    expect(suggestions().some((x) => x.id === s.id)).toBe(true);
    // Asking again redrafts the same suggestion.
    expect(call('POST', `/tickets/${id}/learn`).id).toBe(s.id);
    call('POST', `/knowledge/suggestions/${s.id}/accept`, {});
    expect(fails(() => call('POST', `/tickets/${id}/learn`))).toEqual({ status: 409, code: 'SUGGESTION_HANDLED' });
  });
});

describe('checking the knowledge base first', () => {
  it('ignores a ticket an article already covers, and says which', () => {
    const t = db.tickets.find((x) => x.tenant_id === 'acme' && x.bot_id === 'support' && x.conversation_id && /discount code/i.test(x.subject))!;
    const conv = db.conversations.find((x) => x.id === t.conversation_id)!;
    if (!conv.messages.some((m) => m.author === 'agent')) {
      call('PATCH', `/tickets/${t.id}`, { escalated: true });
      call('POST', `/tickets/${t.id}/replies`, { kind: 'reply', content: 'Codes can’t be combined with sale prices.' });
    }
    const doc = db.documents.find((d) => d.tenant_id === 'acme' && d.bot_id === 'support' && d.title === 'Discount codes')!;
    try {
      call('POST', `/tickets/${t.id}/learn`);
      throw new Error('expected ALREADY_COVERED');
    } catch (e) {
      expect(e).toBeInstanceOf(MockHttpError);
      expect((e as MockHttpError).code).toBe('ALREADY_COVERED');
      expect((e as MockHttpError).extra).toEqual({ document_id: doc.id });
    }
    // Closing it suggests nothing either.
    call('PATCH', `/tickets/${t.id}`, { status: 'closed' });
    expect(suggestions().some((x) => x.ticket_id === t.id)).toBe(false);
  });
});

describe('reviewing closed tickets', () => {
  /** Turns learning off, so a ticket closed afterwards is left for a review. */
  function closedWhileNotLearning() {
    const ws = call('GET', '/workspace');
    call('PUT', '/workspace', { name: ws.name, bot: { ...ws.bot, knowledge: { ...ws.bot.knowledge, learnFromTickets: false } }, revision: ws.revision });
    const id = answeredTicket();
    call('PATCH', `/tickets/${id}`, { status: 'closed' });
    return id;
  }

  it('counts closed tickets a person answered that were never read', () => {
    const id = closedWhileNotLearning();
    const status = call('GET', '/knowledge/suggestions/review');
    expect(status.unreviewed).toBeGreaterThan(0);
    expect(status.queued).toBe(0);
    expect(suggestions().some((x) => x.ticket_id === id)).toBe(false);
  });

  it('drafts suggestions for them, once', () => {
    const id = closedWhileNotLearning();
    const { unreviewed } = call('GET', '/knowledge/suggestions/review');
    const r = call('POST', '/knowledge/suggestions/review', {});
    expect(r.queued).toBe(unreviewed);
    expect(r.unreviewed_left).toBe(0);
    expect(suggestions().find((x) => x.ticket_id === id)?.content).toContain('200 guests');
    expect(call('GET', '/knowledge/suggestions/review').unreviewed).toBe(0);
    expect(fails(() => call('POST', '/knowledge/suggestions/review', {}))).toEqual({ status: 422, code: 'NOTHING_TO_REVIEW' });
  });

  it('stops at the limit and leaves the rest for another review', () => {
    closedWhileNotLearning();
    const { unreviewed } = call('GET', '/knowledge/suggestions/review');
    const first = call('POST', '/knowledge/suggestions/review', { limit: 1 });
    expect(first).toEqual({ queued: 1, unreviewed_left: unreviewed - 1 });
    expect(fails(() => call('POST', '/knowledge/suggestions/review', { limit: 0 }))).toEqual({ status: 400, code: 'INVALID_LIMIT' });
  });

  it('does not read a ticket again after Train bot read it', () => {
    const id = closedWhileNotLearning();
    const before = call('GET', '/knowledge/suggestions/review').unreviewed;
    call('POST', `/tickets/${id}/learn`);
    expect(call('GET', '/knowledge/suggestions/review').unreviewed).toBe(before - 1);
  });
});

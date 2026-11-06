import { beforeEach, describe, expect, it } from 'vitest';
import { classify } from './assign';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/** The in-app mock API (demo mode) for support roles, availability and automatic assignment. */
let db: MockDb;
const scoped = new Headers({ Authorization: 'Bearer demo', 'X-Truplexy-Tenant': 'acme', 'X-Truplexy-Bot': 'support' });

beforeEach(() => {
  localStorage.clear();
  db = loadDb(seedDb);
});

const call = (method: string, path: string, body?: unknown, query = '') =>
  dispatch(db, { method, path, query: new URLSearchParams(query), headers: scoped, body }).body as any;
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MockHttpError) return { status: e.status, code: e.code };
    throw e;
  }
  throw new Error('expected an error');
};
const members = () => call('GET', '/members').data as any[];
const byName = (name: string) => members().find((m) => m.name.startsWith(name))!;
const open = (subject: string) => call('POST', '/tickets', { subject });

describe('classify', () => {
  it('picks the category with the most keyword matches', () => {
    expect(classify('I was charged twice for my subscription')).toBe('billing');
    expect(classify('Where is my order? Tracking is stuck')).toBe('orders');
    expect(classify('I want a refund, wrong size')).toBe('returns');
    expect(classify('The app crashes with an error')).toBe('technical');
    expect(classify('Tell me about apples')).toBe('general');
  });
});

describe('members', () => {
  it('reports support roles, availability and who is online', () => {
    const priya = byName('Priya');
    expect(priya.support_roles).toEqual(['billing', 'returns']);
    expect(priya.online).toBe(true);
    const marco = byName('Marco');
    expect(marco.availability).toBe('away');
    expect(marco.online).toBe(false);
  });

  it('lets an admin set support roles and availability, and anyone set their own', () => {
    const jun = byName('Jun');
    const updated = call('PATCH', `/members/${jun.user_id}`, { support_roles: ['technical', 'billing', 'billing'], availability: 'offline' });
    expect(updated.support_roles).toEqual(['billing', 'technical']);
    expect(updated.online).toBe(false);
    expect(fails(() => call('PATCH', `/members/${jun.user_id}`, { support_roles: ['plumbing'] }))).toEqual({ status: 400, code: 'INVALID_REQUEST' });
    expect(fails(() => call('PATCH', `/members/${jun.user_id}`, {}))).toEqual({ status: 400, code: 'INVALID_REQUEST' });

    const me = call('PATCH', '/members/me', { availability: 'available' });
    expect(me.availability).toBe('available');
    expect(me.online).toBe(true);
    expect(fails(() => call('PATCH', '/members/me', { availability: 'busy' }))).toEqual({ status: 400, code: 'INVALID_REQUEST' });
  });
});

describe('automatic assignment', () => {
  it('takes turns among the members with the ticket’s category', () => {
    expect(call('GET', '/tenant').auto_assign).toBe('category');
    const got = ['I was charged twice', 'Invoice is wrong', 'Card payment failed'].map((s) => open(s));
    expect(got.map((t) => t.category)).toEqual(['billing', 'billing', 'billing']);
    // Priya and Sofia handle billing and are online; they alternate.
    expect(got.map((t) => t.assignee_name?.split(' ')[0])).toEqual(['Priya', 'Sofia', 'Priya']);
  });

  it('skips who is away and leaves the ticket unassigned when nobody is online', () => {
    // Marco handles technical issues but is away, so Sofia, who handles them too, takes it.
    const t = open('The app crashes with an error');
    expect(t.category).toBe('technical');
    expect(t.assignee_name).toMatch(/^Sofia/);
    // With everyone away, the ticket stays unassigned.
    for (const m of members().filter((m) => m.role !== 'viewer')) call('PATCH', `/members/${m.user_id}`, { availability: 'away' });
    const none = open('Refund please');
    expect(none.assignee_user_id).toBeUndefined();
    expect(none.flags.unassigned).toBe(true);
    // Moving it to another category once someone is back assigns it there.
    call('PATCH', `/members/${byName('Jun').user_id}`, { availability: 'available' });
    const moved = call('PATCH', `/tickets/${none.id}`, { category: 'orders' });
    expect(moved.assignee_name).toMatch(/^Jun/);
  });

  it('takes turns across the team overall, and assigns nobody when off', () => {
    call('PATCH', '/tenant', { auto_assign: 'overall' });
    const names = [1, 2, 3].map(() => open('I was charged twice').assignee_name?.split(' ')[0]);
    expect(new Set(names).size).toBe(3);
    expect(fails(() => call('PATCH', '/tenant', { auto_assign: 'random' }))).toEqual({ status: 400, code: 'INVALID_REQUEST' });
    call('PATCH', '/tenant', { auto_assign: 'off' });
    const t = open('Where is my parcel?');
    expect(t.assignee_user_id).toBeUndefined();
    expect(t.category).toBe('orders');
    expect(call('GET', '/tickets', undefined, 'category=orders').data.some((x: any) => x.id === t.id)).toBe(true);
  });

  it('keeps a chosen category and assignee', () => {
    const jun = byName('Jun');
    const t = call('POST', '/tickets', { subject: 'I was charged twice', category: 'sales', assignee_user_id: jun.user_id });
    expect(t.category).toBe('sales');
    expect(t.assignee_user_id).toBe(jun.user_id);
  });
});

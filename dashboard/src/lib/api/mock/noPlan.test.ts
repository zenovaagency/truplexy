import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/**
 * The in-app mock API (demo mode) without the Free plan: a business without a plan ('none') can be set
 * up, but its bots don't reply until a trial starts.
 */
let db: MockDb;
let admin: Headers;

beforeEach(() => {
  localStorage.clear();
  db = loadDb(seedDb);
  db.currentUserId = db.users.find((u) => u.platform_admin)!.id;
  admin = new Headers({ Authorization: 'Bearer demo' });
});

const call = (method: string, path: string, body?: unknown, headers = admin) => dispatch(db, { method, path, query: new URLSearchParams(), headers, body });
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MockHttpError) return { status: e.status, code: e.code, limit: e.extra.limit };
    throw e;
  }
  throw new Error('expected an error');
};
const scoped = (tenant: string) => {
  const bot = db.bots.find((b) => b.tenant_id === tenant)!;
  return new Headers({ Authorization: 'Bearer demo', 'X-Truplexy-Tenant': tenant, 'X-Truplexy-Bot': bot.id });
};
const run = (tenant: string) => call('POST', '/playground/run', { max_output_tokens: 100, message: 'Hello?' }, scoped(tenant));

describe('a business without a plan', () => {
  it('is not a plan anyone can pick', () => {
    const plans = (call('GET', '/plans').body as any).data as { id: string }[];
    expect(plans.map((p) => p.id)).toEqual(['starter', 'pro', 'enterprise']);
  });

  it('gets no replies and no tokens until it has a plan', () => {
    const id = 'acme';
    call('PATCH', `/platform/tenants/${id}`, { plan: 'none' });
    expect(fails(() => run(id))).toMatchObject({ status: 403, code: 'PLAN_LIMIT_REACHED', limit: 'no_plan' });
    const billing = call('GET', '/billing', undefined, scoped(id)).body as any;
    expect(billing.plan).toEqual({ id: 'none', name: 'No plan' });
    expect(billing.tokens).toMatchObject({ unlimited: false, remaining: 0 });
    expect(billing.token_addon).toBeNull();

    call('PATCH', `/platform/tenants/${id}`, { plan: 'starter' });
    expect(() => run(id)).not.toThrow();
  });

  it('can be set by a platform admin, and Free is gone', () => {
    const id = db.tenants.find((t) => t.plan === 'pro')!.id;
    call('PATCH', `/platform/tenants/${id}`, { plan: 'none' });
    expect(db.tenants.find((t) => t.id === id)!.plan).toBe('none');
    expect(fails(() => call('PATCH', `/platform/tenants/${id}`, { plan: 'free' }))).toMatchObject({ status: 400 });
  });
});

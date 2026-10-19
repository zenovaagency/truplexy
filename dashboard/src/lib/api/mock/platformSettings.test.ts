import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/**
 * The in-app mock API (demo mode) for what image input added for platform admins: the vision model
 * setting, the `supports_vision` flag on models, and the `image_input` plan limit.
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
    if (e instanceof MockHttpError) return { status: e.status, code: e.code };
    throw e;
  }
  throw new Error('expected an error');
};
const vision = () => (call('GET', '/platform/settings').body as any).vision_model;

describe('GET /platform/settings', () => {
  it('starts on the server default', () => {
    expect(vision()).toEqual({ value: '', default: 'google/gemini-3.1-flash-lite', effective: 'google/gemini-3.1-flash-lite', source: 'env' });
  });

  it('is for platform admins only', () => {
    db.currentUserId = db.users.find((u) => !u.platform_admin)!.id;
    expect(fails(() => call('GET', '/platform/settings'))).toMatchObject({ status: 403 });
    expect(fails(() => call('PATCH', '/platform/settings', { vision_model: 'openai/gpt-5-mini' }))).toMatchObject({ status: 403 });
  });
});

describe('PATCH /platform/settings', () => {
  it('sets the vision model and reports where it came from', () => {
    const out = call('PATCH', '/platform/settings', { vision_model: 'openai/gpt-5-mini' }).body as any;
    expect(out.vision_model).toMatchObject({ value: 'openai/gpt-5-mini', effective: 'openai/gpt-5-mini', source: 'console' });
    expect(vision().source).toBe('console');
  });

  it('takes null to go back to the server default', () => {
    call('PATCH', '/platform/settings', { vision_model: 'openai/gpt-5-mini' });
    const out = call('PATCH', '/platform/settings', { vision_model: null }).body as any;
    expect(out.vision_model).toMatchObject({ value: '', effective: 'google/gemini-3.1-flash-lite', source: 'env' });
  });

  it('refuses what is not an OpenRouter model ID', () => {
    for (const vision_model of ['gpt', 'a b/c', 42]) expect(fails(() => call('PATCH', '/platform/settings', { vision_model })), String(vision_model)).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    expect(fails(() => call('PATCH', '/platform/settings', {}))).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  });

  it('refuses a catalog model that cannot read pictures, or is retired', () => {
    expect(fails(() => call('PATCH', '/platform/settings', { vision_model: 'deepseek/deepseek-v3.2' }))).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    db.models.find((m) => m.id === 'openai/gpt-5-mini')!.status = 'retired';
    expect(fails(() => call('PATCH', '/platform/settings', { vision_model: 'openai/gpt-5-mini' }))).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    expect(vision().value).toBe('');
  });

  it('refuses a model OpenRouter does not know', () => {
    expect(fails(() => call('PATCH', '/platform/settings', { vision_model: 'acme/does-not-exist' }))).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  });
});

describe('models', () => {
  it('say whether they read pictures', () => {
    const models = (call('GET', '/platform/models').body as any).models as { id: string; supports_vision: boolean }[];
    expect(models.every((m) => typeof m.supports_vision === 'boolean')).toBe(true);
    expect(models.find((m) => m.id === 'google/gemini-3.1-flash-lite')!.supports_vision).toBe(true);
    expect(models.find((m) => m.id === 'deepseek/deepseek-v3.2')!.supports_vision).toBe(false);
  });

  it('can be changed by an admin', () => {
    const out = call('PATCH', '/platform/models/deepseek%2Fdeepseek-v3.2', { supports_vision: true }).body as any;
    expect(out.supports_vision).toBe(true);
  });
});

describe('the image_input limit', () => {
  const limitsOf = (id: string) => (call('GET', `/platform/tenants/${id}/detail`).body as any).limits ?? (call('GET', '/platform/tenants').body as any).data.find((t: any) => t.id === id).limits;

  it('is off for Free and on for paid plans', () => {
    const tenants = (call('GET', '/platform/tenants').body as any).data as { id: string; plan: string; limits: { image_input?: boolean } }[];
    for (const t of tenants) expect(t.limits.image_input, `${t.id} (${t.plan})`).toBe(t.plan !== 'free');
  });

  it('can be overridden for one business, and cleared again', () => {
    const free = (call('GET', '/platform/tenants').body as any).data.find((t: any) => t.plan === 'free') ?? null;
    const id = free?.id ?? (call('GET', '/platform/tenants').body as any).data[0].id;
    call('PATCH', `/platform/tenants/${id}`, { limits: { image_input: true } });
    expect(limitsOf(id).image_input).toBe(true);
    call('PATCH', `/platform/tenants/${id}`, { limits: {} });
    const plan = (call('GET', '/platform/tenants').body as any).data.find((t: any) => t.id === id).plan;
    expect(limitsOf(id).image_input).toBe(plan !== 'free');
  });

  it('must be true or false', () => {
    const id = (call('GET', '/platform/tenants').body as any).data[0].id;
    expect(fails(() => call('PATCH', `/platform/tenants/${id}`, { limits: { image_input: 1 } }))).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  });
});

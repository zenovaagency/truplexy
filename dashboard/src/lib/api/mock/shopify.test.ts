import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/** The in-app mock API (demo mode) for Shopify stores: POST /channels/connect and the built-in tools. */
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
const back = `${window.location.origin}/integrations/guides?tab=x`;
const connect = (account: string) => new URL(call('POST', '/channels/connect', { type: 'shopify', account, return_to: back }).url);
const shopify = () => (call('GET', '/channels').data as any[]).filter((c) => c.type === 'shopify');
const builtIns = () => (call('GET', '/tools').data as any[]).filter((t) => t.built_in);

describe('POST /channels/connect', () => {
  it('accepts the three ways to write a store, and comes back with the channel', () => {
    for (const account of ['demo-store', 'demo-store.myshopify.com', 'https://admin.shopify.com/store/demo-store']) {
      const u = connect(account);
      expect(u.searchParams.get('connected')).toBe('shopify');
      expect(u.searchParams.get('type')).toBe('shopify');
      expect(u.searchParams.get('tab')).toBe('x');
      expect(u.searchParams.get('channel_id')).toMatch(/^chn_/);
    }
    // The same store turns its channel back on rather than adding another.
    expect(shopify()).toHaveLength(1);
    expect(shopify()[0]).toMatchObject({ name: 'Demo Store', external_id: 'demo-store.myshopify.com', active: true });
  });

  it('comes back with each demo error', () => {
    expect(connect('denied').searchParams.get('connect_error')).toBe('denied');
    expect(connect('scopes-missing').searchParams.get('connect_error')).toBe('scopes_missing');
    expect(shopify()).toHaveLength(0);
  });

  it('refuses what the API refuses', () => {
    expect(fails(() => call('POST', '/channels/connect', { type: 'discord', account: 'x', return_to: back }))).toEqual({ status: 400, code: 'CHANNEL_CONNECT_UNSUPPORTED' });
    expect(fails(() => call('POST', '/channels/connect', { type: 'shopify', account: 'not a store', return_to: back }))).toEqual({ status: 400, code: 'INVALID_REQUEST' });
    expect(fails(() => call('POST', '/channels/connect', { type: 'shopify', account: 'demo', return_to: 'https://evil.example/x' }))).toEqual({ status: 400, code: 'INVALID_REQUEST' });
  });
});

describe('built-in tools', () => {
  it('are listed first, and available only with an active Shopify channel', () => {
    expect(builtIns().map((t) => [t.name, t.available])).toEqual([
      ['shopify_order_status', false],
      ['shopify_product_search', false],
    ]);
    expect((call('GET', '/tools').data as any[])[0].name).toBe('shopify_order_status');
    connect('demo-store');
    expect(builtIns().every((t) => t.available)).toBe(true);
    call('PATCH', `/channels/${shopify()[0].id}`, { enabled: false });
    expect(builtIns().every((t) => !t.available && t.unavailable_reason === 'Connect a Shopify store to this bot.')).toBe(true);
  });

  it("can't be changed, deleted or named by an API tool", () => {
    expect(fails(() => call('DELETE', '/tools/shopify_order_status'))).toMatchObject({ code: 'INVALID_TOOL' });
    expect(fails(() => call('POST', '/tools', { name: 'shopify_refunds', description: 'x', method: 'GET', url: 'https://x.example' }))).toMatchObject({ code: 'INVALID_TOOL' });
  });

  it('answers an order only when the email matches', () => {
    connect('demo-store');
    const ok = call('POST', '/tools/shopify_order_status/test', { arguments: { order_number: '#1001', email: 'maya.fernandez@example.com' } });
    expect(ok.output).toContain('fulfilled');
    const wrong = call('POST', '/tools/shopify_order_status/test', { arguments: { order_number: '1001', email: 'someone@example.com' } });
    expect(wrong.output).toBe('No order matches that order number and email.');
  });
});

describe('the chat window of a Shopify channel', () => {
  const store = () => {
    connect('demo-store');
    return shopify()[0].id as string;
  };

  it('starts on the defaults, and keeps what is saved', () => {
    const id = store();
    const fresh = call('GET', `/channels/${id}/widget`);
    expect(fresh).toMatchObject({ channel_id: id, enabled: true, shop: 'demo-store.myshopify.com', last_seen_at: '' });
    expect(fresh.settings).toEqual(fresh.defaults);
    expect(fresh.activation_url).toContain('demo-store.myshopify.com/admin/themes/current/editor');

    const saved = call('PUT', `/channels/${id}/widget`, { enabled: false, settings: { ...fresh.defaults, heading: 'Help', accent: '#AA3366', position: 'left' } });
    expect(saved).toMatchObject({ enabled: false, settings: { heading: 'Help', accent: '#aa3366', position: 'left' } });
    expect(call('GET', `/channels/${id}/widget`).settings.heading).toBe('Help');
    // Leaving enabled out keeps the switch.
    expect(call('PUT', `/channels/${id}/widget`, { settings: saved.settings }).enabled).toBe(false);
  });

  it('refuses what the API refuses', () => {
    const id = store();
    const { defaults } = call('GET', `/channels/${id}/widget`);
    for (const settings of [{ ...defaults, accent: 'red' }, { ...defaults, theme: 'neon' }, { ...defaults, position: 'top' }, { ...defaults, avatar_url: 'http://x.test/a.png' }, { ...defaults, font: 'x' }]) {
      expect(fails(() => call('PUT', `/channels/${id}/widget`, { settings })).code).toBe('INVALID_REQUEST');
    }
    expect(fails(() => call('PUT', `/channels/${id}/widget`, {})).code).toBe('INVALID_REQUEST');
  });

  it("is only for a Shopify store's channel", () => {
    const web = (call('GET', '/channels').data as any[]).find((c) => c.type !== 'shopify');
    if (web) expect(fails(() => call('GET', `/channels/${web.id}/widget`)).code).toBe('WIDGET_NOT_SUPPORTED');
    expect(fails(() => call('GET', '/channels/chn_missing/widget')).code).toBe('CHANNEL_NOT_FOUND');
  });
});

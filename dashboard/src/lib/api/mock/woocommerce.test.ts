import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/** The in-app mock API (demo mode) for WooCommerce stores: POST /channels/connect and the built-in tools. */
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
const connect = (account: string) => new URL(call('POST', '/channels/connect', { type: 'woocommerce', account, return_to: back }).url);
const stores = () => (call('GET', '/channels').data as any[]).filter((c) => c.type === 'woocommerce');
const builtIns = () => (call('GET', '/tools').data as any[]).filter((t) => t.built_in && t.name.startsWith('woocommerce_'));

describe('POST /channels/connect for WooCommerce', () => {
  it('accepts an https address, and comes back with the channel', () => {
    for (const account of ['demo-shop.example.com', 'https://demo-shop.example.com/', ' Demo-Shop.Example.com ']) {
      const u = connect(account);
      expect(u.searchParams.get('connected')).toBe('woocommerce');
      expect(u.searchParams.get('type')).toBe('woocommerce');
      expect(u.searchParams.get('tab')).toBe('x');
      expect(u.searchParams.get('channel_id')).toMatch(/^chn_/);
    }
    // The same store turns its channel back on rather than adding another.
    expect(stores()).toHaveLength(1);
    expect(stores()[0]).toMatchObject({ name: 'Demo Shop', external_id: 'https://demo-shop.example.com', active: true });
  });

  it('comes back with each demo error', () => {
    expect(connect('denied.example.com').searchParams.get('connect_error')).toBe('denied');
    expect(connect('scopes-missing.example.com').searchParams.get('connect_error')).toBe('scopes_missing');
    expect(connect('denied.example.com').searchParams.get('type')).toBe('woocommerce');
    expect(stores()).toHaveLength(0);
  });

  it('refuses what the API refuses', () => {
    for (const account of ['http://shop.example.com', 'not a store', 'localhost']) {
      expect(fails(() => call('POST', '/channels/connect', { type: 'woocommerce', account, return_to: back }))).toEqual({ status: 400, code: 'INVALID_REQUEST' });
    }
    expect(fails(() => call('POST', '/channels/connect', { type: 'woocommerce', account: 'shop.example.com', return_to: 'https://evil.example/x' }))).toEqual({ status: 400, code: 'INVALID_REQUEST' });
    expect(fails(() => call('POST', '/channels/connect', { type: 'discord', account: 'x', return_to: back }))).toEqual({ status: 400, code: 'CHANNEL_CONNECT_UNSUPPORTED' });
  });
});

describe('WooCommerce built-in tools', () => {
  it('are available only with an active WooCommerce channel, and not because of a Shopify one', () => {
    expect(builtIns().map((t) => [t.name, t.available])).toEqual([
      ['woocommerce_order_status', false],
      ['woocommerce_product_search', false],
    ]);
    call('POST', '/channels/connect', { type: 'shopify', account: 'demo-store', return_to: back });
    expect(builtIns().every((t) => !t.available)).toBe(true);
    connect('demo-shop.example.com');
    expect(builtIns().every((t) => t.available)).toBe(true);
    call('PATCH', `/channels/${stores()[0].id}`, { enabled: false });
    expect(builtIns().every((t) => !t.available && t.unavailable_reason === 'Connect a WooCommerce store to this bot.')).toBe(true);
  });

  it("can't be named by an API tool", () => {
    expect(fails(() => call('POST', '/tools', { name: 'woocommerce_refunds', description: 'x', method: 'GET', url: 'https://x.example' }))).toMatchObject({ code: 'INVALID_TOOL' });
  });

  it('answers an order only when the email matches', () => {
    connect('demo-shop.example.com');
    const ok = call('POST', '/tools/woocommerce_order_status/test', { arguments: { order_number: '#1001', email: 'maya.fernandez@example.com' } });
    expect(ok.output).toContain('completed');
    const wrong = call('POST', '/tools/woocommerce_order_status/test', { arguments: { order_number: '1001', email: 'someone@example.com' } });
    expect(wrong.output).toContain('No order matches');
    const products = call('POST', '/tools/woocommerce_product_search/test', { arguments: { query: 'skillet' } });
    expect(products.output).toContain('demo-store.example.com/product/skillet-12');
  });
});

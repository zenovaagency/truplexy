import { describe, expect, it } from 'vitest';
import { CONNECT_ERRORS, connectErrorMessage, connectReturnTo, readConnectReturn, shopifyToolsUnavailable, storeFieldError, withShopifyTools } from './shopify';
import type { Tool } from '@/lib/api/types';

const q = (s: string) => new URLSearchParams(s);

describe('connectReturnTo', () => {
  it('comes back to this page on this origin, keeping its own query', () => {
    expect(connectReturnTo('http://localhost:5173/integrations/guides?tab=business')).toBe('http://localhost:5173/integrations/guides?tab=business');
    expect(connectReturnTo('https://preview-12.truplexy.app/integrations')).toBe('https://preview-12.truplexy.app/integrations');
  });

  it('leaves out the parameters of an earlier return', () => {
    const back = new URL(connectReturnTo('https://app.test/integrations/guides?connected=shopify&channel_id=chn_1&type=shopify&connect_error=denied&shopify_shop=a.myshopify.com&tab=x#top'));
    expect([...back.searchParams.keys()]).toEqual(['tab']);
    expect(back.hash).toBe('');
  });
});

describe('readConnectReturn', () => {
  it('reads a success', () => {
    expect(readConnectReturn(q('connected=shopify&channel_id=chn_1&type=shopify'))).toEqual({ ok: true, channelId: 'chn_1' });
    // The docs' summary leaves type off the success URL.
    expect(readConnectReturn(q('connected=shopify&channel_id=chn_1'))).toEqual({ ok: true, channelId: 'chn_1' });
  });

  it('reads a failure only with type=shopify', () => {
    expect(readConnectReturn(q('connect_error=denied&type=shopify'))).toEqual({ ok: false, code: 'denied' });
    expect(readConnectReturn(q('connect_error=denied'))).toBeNull();
  });

  it("ignores another feature's connected parameter", () => {
    expect(readConnectReturn(q('connected=1'))).toBeNull();
    expect(readConnectReturn(q('connected=shopify&type=zendesk'))).toBeNull();
    expect(readConnectReturn(q('tab=x'))).toBeNull();
  });
});

describe('connect errors', () => {
  it('has a message for each documented code, and falls back to failed', () => {
    for (const code of ['denied', 'expired', 'invalid', 'store_connected_elsewhere', 'scopes_missing', 'failed']) expect(CONNECT_ERRORS[code]).toBeTruthy();
    expect(connectErrorMessage('something_new')).toBe(CONNECT_ERRORS.failed);
  });
});

describe('storeFieldError', () => {
  it('only checks for empty and spaces; the API checks the rest', () => {
    expect(storeFieldError('')).toBeTruthy();
    expect(storeFieldError('   ')).toBeTruthy();
    expect(storeFieldError('my store')).toBeTruthy();
    for (const ok of ['your-store', 'your-store.myshopify.com', 'https://admin.shopify.com/store/your-store', ' padded ']) expect(storeFieldError(ok)).toBeNull();
  });
});

describe('Shopify tools', () => {
  const tool = (name: string, available: boolean, built_in = true) => ({ name, available, built_in }) as Tool;

  it('adds both names once, within the 20-tool limit', () => {
    expect(withShopifyTools(['lookup_order', 'shopify_order_status'])).toEqual(['lookup_order', 'shopify_order_status', 'shopify_product_search']);
    expect(withShopifyTools(undefined)).toEqual(['shopify_order_status', 'shopify_product_search']);
    expect(withShopifyTools(Array.from({ length: 19 }, (_, i) => `t${i}`))).toBeNull();
  });

  it('notices when a store tool is unavailable', () => {
    expect(shopifyToolsUnavailable([tool('shopify_order_status', true), tool('shopify_product_search', true)])).toBe(false);
    expect(shopifyToolsUnavailable([tool('shopify_order_status', false)])).toBe(true);
    expect(shopifyToolsUnavailable([tool('shopify_lookalike', false, false)])).toBe(false);
    expect(shopifyToolsUnavailable(undefined)).toBe(false);
  });
});

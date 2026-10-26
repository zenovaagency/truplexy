import { describe, expect, it } from 'vitest';
import type { Tool } from '@/lib/api/types';
import { withStoreTools } from './shopify';
import { WOOCOMMERCE_TOOLS, readWooConnectReturn, siteFieldError, storeToolPlatform, wooCommerceToolsUnavailable, wooConnectErrorMessage } from './woocommerce';

const tool = (name: string, available: boolean, built_in = true) => ({ name, built_in, available }) as Tool;

describe('readWooConnectReturn', () => {
  it('reads a successful return, with or without the type', () => {
    expect(readWooConnectReturn(new URLSearchParams('connected=woocommerce&channel_id=chn_1&type=woocommerce'))).toEqual({ ok: true, channelId: 'chn_1' });
    expect(readWooConnectReturn(new URLSearchParams('connected=woocommerce&channel_id=chn_1'))).toEqual({ ok: true, channelId: 'chn_1' });
  });

  it('reads a failed return only for WooCommerce', () => {
    expect(readWooConnectReturn(new URLSearchParams('connect_error=denied&type=woocommerce'))).toEqual({ ok: false, code: 'denied' });
    expect(readWooConnectReturn(new URLSearchParams('connect_error=denied&type=shopify'))).toBeNull();
    expect(readWooConnectReturn(new URLSearchParams('connected=shopify&type=shopify'))).toBeNull();
    expect(readWooConnectReturn(new URLSearchParams('tab=x'))).toBeNull();
  });
});

describe('siteFieldError', () => {
  it('asks for an https address', () => {
    expect(siteFieldError('')).not.toBeNull();
    expect(siteFieldError('my shop.com')).not.toBeNull();
    expect(siteFieldError('http://shop.example.com')).toMatch(/https/);
    expect(siteFieldError('localhost')).not.toBeNull();
    expect(siteFieldError('shop.example.com')).toBeNull();
    expect(siteFieldError(' https://shop.example.com/store ')).toBeNull();
  });
});

describe('tools', () => {
  it('names the platform of a built-in store tool', () => {
    expect(storeToolPlatform(tool('woocommerce_order_status', true))).toBe('WooCommerce');
    expect(storeToolPlatform(tool('shopify_order_status', true))).toBe('Shopify');
    expect(storeToolPlatform(tool('truplexy_product_search', true))).toBeNull();
    expect(storeToolPlatform(tool('woocommerce_custom', true, false))).toBeNull();
  });

  it('sees lost access only on WooCommerce tools', () => {
    expect(wooCommerceToolsUnavailable([tool('woocommerce_order_status', false)])).toBe(true);
    expect(wooCommerceToolsUnavailable([tool('woocommerce_order_status', true), tool('shopify_order_status', false)])).toBe(false);
    expect(wooCommerceToolsUnavailable(undefined)).toBe(false);
  });

  it('adds the store tools once, within the 20-tool limit', () => {
    expect(withStoreTools(['lookup'], WOOCOMMERCE_TOOLS)).toEqual(['lookup', 'woocommerce_order_status', 'woocommerce_product_search']);
    expect(withStoreTools(['woocommerce_order_status'], WOOCOMMERCE_TOOLS)).toEqual(['woocommerce_order_status', 'woocommerce_product_search']);
    expect(withStoreTools(Array.from({ length: 19 }, (_, i) => `t${i}`), WOOCOMMERCE_TOOLS)).toBeNull();
  });

  it('explains each connect error', () => {
    for (const code of ['denied', 'expired', 'invalid', 'store_connected_elsewhere', 'scopes_missing', 'failed']) expect(wooConnectErrorMessage(code)).toBeTruthy();
    expect(wooConnectErrorMessage('unheard-of')).toBe(wooConnectErrorMessage('failed'));
  });
});

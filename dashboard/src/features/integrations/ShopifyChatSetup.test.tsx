import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelWidget } from '@/lib/api/types';
import { button, cleanup, click, json, renderPage, text, type FakeApi } from '@/test-utils';
import { ShopifyChatSetup } from './ShopifyChatSetup';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

const state = (more: Partial<ChannelWidget> = {}): ChannelWidget => ({
  channel_id: 'chn_1',
  enabled: true,
  first_seen_at: '',
  last_seen_at: '',
  shop: 'acme.myshopify.com',
  activation_url: 'https://acme.myshopify.com/admin/themes/current/editor?context=apps&activateAppId=cid/chat-embed',
  ...more,
});

let saved: ChannelWidget;
let closed = 0;

const api: FakeApi = (call) => {
  if (call.path === '/channels/chn_1/widget' && call.method === 'GET') return json(200, saved);
  if (call.path === '/channels/chn_1/widget' && call.method === 'PUT') {
    saved = { ...saved, enabled: (call.body as { enabled: boolean }).enabled };
    return json(200, saved);
  }
  return undefined;
};

const mount = (permissions?: Parameters<typeof renderPage>[3]) =>
  renderPage([{ path: '/', element: <ShopifyChatSetup channelId="chn_1" fresh onClose={() => closed++} /> }], '/', api, permissions);

beforeEach(() => {
  saved = state();
  closed = 0;
});
afterEach(cleanup);

describe('ShopifyChatSetup', () => {
  it('opens on the steps to turn the chat on in the theme, with a way to customize it', async () => {
    await mount();
    expect(text()).toContain('Show the chat on your store');
    expect(text()).toContain('One more step in Shopify');
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes('Open the theme editor'));
    expect(link?.getAttribute('href')).toBe(saved.activation_url);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    const customize = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes('Customize how it looks'));
    expect(customize?.getAttribute('href')).toBe('/integrations/widget');
    await click(button('Done'));
    expect(closed).toBe(1);
  });

  it('says so once a page of the store has loaded the window', async () => {
    saved = state({ first_seen_at: '2026-10-25T10:00:00Z', last_seen_at: '2026-10-25T10:00:00Z' });
    await mount();
    expect(text()).toContain('Live on your store');
    expect(text()).not.toContain('One more step in Shopify');
  });

  it('hides the window from the store when switched off, and drops the steps', async () => {
    const { calls } = await mount();
    await click(document.querySelector('[role="switch"]'));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ enabled: false });
    expect(text()).toContain('The chat is hidden on your store');
    expect([...document.querySelectorAll('a')].some((a) => a.textContent?.includes('Open the theme editor'))).toBe(false);
  });

  it('cannot be switched without channels.write', async () => {
    const { calls } = await mount(['channels.read']);
    expect((document.querySelector('[role="switch"]') as HTMLButtonElement).disabled).toBe(true);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });
});

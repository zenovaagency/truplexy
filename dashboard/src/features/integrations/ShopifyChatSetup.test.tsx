import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelWidget } from '@/lib/api/types';
import { WIDGET_DEFAULTS } from '@/lib/shopify';
import { button, cleanup, click, field, json, renderPage, text, type FakeApi } from '@/test-utils';
import { ShopifyChatSetup } from './ShopifyChatSetup';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));
// The preview loads the widget script, which the test environment doesn't run.
vi.mock('./WidgetPreview', () => ({ WidgetPreview: () => null }));

const widget = (more: Partial<ChannelWidget> = {}): ChannelWidget => ({
  channel_id: 'chn_1',
  enabled: true,
  settings: { ...WIDGET_DEFAULTS },
  defaults: { ...WIDGET_DEFAULTS },
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
    const body = call.body as { enabled?: boolean; settings: ChannelWidget['settings'] };
    if (body.settings.heading === 'refused') return json(400, { error: { code: 'INVALID_REQUEST', message: 'Keep the heading short.', request_id: 'r' } });
    saved = { ...saved, enabled: body.enabled ?? saved.enabled, settings: body.settings };
    return json(200, saved);
  }
  return undefined;
};

const mount = (permissions?: Parameters<typeof renderPage>[3], fresh = true) =>
  renderPage([{ path: '/', element: <ShopifyChatSetup channelId="chn_1" fresh={fresh} onClose={() => closed++} /> }], '/', api, permissions);

beforeEach(() => {
  saved = widget();
  closed = 0;
});
afterEach(cleanup);

describe('ShopifyChatSetup', () => {
  it('opens on the saved settings, and saves what the person chose', async () => {
    const { calls } = await mount();
    expect(text()).toContain('Customize your chat window');
    expect(text()).toContain('acme.myshopify.com is connected');
    expect((field('Title') as HTMLInputElement).value).toBe('');

    const { type } = await import('@/test-utils');
    await type(field('Title'), 'Acme help');
    await type(field('Greeting'), 'Hi! Ask me about orders.');
    await type(document.querySelector('input[aria-label="Colour code"]'), '#AA3366');
    await click([...document.querySelectorAll('[role="radio"]')].find((r) => r.textContent === 'Left'));
    await click(button('Save and continue'));

    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.path).toBe('/channels/chn_1/widget');
    expect(put?.body).toMatchObject({
      enabled: true,
      settings: { heading: 'Acme help', greeting: 'Hi! Ask me about orders.', accent: '#aa3366', position: 'left', theme: 'light', details: 'ask' },
    });
    // Next: turn it on in the theme.
    expect(text()).toContain('Show it on your store');
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes('Open the theme editor'));
    expect(link?.getAttribute('href')).toBe(saved.activation_url);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(text()).toContain('One more step in Shopify');
  });

  it('says so once a page of the store has loaded the window', async () => {
    saved = widget({ first_seen_at: '2026-10-25T10:00:00Z', last_seen_at: '2026-10-25T10:00:00Z' });
    await mount(undefined, false);
    await click(button('Continue'));
    expect(text()).toContain('Live on your store');
    expect(text()).not.toContain('One more step in Shopify');
    await click(button('Done'));
    expect(closed).toBe(1);
  });

  it("doesn't ask the API to save what breaks a rule, and shows what the API refuses", async () => {
    const { calls } = await mount();
    const { type } = await import('@/test-utils');
    await type(document.querySelector('input[aria-label="Colour code"]'), 'red');
    await click(button('Save and continue'));
    expect(text()).toContain('Pick a colour, such as #2338e6.');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);

    await type(document.querySelector('input[aria-label="Colour code"]'), '#112233');
    await type(field('Title'), 'refused');
    await click(button('Save and continue'));
    expect(text()).toContain("That couldn't be saved");
    expect(text()).toContain('Keep the heading short.');
    expect(text()).toContain('Customize your chat window');
  });

  it('keeps the window hidden when the person switched it off', async () => {
    saved = widget({ enabled: false });
    await mount();
    await click(button('Continue'));
    expect(text()).toContain('Your chat window is hidden');
    expect([...document.querySelectorAll('a')].some((a) => a.textContent?.includes('Open the theme editor'))).toBe(false);
  });

  it('is read-only without channels.write', async () => {
    const { calls } = await mount(['channels.read']);
    expect(text()).toContain('Only admins can change this');
    expect(field('Title')?.closest('fieldset')?.disabled).toBe(true);
    await click(button('Continue'));
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    expect(text()).toContain('Show it on your store');
  });

  it('resets the form to the defaults', async () => {
    saved = widget({ settings: { ...WIDGET_DEFAULTS, heading: 'Acme help', position: 'left' } });
    await mount();
    expect((field('Title') as HTMLInputElement).value).toBe('Acme help');
    await click(button('Reset to defaults'));
    expect((field('Title') as HTMLInputElement).value).toBe('');
  });
});

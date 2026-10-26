import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Channel, ChannelWidget, Widget } from '@/lib/api/types';
import { WIDGET_DEFAULTS } from '@/lib/widget';
import { button, cleanup, click, field, json, renderPage, text, type, type FakeApi } from '@/test-utils';
import { WidgetTab } from './WidgetTab';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));
// The preview loads the widget script, which the test environment doesn't run.
vi.mock('./WidgetPreview', () => ({ WidgetPreview: ({ settings, pictureUrl }: any) => <div data-testid="preview">{settings.heading}|{settings.accent}|{pictureUrl}</div> }));

let saved: Widget;
let stores: Channel[];
const store = (): Channel => ({
  id: 'chn_1', tenant_id: 'acme', bot_id: 'support', type: 'shopify', type_label: 'Shopify', name: 'Acme Store', description: '', external_id: 'acme.myshopify.com',
  enabled: true, disabled_by_platform: false, active: true, open_tickets: 0, tickets: 0, api_keys: 0, auto_close_hours: null, effective_auto_close_hours: 0, created_at: '', updated_at: '',
});
const channelState: ChannelWidget = { channel_id: 'chn_1', enabled: true, first_seen_at: '', last_seen_at: '', shop: 'acme.myshopify.com', activation_url: 'https://acme.myshopify.com/admin/themes/current/editor' };

const api: FakeApi = (call) => {
  if (call.path === '/widget' && call.method === 'GET') return json(200, saved);
  if (call.path === '/widget' && call.method === 'PUT') {
    const body = call.body as { settings: Widget['settings'] };
    if (body.settings.heading === 'refused') return json(400, { error: { code: 'INVALID_REQUEST', message: 'Keep the heading short.', request_id: 'r' } });
    saved = { ...saved, settings: body.settings };
    return json(200, saved);
  }
  if (call.path === '/widget/picture' && call.method === 'DELETE') {
    saved = { ...saved, picture_url: '' };
    return json(200, { picture_url: null });
  }
  if (call.path === '/channels') return json(200, { data: stores });
  if (call.path === '/channels/chn_1/widget') return json(200, channelState);
  return undefined;
};

/** A radio by its text, or by its name when it is a colour swatch. */
const radio = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((r) => r.textContent === name || r.getAttribute('aria-label') === name);
const colourCode = () => document.querySelector('input[aria-label="Colour code"]');

const mount = (permissions?: Parameters<typeof renderPage>[3]) => renderPage([{ path: '/', element: <WidgetTab /> }], '/', api, permissions);

beforeEach(() => {
  saved = { settings: { ...WIDGET_DEFAULTS }, defaults: { ...WIDGET_DEFAULTS }, picture_url: '' };
  stores = [];
});
afterEach(cleanup);

describe('Integrations → Chat widget', () => {
  it('shows the saved settings and a preview of them', async () => {
    saved = { ...saved, settings: { ...WIDGET_DEFAULTS, heading: 'Acme help', accent: '#c2410c' }, picture_url: 'https://img.test/h.png' };
    await mount();
    expect((field('Title') as HTMLInputElement).value).toBe('Acme help');
    expect(document.querySelector('[data-testid="preview"]')?.textContent).toBe('Acme help|#c2410c|https://img.test/h.png');
    expect(text()).toContain('All changes saved');
    expect(button('Save')?.disabled).toBe(true);
  });

  it('saves what was changed, trimmed, and is clean again afterwards', async () => {
    const { calls } = await mount();
    await type(field('Title'), '  Acme help ');
    await type(field('Greeting'), 'Welcome in!');
    await click(radio('Custom'));
    await type(colourCode(), '#AA3366');
    await click(radio('Left'));
    expect(text()).toContain('Unsaved changes');
    await click(button('Save'));
    const put = calls.find((c) => c.method === 'PUT' && c.path === '/widget');
    expect(put?.body).toEqual({ settings: { ...WIDGET_DEFAULTS, heading: 'Acme help', greeting: 'Welcome in!', accent: '#aa3366', position: 'left' } });
    expect(text()).toContain('All changes saved');
  });

  it('holds back what breaks a rule, and shows what the API refuses', async () => {
    const { calls } = await mount();
    await click(radio('Custom'));
    await type(colourCode(), 'red');
    await click(button('Save'));
    expect(text()).toContain('Pick a colour, such as #2338e6.');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await type(colourCode(), '#112233');
    await type(field('Title'), 'refused');
    await click(button('Save'));
    expect(text()).toContain("That couldn't be saved");
    expect(text()).toContain('Keep the heading short.');
    expect(text()).toContain('Unsaved changes');
  });

  it('picks a ready-made colour, with the code box only for Custom', async () => {
    const { calls } = await mount();
    expect(radio('Indigo')?.getAttribute('aria-checked')).toBe('true');
    expect(colourCode()).toBeNull();
    await click(radio('Teal'));
    expect(radio('Teal')?.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[data-testid="preview"]')?.textContent).toBe('|#0f766e|');
    await click(button('Save'));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ settings: { ...WIDGET_DEFAULTS, accent: '#0f766e' } });
  });

  it('shows a saved colour that is not ready-made as Custom, and warns when white text is hard to read', async () => {
    saved = { ...saved, settings: { ...WIDGET_DEFAULTS, accent: '#c2410c' } };
    await mount();
    expect(radio('Custom')?.getAttribute('aria-checked')).toBe('true');
    expect((colourCode() as HTMLInputElement).value).toBe('#c2410c');
    expect(text()).not.toContain('hard to read');
    await type(colourCode(), '#ffee88');
    expect(text()).toContain('White text is hard to read on this colour');
  });

  it('resets the form to the defaults without saving', async () => {
    saved = { ...saved, settings: { ...WIDGET_DEFAULTS, heading: 'Acme help', position: 'left' } };
    const { calls } = await mount();
    await click(radio('Custom'));
    await click(button('Reset to defaults'));
    expect((field('Title') as HTMLInputElement).value).toBe('');
    expect(radio('Indigo')?.getAttribute('aria-checked')).toBe('true');
    expect(colourCode()).toBeNull();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    expect(text()).toContain('Unsaved changes');
  });

  it('is read-only without bot.write', async () => {
    const { calls } = await mount(['bot.read', 'integrations.read']);
    expect(text()).toContain('Only editors and above can change this');
    expect(field('Title')?.closest('fieldset')?.disabled).toBe(true);
    expect(radio('Teal')?.disabled).toBe(true);
    expect(button('Save')?.disabled).toBe(true);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('lists every place it shows, and the connected stores with their status', async () => {
    stores = [store()];
    await mount();
    for (const name of ['Your website', 'WordPress & WooCommerce', 'Shopify']) expect(text()).toContain(name);
    const links = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/integrations/guides?guide=wordpress');
    expect(text()).toContain('acme.myshopify.com');
    expect(text()).toContain('One more step in Shopify');
  });

  it('offers to connect a store when there is none', async () => {
    await mount();
    expect(text()).toContain('Connect a store');
  });

  it('removes the header picture', async () => {
    saved = { ...saved, picture_url: 'https://img.test/h.png' };
    const { calls } = await mount();
    await click(button('Remove'));
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/widget/picture')).toBe(true);
  });
});

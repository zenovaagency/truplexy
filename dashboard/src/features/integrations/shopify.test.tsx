import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import type { Channel, ChannelType, Tool } from '@/lib/api/types';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { CONNECT_ERRORS } from '@/lib/shopify';
import { notifySuccess } from '@/lib/notify';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import { CatalogTab, ChannelsTab } from './IntegrationsPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const apiError = (status: number, code: string, message = 'No.') => json(status, { error: { code, message, request_id: 'req_t' } });

const TYPES: ChannelType[] = [
  { id: 'website', label: 'Website', description: '', icon: 'website', offered: true },
  { id: 'shopify', label: 'Shopify', description: '', icon: 'shopify', offered: true },
  { id: 'whatsapp', label: 'WhatsApp', description: '', icon: 'whatsapp', offered: true },
];

const channel = (more: Partial<Channel> = {}): Channel => ({
  id: 'chn_1',
  tenant_id: 'acme',
  bot_id: 'support',
  type: 'shopify',
  type_label: 'Shopify',
  name: 'Acme Store',
  description: '',
  external_id: 'acme.myshopify.com',
  enabled: true,
  disabled_by_platform: false,
  active: true,
  open_tickets: 0,
  tickets: 0,
  api_keys: 0,
  auto_close_hours: null,
  effective_auto_close_hours: 0,
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
  ...more,
});

const builtIn = (name: string, available: boolean): Tool => ({
  name,
  description: name,
  parameters: { type: 'object', properties: {} },
  read_only: true,
  built_in: true,
  available,
  unavailable_reason: available ? undefined : 'Connect a Shopify store to this bot.',
  api: { method: 'GET', url: '', created_at: '', updated_at: '' },
});

interface Setup {
  types?: ChannelType[];
  channels?: Channel[];
  tools?: Tool[];
  connect?: () => Response;
  save?: (body: any) => Response;
  can?: (p: string) => boolean;
}

let root: Root | undefined;
let container: HTMLDivElement;
let calls: { method: string; path: string; body: any }[] = [];
let qc: QueryClient;
let assign: ReturnType<typeof vi.fn<(url: string | URL) => void>>;
let location = '';

beforeEach(() => {
  (window as any).happyDOM.setURL('https://app.test/integrations/guides?tab=business');
  assign = vi.fn<(url: string | URL) => void>();
  vi.spyOn(window.location, 'assign').mockImplementation(assign);
  vi.mocked(notifySuccess).mockClear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  configureApi({ transport: (req) => fetch(req) });
});

const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

function LocationProbe() {
  location = useLocation().search;
  return null;
}

async function render(tab: 'catalog' | 'channels', url: string, s: Setup = {}) {
  calls = [];
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const path = new URL(req.url).pathname.replace(/^\/v3/, '');
      const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await req.json().catch(() => undefined);
      calls.push({ method: req.method, path, body });
      if (path === '/channel-types') return json(200, { data: s.types ?? TYPES });
      if (path === '/channels') return json(200, { data: s.channels ?? [] });
      if (path === '/tools') return json(200, { data: s.tools ?? [], database_configured: true });
      if (path === '/api-keys') return json(200, { data: [] });
      if (path === '/webhook') return apiError(404, 'WEBHOOK_NOT_FOUND');
      if (path === '/channels/connect') return s.connect?.() ?? json(200, { url: 'https://acme.myshopify.com/admin/oauth/authorize?x=1' });
      if (path.startsWith('/channels/') && req.method === 'DELETE') return json(204, null);
      if (path === '/workspace' && req.method === 'GET') return json(200, workspace(calls.filter((c) => c.path === '/workspace' && c.method === 'GET').length));
      if (path === '/workspace' && req.method === 'PUT') return s.save?.(body) ?? json(200, { ...workspace(1), bot: body.bot, revision: body.revision + 1 });
      return apiError(404, 'NOT_FOUND');
    },
  });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ctx = {
    scope: { tenant: 'acme', bot: 'support' },
    bot: { id: 'support', name: 'Aria' },
    bots: [],
    href: (p = '') => `/${p}`,
    can: s.can ?? (() => true),
  } as unknown as ScopeContextValue;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[url]}>
        <QueryClientProvider client={qc}>
          <ScopeContext.Provider value={ctx}>
            <TooltipProvider>
              <ConfirmProvider>
                <LocationProbe />
                {tab === 'catalog' ? <CatalogTab /> : <ChannelsTab />}
              </ConfirmProvider>
            </TooltipProvider>
          </ScopeContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
  });
  await tick();
  await tick();
}

/** Dialogs render in a portal, so look in the whole document. */
const page = () => document.body.textContent ?? '';
const buttons = (name: string) => [...document.body.querySelectorAll('button')].filter((b) => b.textContent?.trim() === name);
const button = (name: string) => buttons(name)[0] as HTMLButtonElement;
const click = async (el: HTMLElement) => {
  await act(async () => el.click());
  await tick();
};
const storeInput = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Your store"]')!;
async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const connects = () => calls.filter((c) => c.path === '/channels/connect');
/** The bot as saved; each read is one revision newer, as if a teammate keeps saving. */
const workspace = (revision: number) => ({ name: 'Aria', modelSelection: 'platform', bot: { name: 'Aria', toolsEnabled: false, tools: ['lookup_order'] }, revision, history: [], defaults: { name: 'Aria', bot: { name: 'Aria' } } });
const SHOPIFY_TOOLS_LISTED = [builtIn('shopify_order_status', true), builtIn('shopify_product_search', true)];

async function connectWith(store: string) {
  await click(button('Connect'));
  await type(storeInput(), store);
  await click(button('Continue to Shopify'));
}

describe('connecting a Shopify store', () => {
  it('sends type, account and return_to on this page, then goes to Shopify in this tab', async () => {
    await render('catalog', '/integrations/guides?tab=business');
    await connectWith('acme.myshopify.com');
    expect(connects()).toHaveLength(1);
    expect(connects()[0]!.body).toEqual({ type: 'shopify', account: 'acme.myshopify.com', return_to: 'https://app.test/integrations/guides?tab=business' });
    expect(assign).toHaveBeenCalledWith('https://acme.myshopify.com/admin/oauth/authorize?x=1');
    // The page is about to leave: the button stays busy.
    expect(button('Continue to Shopify').disabled).toBe(true);
  });

  it("checks only that the store isn't empty and has no spaces", async () => {
    await render('catalog', '/integrations/guides');
    await click(button('Connect'));
    expect(button('Continue to Shopify').disabled).toBe(true);
    await type(storeInput(), 'my store');
    expect(button('Continue to Shopify').disabled).toBe(true);
    expect(page()).toContain('no spaces');
    await type(storeInput(), 'https://admin.shopify.com/store/my-store');
    expect(button('Continue to Shopify').disabled).toBe(false);
  });

  it.each([
    ['INVALID_REQUEST', 400, "Set account to your store's address, such as your-store.myshopify.com."],
    ['CHANNEL_TYPE_NOT_ALLOWED', 400, "Shopify isn't available for this bot right now."],
    ['CHANNEL_CONNECT_UNSUPPORTED', 400, "Couldn't start connecting"],
  ])('shows %s and lets the person try again', async (code, status, shown) => {
    await render('catalog', '/integrations/guides', { connect: () => apiError(status, code, "Set account to your store's address, such as your-store.myshopify.com.") });
    await connectWith('nope');
    expect(page()).toContain(shown);
    expect(assign).not.toHaveBeenCalled();
    expect(button('Continue to Shopify').disabled).toBe(false);
  });

  it('prefills the store when the install started inside Shopify', async () => {
    await render('catalog', '/integrations/guides?shopify_shop=acme.myshopify.com');
    expect(storeInput().value).toBe('acme.myshopify.com');
    // Still needs Connect pressed, and the parameter doesn't come back on return_to.
    expect(connects()).toHaveLength(0);
    expect(location).toBe('');
  });

  it('hides everything Shopify when GET /channel-types leaves the type out', async () => {
    await render('catalog', '/integrations/guides', { types: TYPES.filter((t) => t.id !== 'shopify') });
    expect(page()).not.toContain('Shopify');
    expect(buttons('Connect')).toHaveLength(0);
  });

  it('shows an upcoming Shopify type without a button', async () => {
    await render('catalog', '/integrations/guides', { types: TYPES.map((t) => (t.id === 'shopify' ? { ...t, offered: false, upcoming: true } : t)) });
    expect(page()).toContain('Upcoming');
    expect(buttons('Connect')).toHaveLength(0);
  });

  it('shows the other marketplace platforms as coming soon', async () => {
    await render('catalog', '/integrations/guides');
    expect(page()).toContain('WhatsApp');
    expect(page()).toContain('Coming soon');
    expect(buttons('Connect')).toHaveLength(1);
  });

  it('asks people without channels.write to ask an admin', async () => {
    await render('catalog', '/integrations/guides', { can: (p) => p !== 'channels.write' });
    expect(buttons('Connect')).toHaveLength(0);
    expect(page()).toContain('Ask an admin to connect');
  });
});

describe('coming back from Shopify', () => {
  it('says the store is connected, reloads channels and tools, and tidies the URL', async () => {
    const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    await render('channels', '/integrations?connected=shopify&channel_id=chn_1&type=shopify&tab=x', { channels: [channel()] });
    expect(notifySuccess).toHaveBeenCalledTimes(1);
    expect(notifySuccess).toHaveBeenCalledWith('Your Shopify store is connected.');
    const keys = spy.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    expect(keys).toContain(JSON.stringify(['bot', 'acme', 'support', 'channels']));
    expect(keys).toContain(JSON.stringify(['bot', 'acme', 'support', 'tools']));
    expect(location).toBe('?tab=x');
    // The store's row is highlighted.
    expect(container.querySelector('tr[aria-selected="true"]')?.textContent).toContain('Acme Store');
  });

  it.each(Object.entries(CONNECT_ERRORS))('shows a banner that stays for %s', async (code, message) => {
    await render('catalog', `/integrations/guides?connect_error=${code}&type=shopify`);
    expect(page()).toContain(message);
    expect(buttons('Try again')).toHaveLength(1);
    expect(location).toBe('');
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it('uses the failed message for a code it doesn’t know', async () => {
    await render('catalog', '/integrations/guides?connect_error=brand_new&type=shopify');
    expect(page()).toContain(CONNECT_ERRORS.failed);
  });

  it('does nothing without type=shopify', async () => {
    await render('catalog', '/integrations/guides?connect_error=denied&connected=1');
    expect(page()).not.toContain("wasn't connected");
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(location).toBe('?connect_error=denied&connected=1');
  });
});

describe('Shopify channels', () => {
  it('reconnects with the store’s external_id', async () => {
    await render('channels', '/integrations', { channels: [channel({ enabled: false, active: false })] });
    expect(container.textContent).toContain('acme.myshopify.com');
    await click(button('Reconnect'));
    expect(connects()[0]!.body).toEqual({ type: 'shopify', account: 'acme.myshopify.com', return_to: 'https://app.test/integrations/guides?tab=business' });
    expect(assign).toHaveBeenCalled();
  });

  it('says "Reconnect your store" when the channel is on but its tools are unavailable', async () => {
    await render('channels', '/integrations', {
      channels: [channel()],
      tools: [builtIn('shopify_order_status', false), builtIn('shopify_product_search', false)],
    });
    expect(container.textContent).toContain('Reconnect your store');
  });

  it('warns that deleting uninstalls the app from the store', async () => {
    await render('channels', '/integrations', { channels: [channel()] });
    await click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Delete Acme Store"]')!);
    expect(page()).toContain('uninstalls the Truplexy app from acme.myshopify.com');
    expect(page()).toContain("Existing tickets keep the channel's name.");
  });
});

describe('turning on the store’s tools', () => {
  const back = '/integrations?connected=shopify&channel_id=chn_1&type=shopify';

  it('adds both tools to the bot and saves it', async () => {
    await render('channels', back, { channels: [channel()], tools: SHOPIFY_TOOLS_LISTED });
    await click(button('Turn on order and product lookups'));
    const saves = calls.filter((c) => c.path === '/workspace' && c.method === 'PUT');
    expect(saves).toHaveLength(1);
    expect(saves[0]!.body.bot).toMatchObject({ toolsEnabled: true, tools: ['lookup_order', 'shopify_order_status', 'shopify_product_search'] });
    expect(saves[0]!.body.revision).toBe(1);
  });

  it('applies the change again on a teammate’s newer save', async () => {
    let n = 0;
    await render('channels', back, {
      channels: [channel()],
      tools: SHOPIFY_TOOLS_LISTED,
      save: (body) => (n++ ? json(200, { ...workspace(3), bot: body.bot }) : apiError(409, 'WORKSPACE_CONFLICT')),
    });
    await click(button('Turn on order and product lookups'));
    await tick();
    const saves = calls.filter((c) => c.path === '/workspace' && c.method === 'PUT');
    expect(saves.map((c) => c.body.revision)).toEqual([1, 2]);
  });

  it('isn’t offered without the tools listed, or without bot.write', async () => {
    await render('channels', back, { channels: [channel()], tools: [] });
    expect(button('Turn on order and product lookups')).toBeUndefined();
    await act(async () => root?.unmount());
    root = undefined;
    document.body.innerHTML = '';
    await render('channels', back, { channels: [channel()], tools: SHOPIFY_TOOLS_LISTED, can: (p) => p !== 'bot.write' });
    expect(button('Turn on order and product lookups')).toBeUndefined();
  });
});

// Last in the file: once the server answers 503, Connect stays off for the rest of the tab's session.
describe('a server without a Shopify app', () => {
  it('turns Connect off for the session when the server has no Shopify app (503)', async () => {
    await render('catalog', '/integrations/guides', { connect: () => apiError(503, 'CHANNEL_CONNECT_UNAVAILABLE') });
    await connectWith('acme');
    expect(page()).toContain("Shopify connections aren't set up on this server yet.");
    expect(button('Continue to Shopify').disabled).toBe(true);
    await click(button('Cancel'));
    expect(button('Connect').disabled).toBe(true);
    sessionStorage.clear();
  });
});

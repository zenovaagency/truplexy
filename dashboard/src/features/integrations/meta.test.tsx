import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import type { Channel, ChannelType, MetaConnection } from '@/lib/api/types';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { metaFieldError } from '@/lib/meta';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import { CatalogTab, ChannelsTab } from './IntegrationsPage';
import { MetaConnectButton } from './meta';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn(), notifyWarning: vi.fn() }));

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const apiError = (status: number, code: string, message = 'No.', field?: string) => json(status, { error: { code, message, request_id: 'req_t', ...(field ? { field } : {}) } });

const TYPES: ChannelType[] = [
  { id: 'website', label: 'Website', description: '', icon: 'website', offered: true },
  { id: 'messenger', label: 'Messenger', description: '', icon: 'messenger', offered: true },
  { id: 'instagram', label: 'Instagram', description: '', icon: 'instagram', offered: true },
];

const channel = (more: Partial<Channel> = {}): Channel => ({
  id: 'chn_fb',
  tenant_id: 'acme',
  bot_id: 'support',
  type: 'messenger',
  type_label: 'Messenger',
  name: 'Acme Messenger',
  description: '',
  external_id: '104857600012345',
  enabled: true,
  disabled_by_platform: false,
  active: true,
  open_tickets: 0,
  tickets: 0,
  api_keys: 0,
  auto_close_hours: null,
  effective_auto_close_hours: 0,
  created_at: '2026-11-10T10:00:00Z',
  updated_at: '2026-11-10T10:00:00Z',
  ...more,
});

const account = (more: Partial<MetaConnection> = {}): MetaConnection => ({
  channel: channel(),
  provider: 'messenger',
  page_id: '104857600012345',
  account_id: '104857600012345',
  account_name: 'Acme Goods',
  webhook_url: 'https://api.test/v1/channels/meta/webhooks/chn_fb',
  verify_token: 'tpx_0123456789abcdef0123456789abcdef',
  ...more,
});

interface Setup {
  channels?: Channel[];
  connect?: (body: any) => Response;
  status?: () => Response;
  can?: (p: string) => boolean;
  provider?: 'messenger' | 'instagram';
}

let root: Root | undefined;
let calls: { method: string; path: string; body: any }[] = [];

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  configureApi({ transport: (req) => fetch(req) });
});

beforeEach(() => {
  calls = [];
});

const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function render(tab: 'catalog' | 'channels' | 'connect', s: Setup = {}) {
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const path = new URL(req.url).pathname.replace(/^\/v3/, '');
      const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await req.json().catch(() => undefined);
      calls.push({ method: req.method, path, body });
      if (path === '/channel-types') return json(200, { data: TYPES });
      if (path === '/channels') return json(200, { data: s.channels ?? [] });
      if (path === '/tools') return json(200, { data: [], database_configured: true });
      if (path === '/api-keys') return json(200, { data: [] });
      if (path === '/channels/messenger' || path === '/channels/instagram') return s.connect?.(body) ?? json(201, account());
      if (/^\/channels\/[^/]+\/(messenger|instagram)$/.test(path)) return s.status?.() ?? json(200, account());
      return apiError(404, 'NOT_FOUND');
    },
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ctx = {
    scope: { tenant: 'acme', bot: 'support' },
    bot: { id: 'support', name: 'Aria' },
    bots: [],
    href: (p = '') => `/${p}`,
    can: s.can ?? (() => true),
  } as unknown as ScopeContextValue;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={['/integrations']}>
        <QueryClientProvider client={qc}>
          <ScopeContext.Provider value={ctx}>
            <TooltipProvider>
              <ConfirmProvider>
                {tab === 'catalog' ? <CatalogTab /> : tab === 'channels' ? <ChannelsTab /> : <MetaConnectButton provider={s.provider ?? 'messenger'} />}
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

const page = () => document.body.textContent ?? '';
const button = (name: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement;
/** The sheet's own submit button. */
const submit = (name = 'Connect Messenger') => [...document.body.querySelectorAll('button')].filter((b) => b.textContent?.trim() === name).at(-1) as HTMLButtonElement;
const input = (label: string) => document.body.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const click = async (el: HTMLElement) => {
  await act(async () => el.click());
  await tick();
};
async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const SECRET = '0123456789abcdef0123456789abcdef';
async function fill() {
  await type(input('Page ID'), ' 104857600012345 ');
  await type(input('Access token'), 'EAAG' + 'x'.repeat(40));
  await type(input('App secret'), SECRET);
}
const connects = (provider = 'messenger') => calls.filter((c) => c.path === `/channels/${provider}`);

describe('the catalog', () => {
  it('offers to connect a Facebook Page and an Instagram account', async () => {
    await render('catalog');
    expect(page()).toContain('Messenger');
    expect(page()).toContain('Instagram');
    expect(button('Connect Page')).toBeTruthy();
    expect(button('Connect account')).toBeTruthy();
  });
});

describe('connecting a Facebook Page', () => {
  it('walks through Meta, sends the three values, then shows the webhook settings', async () => {
    await render('connect');
    await click(button('Connect Page'));
    expect(page()).toContain('Set up in Meta');
    expect(page()).toContain('pages_messaging');
    expect(page()).not.toContain('instagram_manage_messages');
    await fill();
    await click(submit());
    expect(connects()).toHaveLength(1);
    expect(connects()[0]!.body).toEqual({ page_id: '104857600012345', access_token: 'EAAG' + 'x'.repeat(40), app_secret: SECRET });
    expect(page()).toContain('Acme Goods is connected');
    expect(page()).toContain('https://api.test/v1/channels/meta/webhooks/chn_fb');
    expect(page()).toContain('Waiting for Meta to check the webhook');
    expect(page()).not.toContain('tpx_0123');
  });

  it('notices Meta checking the webhook', async () => {
    await render('connect', { status: () => json(200, account({ webhook_verified_at: '2026-11-10T10:01:00Z' })) });
    await click(button('Connect Page'));
    await fill();
    await click(submit());
    await tick();
    expect(page()).toContain('Webhook verified');
  });

  it("catches a Page's address pasted for its ID before asking Meta", async () => {
    await render('connect');
    await click(button('Connect Page'));
    await fill();
    await type(input('Page ID'), 'facebook.com/acmegoods');
    await click(submit());
    expect(connects()).toHaveLength(0);
    expect(page()).toContain("That's the Page's name or address");
  });

  it.each([
    [apiError(400, 'INVALID_REQUEST', "The token can't manage this Page.", 'access_token'), "The token can't manage this Page."],
    [apiError(409, 'META_ACCOUNT_TAKEN', 'This Facebook Page is already connected to another bot.'), 'already connected to another bot'],
    [apiError(502, 'META_UNAVAILABLE'), "Meta couldn't be reached"],
    [apiError(503, 'CHANNEL_CONNECT_UNAVAILABLE'), "Messenger and Instagram connections aren't set up on this server yet."],
  ])('shows a refusal in the form (%#)', async (res, shown) => {
    await render('connect', { connect: () => res.clone() });
    await click(button('Connect Page'));
    await fill();
    await click(submit());
    expect(page()).toContain(shown);
    expect(input('App secret')).toBeTruthy();
  });

  it('asks people without channels.write to ask an admin', async () => {
    await render('connect', { can: (p) => p !== 'channels.write' });
    expect(button('Connect Page')).toBeUndefined();
    expect(page()).toContain('Ask an admin to connect');
  });
});

describe('connecting an Instagram account', () => {
  it('explains linking the account to a Page and allowing access to messages', async () => {
    await render('connect', {
      provider: 'instagram',
      connect: () =>
        json(201, account({ provider: 'instagram', account_id: '17841400000000001', account_name: 'Acme', username: 'acmegoods', channel: channel({ type: 'instagram' }) })),
    });
    await click(button('Connect account'));
    expect(page()).toContain('Allow access to messages');
    expect(page()).toContain('instagram_manage_messages');
    await fill();
    await click(submit('Connect Instagram'));
    expect(connects('instagram')).toHaveLength(1);
    expect(page()).toContain('@acmegoods is connected');
  });
});

describe('a connected Page in the channels table', () => {
  it('needs no key, and its sheet shows the Page and webhook settings', async () => {
    await render('channels', { channels: [channel()], status: () => json(200, account({ last_event_at: new Date().toISOString() })) });
    await click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Edit Acme Messenger"]')!);
    expect(page()).toContain('Receiving messages');
    expect(page()).toContain('Connected to Acme Goods.');
    expect(button('Update credentials')).toBeTruthy();
  });

  it('shows nothing extra for a Messenger channel added by hand', async () => {
    await render('channels', { channels: [channel({ api_keys: 1 })], status: () => apiError(404, 'CHANNEL_NOT_FOUND') });
    await click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Edit Acme Messenger"]')!);
    expect(button('Update credentials')).toBeUndefined();
    expect(page()).toContain('External ID');
  });
});

describe('metaFieldError', () => {
  it('checks shape only', () => {
    expect(metaFieldError('page_id', '104857600012345')).toBeNull();
    expect(metaFieldError('page_id', '')).toMatch(/Paste/);
    expect(metaFieldError('page_id', '12-34')).toMatch(/digits/);
    expect(metaFieldError('access_token', 'EAAG x')).toMatch(/spaces/);
    expect(metaFieldError('app_secret', SECRET.toUpperCase())).toBeNull();
    expect(metaFieldError('app_secret', 'short')).toMatch(/32/);
    expect(metaFieldError('name', '')).toBeNull();
  });
});

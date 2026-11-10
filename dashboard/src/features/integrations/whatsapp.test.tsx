import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import type { Channel, ChannelType, WhatsAppConnection } from '@/lib/api/types';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { whatsAppFieldError } from '@/lib/whatsapp';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import { CatalogTab, ChannelsTab } from './IntegrationsPage';
import { WhatsAppConnectButton } from './whatsapp';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn(), notifyWarning: vi.fn() }));

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const apiError = (status: number, code: string, message = 'No.', field?: string) => json(status, { error: { code, message, request_id: 'req_t', ...(field ? { field } : {}) } });

const TYPES: ChannelType[] = [
  { id: 'website', label: 'Website', description: '', icon: 'website', offered: true },
  { id: 'whatsapp', label: 'WhatsApp', description: '', icon: 'whatsapp', offered: true },
];

const channel = (more: Partial<Channel> = {}): Channel => ({
  id: 'chn_wa',
  tenant_id: 'acme',
  bot_id: 'support',
  type: 'whatsapp',
  type_label: 'WhatsApp',
  name: 'Acme WhatsApp',
  description: '',
  external_id: '106540352242922',
  enabled: true,
  disabled_by_platform: false,
  active: true,
  open_tickets: 0,
  tickets: 0,
  api_keys: 0,
  auto_close_hours: null,
  effective_auto_close_hours: 0,
  created_at: '2026-11-09T10:00:00Z',
  updated_at: '2026-11-09T10:00:00Z',
  ...more,
});

const number = (more: Partial<WhatsAppConnection> = {}): WhatsAppConnection => ({
  channel: channel(),
  phone_number_id: '106540352242922',
  waba_id: '102290129340398',
  display_phone: '+1 555-0100',
  verified_name: 'Acme',
  webhook_url: 'https://api.test/v1/channels/whatsapp/webhooks/chn_wa',
  verify_token: 'tpx_0123456789abcdef0123456789abcdef',
  ...more,
});

interface Setup {
  channels?: Channel[];
  connect?: (body: any) => Response;
  status?: () => Response;
  can?: (p: string) => boolean;
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
      if (path === '/channels/whatsapp') return s.connect?.(body) ?? json(201, number());
      if (/^\/channels\/[^/]+\/whatsapp$/.test(path)) return s.status?.() ?? json(200, number());
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
              <ConfirmProvider>{tab === 'catalog' ? <CatalogTab /> : tab === 'channels' ? <ChannelsTab /> : <WhatsAppConnectButton />}</ConfirmProvider>
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
/** The sheet's own button: the catalog card's has the same name and comes first. */
const submit = () => [...document.body.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Connect number').at(-1) as HTMLButtonElement;
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
  await type(input('Phone number ID'), ' 106540352242922 ');
  await type(input('WhatsApp Business Account ID'), '102290129340398');
  await type(input('Access token'), 'EAAG' + 'x'.repeat(40));
  await type(input('App secret'), SECRET);
}
const connects = () => calls.filter((c) => c.path === '/channels/whatsapp');

describe('the catalog', () => {
  it('offers to connect a WhatsApp number', async () => {
    await render('catalog');
    expect(page()).toContain('WhatsApp');
    expect(button('Connect number')).toBeTruthy();
  });
});

describe('connecting a WhatsApp number', () => {
  it('sends the four values, then shows the webhook settings for the Meta app', async () => {
    await render('connect');
    await click(button('Connect number'));
    expect(page()).toContain('Set up in Meta');
    await fill();
    await click(submit());
    expect(connects()).toHaveLength(1);
    expect(connects()[0]!.body).toEqual({ phone_number_id: '106540352242922', waba_id: '102290129340398', access_token: 'EAAG' + 'x'.repeat(40), app_secret: SECRET });
    expect(page()).toContain('+1 555-0100 is connected');
    expect(page()).toContain('https://api.test/v1/channels/whatsapp/webhooks/chn_wa');
    expect(page()).toContain('Waiting for Meta to check the webhook');
    // The verify token is hidden until shown.
    expect(page()).not.toContain('tpx_0123');
  });

  it('notices Meta checking the webhook', async () => {
    await render('connect', { status: () => json(200, number({ webhook_verified_at: '2026-11-09T10:01:00Z' })) });
    await click(button('Connect number'));
    await fill();
    await click(submit());
    await tick();
    expect(page()).toContain('Webhook verified');
  });

  it("catches a phone number pasted for the Phone number ID before asking Meta", async () => {
    await render('connect');
    await click(button('Connect number'));
    await fill();
    await type(input('Phone number ID'), '+1 555 0100');
    await click(submit());
    expect(connects()).toHaveLength(0);
    expect(page()).toContain("That's the phone number");
  });

  it.each([
    [apiError(400, 'INVALID_REQUEST', "Meta didn't accept this access token.", 'access_token'), "Meta didn't accept this access token."],
    [apiError(409, 'WHATSAPP_NUMBER_TAKEN', 'Another bot already has this WhatsApp number.'), 'Another bot already has this WhatsApp number.'],
    [apiError(502, 'WHATSAPP_UNAVAILABLE'), "Meta couldn't be reached"],
    [apiError(503, 'CHANNEL_CONNECT_UNAVAILABLE'), "WhatsApp connections aren't set up on this server yet."],
  ])('shows a refusal in the form (%#)', async (res, shown) => {
    await render('connect', { connect: () => res.clone() });
    await click(button('Connect number'));
    await fill();
    await click(submit());
    expect(page()).toContain(shown);
    // The form stays, so the person can fix it.
    expect(input('App secret')).toBeTruthy();
  });

  it('asks people without channels.write to ask an admin', async () => {
    await render('connect', { can: (p) => p !== 'channels.write' });
    expect(button('Connect number')).toBeUndefined();
    expect(page()).toContain('Ask an admin to connect');
  });
});

describe('a connected number in the channels table', () => {
  it('needs no key, and its sheet shows the number and webhook settings', async () => {
    await render('channels', { channels: [channel()], status: () => json(200, number({ last_event_at: new Date().toISOString() })) });
    await click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Edit Acme WhatsApp"]')!);
    expect(page()).toContain('+1 555-0100');
    expect(page()).toContain('Receiving messages');
    expect(page()).toContain('Connected to +1 555-0100.');
    expect(button('Update credentials')).toBeTruthy();
  });

  it('shows nothing extra for a WhatsApp channel added by hand', async () => {
    await render('channels', { channels: [channel({ api_keys: 1 })], status: () => apiError(404, 'CHANNEL_NOT_FOUND') });
    await click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Edit Acme WhatsApp"]')!);
    expect(button('Update credentials')).toBeUndefined();
    expect(input('Phone number ID')).toBeNull();
    expect(page()).toContain('External ID');
  });
});

describe('whatsAppFieldError', () => {
  it('checks shape only', () => {
    expect(whatsAppFieldError('phone_number_id', '106540352242922')).toBeNull();
    expect(whatsAppFieldError('phone_number_id', '')).toMatch(/Paste/);
    expect(whatsAppFieldError('waba_id', '12ab')).toMatch(/digits/);
    expect(whatsAppFieldError('access_token', 'EAAG x')).toMatch(/spaces/);
    expect(whatsAppFieldError('app_secret', SECRET.toUpperCase())).toBeNull();
    expect(whatsAppFieldError('app_secret', 'short')).toMatch(/32/);
    expect(whatsAppFieldError('name', '')).toBeNull();
  });
});

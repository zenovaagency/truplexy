import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import type { Channel, ChannelType } from '@/lib/api/types';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { notifySuccess } from '@/lib/notify';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import { CatalogTab, ChannelsTab } from './IntegrationsPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const apiError = (status: number, code: string, message = 'No.') => json(status, { error: { code, message, request_id: 'req_t' } });

const TYPES: ChannelType[] = [
  { id: 'website', label: 'Website', description: '', icon: 'website', offered: true },
  { id: 'discord', label: 'Discord', description: '', icon: 'discord', offered: true },
];
const GUILD = '1187340912665214976';
const DISCORD_URL = 'https://discord.com/oauth2/authorize?client_id=1&state=x';

const server = (more: Partial<Channel> = {}): Channel => ({
  id: 'chn_d',
  tenant_id: 'acme',
  bot_id: 'support',
  type: 'discord',
  type_label: 'Discord',
  name: 'Acme Community',
  description: '',
  external_id: GUILD,
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

let root: Root | undefined;
let calls: { method: string; path: string; body: any }[] = [];
let assign: ReturnType<typeof vi.fn<(url: string | URL) => void>>;
let location = '';

beforeEach(() => {
  (window as any).happyDOM.setURL('https://app.test/integrations/guides');
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

async function render(tab: 'catalog' | 'channels', url: string, s: { channels?: Channel[]; connect?: () => Response } = {}) {
  calls = [];
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const path = new URL(req.url).pathname.replace(/^\/v3/, '');
      const body = req.method === 'GET' ? undefined : await req.json().catch(() => undefined);
      calls.push({ method: req.method, path, body });
      if (path === '/channel-types') return json(200, { data: TYPES });
      if (path === '/channels') return json(200, { data: s.channels ?? [] });
      if (path === '/tools') return json(200, { data: [], database_configured: true });
      if (path === '/api-keys') return json(200, { data: [] });
      if (path === '/channels/connect') return s.connect?.() ?? json(200, { url: DISCORD_URL });
      return apiError(404, 'NOT_FOUND');
    },
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ctx = {
    scope: { tenant: 'acme', bot: 'support' },
    bot: { id: 'support', name: 'Aria' },
    bots: [],
    href: (p = '') => `/${p}`,
    can: () => true,
  } as unknown as ScopeContextValue;
  const container = document.createElement('div');
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

const page = () => document.body.textContent ?? '';
const button = (name: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement;
const click = async (el: HTMLElement) => {
  await act(async () => el.click());
  await tick();
};
const connects = () => calls.filter((c) => c.path === '/channels/connect');

describe('adding Truplexy to a Discord server', () => {
  it('asks Discord to let the person pick a server, then goes there in this tab', async () => {
    await render('catalog', '/integrations/guides');
    expect(page()).toContain('Not linked');
    await click(button('Add to Discord'));
    expect(page()).toContain('Aria');
    await click(button('Continue to Discord'));
    expect(connects()).toHaveLength(1);
    expect(connects()[0]!.body).toEqual({ type: 'discord', account: '', return_to: 'https://app.test/integrations/guides' });
    expect(assign).toHaveBeenCalledWith(DISCORD_URL);
  });

  it("opens straight away from the bot's Link this server button, with that server", async () => {
    await render('catalog', `/integrations/guides?connect=discord&guild_id=${GUILD}`);
    expect(page()).toContain('Add Truplexy to your Discord server');
    expect(page()).toContain(`Server ${GUILD}`);
    // The link is tidied away, so a reload doesn't open it again.
    expect(location).toBe('');
    await click(button('Continue to Discord'));
    expect(connects()[0]!.body.account).toBe(GUILD);
  });

  it("says when Discord connections aren't set up", async () => {
    await render('catalog', '/integrations/guides', { connect: () => apiError(503, 'CHANNEL_CONNECT_UNAVAILABLE') });
    await click(button('Add to Discord'));
    await click(button('Continue to Discord'));
    expect(page()).toContain("Truplexy's Discord bot isn't set up on this server yet.");
    expect(assign).not.toHaveBeenCalled();
  });

  it('says so on the way back, without the store tools prompt', async () => {
    await render('catalog', '/integrations/guides?connected=discord&channel_id=chn_d&type=discord', { channels: [server()] });
    expect(notifySuccess).toHaveBeenCalledWith('Your Discord server is linked. Run /setup there next.');
    expect(page()).not.toContain('order and product lookups');
    expect(page()).toContain('Linked · Acme Community');
    expect(location).toBe('');
  });

  it("explains why a server wasn't linked", async () => {
    await render('catalog', '/integrations/guides?connect_error=store_connected_elsewhere&type=discord');
    expect(page()).toContain("Your Discord server wasn't linked");
    expect(page()).toContain('already linked to another Truplexy business');
  });

  it('keeps the chat API guide for a business running its own bot', async () => {
    await render('catalog', '/integrations/guides');
    await click(button('Running your own bot? Use the chat API →'));
    expect(location).toContain('guide=discord');
  });
});

describe('a linked server in the channel list', () => {
  it("is marked as Truplexy's bot, and offers adding the bot again once off", async () => {
    await render('channels', '/integrations', {
      channels: [server(), server({ id: 'chn_off', name: 'Old server', external_id: '1187340912665214977', enabled: false, active: false })],
    });
    expect(page()).toContain('Truplexy bot');
    expect(button('Add again')).toBeTruthy();
  });

  it("isn't a linked server when added by hand for the business's own bot", async () => {
    await render('channels', '/integrations', { channels: [server({ external_id: '' })] });
    expect(page()).not.toContain('Truplexy bot');
  });
});

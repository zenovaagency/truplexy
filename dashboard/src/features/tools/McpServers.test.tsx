import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import type { McpServer, McpServerList, Tool } from '@/lib/api/types';
import { builtInLabel, slugFrom, urlError, withServerTools } from '@/lib/mcp';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import BotDraftLayout from '@/features/llm/draft';
import ToolsPage from './ToolsPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const weather: McpServer = {
  id: 'mcps_1',
  name: 'Weather',
  slug: 'wx',
  url: 'https://mcp.weather.test/mcp',
  has_auth: true,
  auth_header: 'Authorization',
  auth_hint: '…a1b2',
  server_name: 'weather',
  server_version: '2.1.0',
  status: 'error',
  last_error: 'The server did not respond in time.',
  tools: [
    { name: 'mcp_wx_get_weather', tool: 'get_weather', description: 'Current weather.', read_only: true, available: true },
    { name: 'mcp_wx_union', tool: 'union', description: 'Bad schema.', read_only: true, available: false, unavailable_reason: 'Its input schema can’t be used.' },
  ],
  disabled: false,
  synced_at: '2026-11-08T10:00:00Z',
  created_at: '2026-11-08T10:00:00Z',
  updated_at: '2026-11-08T10:00:00Z',
};

const mcpTool: Tool = {
  name: 'mcp_wx_get_weather',
  description: '[Weather] Current weather.',
  parameters: { type: 'object', properties: { city: { type: 'string' } } },
  read_only: true,
  built_in: true,
  available: true,
  api: { method: 'GET', url: '', created_at: '', updated_at: '' },
  mcp: { server_id: 'mcps_1', server_name: 'Weather', tool: 'get_weather' },
};

let root: Root | undefined;
let container: HTMLDivElement;
let requests: { method: string; path: string; body: unknown }[] = [];

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  requests = [];
  document.body.innerHTML = '';
  configureApi({ transport: (req) => fetch(req) });
});

const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

type Servers = McpServerList | 'missing';

async function render(servers: Servers, tools: Tool[] = [], onSave?: (body: any) => Response) {
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const path = new URL(req.url).pathname.replace(/^\/v3/, '');
      const body = req.method === 'GET' ? undefined : await req.text().then((t) => (t ? JSON.parse(t) : undefined));
      requests.push({ method: req.method, path, body });
      if (path === '/tools') return json(200, { data: tools, database_configured: true });
      if (path === '/workspace') return json(200, { name: 'Aria', modelSelection: 'platform', bot: { name: 'Aria', toolsEnabled: false, tools: [] }, revision: 1, history: [], defaults: { name: 'Aria', bot: { name: 'Aria' } } });
      if (path === '/mcp-servers' && req.method === 'GET') return servers === 'missing' ? json(404, { error: { code: 'NOT_FOUND', message: 'No.' } }) : json(200, servers);
      if (path === '/mcp-servers' && req.method === 'POST' && onSave) return onSave(body);
      return json(404, { error: { code: 'NOT_FOUND', message: 'No.' } });
    },
  });
  const ctx = { scope: { tenant: 'acme', bot: 'support' }, bot: { id: 'support', name: 'Aria' }, bots: [], href: (p = '') => `/${p}`, can: () => true } as unknown as ScopeContextValue;
  const router = createMemoryRouter([{ element: <BotDraftLayout />, children: [{ path: '/tools', element: <ToolsPage /> }] }], { initialEntries: ['/tools'] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ScopeContext.Provider value={ctx}>
          <TooltipProvider>
            <ConfirmProvider>
              <RouterProvider router={router} />
            </ConfirmProvider>
          </TooltipProvider>
        </ScopeContext.Provider>
      </QueryClientProvider>,
    );
  });
  await tick();
  await tick();
}

const page = () => document.body.textContent ?? '';
const button = (name: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;
const list = (data: McpServer[], over: Partial<McpServerList> = {}): McpServerList => ({ data, database_configured: true, auth_supported: true, plan_includes: true, max_servers: 10, ...over });

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('MCP servers on the Tools page', () => {
  it('stays out of the page when the API has no MCP servers', async () => {
    await render('missing');
    expect(page()).not.toContain('MCP servers');
  });

  it('lists servers with their status, and badges their tools in the library', async () => {
    await render(list([weather]), [mcpTool]);
    expect(page()).toContain('MCP servers');
    expect(page()).toContain('Weather');
    expect(page()).toContain('mcp_wx_…');
    expect(page()).toContain("Can't connect");
    expect(page()).toContain('The server did not respond in time.');
    expect(page()).toContain('1 of 2 tools usable');
    expect(page()).toContain('MCP · Weather');
  });

  it('asks to upgrade when the plan has no MCP servers', async () => {
    await render(list([], { plan_includes: false }));
    expect(page()).toContain('MCP servers come with Pro');
    expect(button('Add MCP server')).toBeUndefined();
  });

  it('shows why a server could not be connected, then connects with a slug from the name', async () => {
    let attempt = 0;
    await render(list([]), [], (body) => {
      attempt += 1;
      return attempt === 1
        ? json(422, { error: { code: 'MCP_CONNECT_FAILED', message: 'The server refused the credentials (401 Unauthorized). Check the auth header.' } })
        : json(201, { ...weather, ...body, status: 'ok' });
    });
    await act(async () => button('Add MCP server')!.click());
    await tick();
    const inputs = [...document.body.querySelectorAll<HTMLInputElement>('[role="dialog"] input')];
    const [name, url] = inputs;
    await act(async () => {
      type(name!, 'Stripe (live)');
      type(url!, 'https://mcp.stripe.test/mcp');
    });
    await tick();
    await act(async () => button('Connect server')!.click());
    await tick(40);
    expect(page()).toContain("Couldn't connect to the server");
    expect(page()).toContain('401 Unauthorized');
    const post = requests.find((r) => r.method === 'POST' && r.path === '/mcp-servers');
    expect(post?.body).toEqual({ name: 'Stripe (live)', slug: 'stripelive', url: 'https://mcp.stripe.test/mcp' });

    await act(async () => button('Connect server')!.click());
    await tick(40);
    expect(attempt).toBe(2);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('lib/mcp', () => {
  it('makes slugs like the API', () => {
    expect(slugFrom('  9 Stripe (Live)!')).toBe('stripelive');
    expect(slugFrom('日本')).toBe('server');
    expect(slugFrom('a'.repeat(30))).toHaveLength(20);
  });

  it('checks addresses lightly', () => {
    expect(urlError('https://mcp.example.com/mcp')).toBeNull();
    expect(urlError('http://localhost:8080/mcp')).toBeNull();
    expect(urlError('http://example.com/mcp')).toBeTruthy();
    expect(urlError('')).toBeTruthy();
  });

  it('adds a server’s usable tools to a bot up to 20', () => {
    const many = Array.from({ length: 19 }, (_, i) => `t${i}`);
    const { tools, added } = withServerTools(many, weather);
    expect(added).toEqual(['mcp_wx_get_weather']);
    expect(tools).toHaveLength(20);
    expect(withServerTools([...many, 'x'], weather).added).toEqual([]);
    expect(withServerTools(['mcp_wx_get_weather'], weather).added).toEqual([]);
  });

  it('labels where a built-in tool comes from', () => {
    expect(builtInLabel(mcpTool)).toBe('MCP · Weather');
    expect(builtInLabel({ ...mcpTool, mcp: undefined, name: 'shopify_order_status' })).toBe('Built-in · Shopify');
    expect(builtInLabel({ ...mcpTool, mcp: undefined, built_in: false })).toBeNull();
  });
});

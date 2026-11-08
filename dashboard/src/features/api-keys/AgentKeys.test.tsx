import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import type { ApiKey } from '@/lib/api/types';
import { connectSnippets, mcpUrl } from '@/lib/agents';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import { IssueKeyForm } from './IssueKey';
import ApiKeysPage from './ApiKeysPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let root: Root | undefined;
let requests: { method: string; path: string; body: any }[] = [];

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  requests = [];
  document.body.innerHTML = '';
  configureApi({ transport: (req) => fetch(req) });
});

const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

const agentKey: ApiKey = { id: 'key_1', name: 'Claude', tenant_id: 'acme', bot_id: 'support', key_prefix: 'tpxa_a1b2c3', kind: 'agent', access: 'write', status: 'active', created_at: '2026-11-08T10:00:00Z' };

/** Renders element with an API whose plan has MCP when mcp is true, and no MCP field at all when undefined. */
async function render(element: React.ReactNode, mcp: boolean | undefined, keys: ApiKey[] = []) {
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const path = new URL(req.url).pathname.replace(/^\/v3/, '');
      const body = req.method === 'GET' ? undefined : await req.text().then((t) => (t ? JSON.parse(t) : undefined));
      requests.push({ method: req.method, path, body });
      if (path === '/tenant') return json(200, { id: 'acme', name: 'Acme', plan: 'pro', limits: mcp === undefined ? {} : { mcp }, usage: {} });
      if (path === '/bots') return json(200, { data: [{ tenant_id: 'acme', id: 'support', name: 'Aria', kb_version: 1, created_at: '' }] });
      if (path === '/api-keys' && req.method === 'GET') return json(200, { data: keys });
      if (path === '/api-keys' && req.method === 'POST')
        return json(201, { ...agentKey, name: body.name, kind: body.kind ?? 'chat', access: body.access, key: `${body.kind === 'agent' ? 'tpxa_' : 'tpx_'}secret` });
      if (path === '/channels') return json(200, { data: [] });
      return json(404, { error: { code: 'NOT_FOUND', message: 'No.' } });
    },
  });
  const ctx = { scope: { tenant: 'acme', bot: 'support' }, bot: { id: 'support', name: 'Aria' }, bots: [], href: (p = '') => `/${p}`, can: () => true } as unknown as ScopeContextValue;
  const router = createMemoryRouter([{ path: '/', element }], { initialEntries: ['/'] });
  const container = document.createElement('div');
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

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('AI agent keys', () => {
  it('issues a write key for an agent and shows how to connect it', async () => {
    await render(<IssueKeyForm />, true);
    await act(async () => button('AI agent (MCP)')!.click());
    await act(async () => button('Read & write')!.click());
    expect(page()).not.toContain('Channel');
    await act(async () => type(document.body.querySelector('input')!, 'Claude'));
    await act(async () => button('Issue agent key')!.click());
    await tick(40);
    const post = requests.find((r) => r.method === 'POST' && r.path === '/api-keys');
    expect(post?.body).toEqual({ name: 'Claude', bot_id: 'support', kind: 'agent', access: 'write' });
    expect(page()).toContain('tpxa_secret');
    expect(page()).toContain('claude mcp add --transport http truplexy');
    expect(page()).toContain('Bearer tpxa_secret');
  });

  it('asks to upgrade when the plan has no MCP', async () => {
    await render(<IssueKeyForm />, false);
    await act(async () => button('AI agent (MCP)')!.click());
    expect(page()).toContain('AI agent keys come with Pro');
    expect(button('Issue agent key')!.disabled).toBe(true);
  });

  it('offers only chat keys when the API has no agent keys', async () => {
    await render(<IssueKeyForm />, undefined);
    expect(button('AI agent (MCP)')).toBeUndefined();
    await act(async () => type(document.body.querySelector('input')!, 'Site'));
    await act(async () => button('Issue key')!.click());
    await tick(40);
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({ name: 'Site', bot_id: 'support' });
  });

  it('badges agent keys in the list and shows the connect card', async () => {
    await render(<ApiKeysPage />, true, [agentKey]);
    expect(page()).toContain('AI agent · Read & write');
    expect(page()).toContain('Connect an AI agent');
    expect(page()).toContain(mcpUrl());
  });
});

describe('lib/agents', () => {
  it('points at the v3 MCP endpoint whatever the API version', () => {
    expect(mcpUrl('https://api.truplexy.com/v3')).toBe('https://api.truplexy.com/v3/mcp');
    expect(mcpUrl('https://api.truplexy.com/v2/')).toBe('https://api.truplexy.com/v3/mcp');
    expect(mcpUrl('http://localhost:3000')).toBe('http://localhost:3000/v3/mcp');
    expect(mcpUrl('/api/v3')).toBe(`${window.location.origin}/api/v3/mcp`);
  });

  it('fills the key into every snippet', () => {
    for (const s of connectSnippets('tpxa_k', 'https://x.test/v3/mcp')) {
      expect(s.code).toContain('tpxa_k');
      expect(s.code).toContain('https://x.test/v3/mcp');
    }
  });
});

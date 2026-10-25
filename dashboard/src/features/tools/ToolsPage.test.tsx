import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import type { Tool } from '@/lib/api/types';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import BotDraftLayout from '@/features/llm/draft';
import ToolsPage from './ToolsPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const builtIn = (name: string, available: boolean): Tool => ({
  name,
  description: `${name} description`,
  parameters: { type: 'object', properties: {} },
  read_only: true,
  built_in: true,
  available,
  unavailable_reason: available ? undefined : 'Connect a Shopify store to this bot.',
  api: { method: 'GET', url: '', created_at: '', updated_at: '' },
});

const apiTool: Tool = {
  name: 'lookup_order',
  description: 'Look up an order',
  parameters: { type: 'object', properties: {} },
  read_only: true,
  available: true,
  api: { method: 'GET', url: 'https://api.example.com/orders', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
};

let root: Root | undefined;
let container: HTMLDivElement;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  configureApi({ transport: (req) => fetch(req) });
});

const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function render(tools: Tool[]) {
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const path = new URL(req.url).pathname.replace(/^\/v3/, '');
      if (path === '/tools') return json(200, { data: tools, database_configured: true });
      if (path === '/workspace') return json(200, { name: 'Aria', modelSelection: 'platform', bot: { name: 'Aria', toolsEnabled: false, tools: [] }, revision: 1, history: [], defaults: { name: 'Aria', bot: { name: 'Aria' } } });
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
const rowOf = (name: string) => [...container.querySelectorAll('tr')].find((r) => r.textContent?.includes(name))!;
const button = (name: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;

/** Radix menus open on pointer down. */
async function openMenu(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' } as PointerEventInit));
  });
  await tick();
}

describe('built-in tools', () => {
  it('are badged and say why they are unavailable, with a way to connect', async () => {
    await render([builtIn('shopify_order_status', false), builtIn('shopify_product_search', true), apiTool]);
    const row = rowOf('shopify_order_status');
    expect(row.textContent).toContain('Built-in · Shopify');
    expect(row.textContent).toContain('Connect a Shopify store to this bot.');
    expect(row.querySelector('a[href="/integrations/guides"]')).not.toBeNull();
    // No method/URL block for a built-in.
    expect(row.textContent).toContain('Built in');
    expect(rowOf('lookup_order').textContent).toContain('https://api.example.com/orders');
  });

  it('offer no edit or delete', async () => {
    await render([builtIn('shopify_product_search', true), apiTool]);
    await openMenu(rowOf('shopify_product_search').querySelector<HTMLElement>('button[aria-label="Actions for shopify_product_search"]')!);
    const items = [...document.body.querySelectorAll('[role="menuitem"]')].map((m) => m.textContent?.trim());
    expect(items).toEqual(['Run a test']);
  });

  it('show only "Run a test" in their details', async () => {
    await render([builtIn('shopify_order_status', true)]);
    await act(async () => rowOf('shopify_order_status').click());
    await tick();
    expect(button('Run a test')).toBeDefined();
    expect(button('Edit')).toBeUndefined();
    expect(button('Delete')).toBeUndefined();
    expect(page()).not.toContain('Arguments go in');
  });

  it('explain what the order tool needs when tested', async () => {
    await render([builtIn('shopify_order_status', true)]);
    await openMenu(rowOf('shopify_order_status').querySelector<HTMLElement>('button[aria-label="Actions for shopify_order_status"]')!);
    const run = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) => m.textContent?.includes('Run a test'))!;
    await act(async () => run.click());
    await tick();
    expect(page()).toContain('the email the order was placed with');
  });
});

describe('the API tool form', () => {
  it('refuses names starting with shopify_', async () => {
    await render([apiTool]);
    await act(async () => button('New tool')!.click());
    await tick();
    const name = document.body.querySelector<HTMLInputElement>('input[placeholder="lookup_order"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'shopify_refunds');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(page()).toContain('Names starting with shopify_ are kept for the built-in Shopify tools.');
    expect(button('Create tool')!.disabled).toBe(true);
  });
});

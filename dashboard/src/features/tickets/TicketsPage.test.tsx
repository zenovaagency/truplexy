import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import TicketsPage from './TicketsPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const counts = { needs_reply: 0, escalated: 0, open: 0, all: 0, mine: 0, overdue: 0, unassigned: 0 };

let root: Root | undefined;
let container: HTMLDivElement;
let listCalls: URLSearchParams[] = [];

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  listCalls = [];
  configureApi({ transport: (req) => fetch(req) });
});

const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function render(url: string, { channels = false } = {}) {
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const u = new URL(req.url);
      const path = u.pathname.replace(/^\/v3/, '');
      if (path === '/tickets') {
        listCalls.push(u.searchParams);
        return json(200, { data: [], counts });
      }
      if (path === '/channels') return json(200, { data: channels ? [{ id: 'ch_1', name: 'Storefront', type_id: 'web', type_label: 'Chat' }] : [] });
      return json(404, { error: { code: 'NOT_FOUND', message: 'No.' } });
    },
  });
  const ctx = { scope: { tenant: 'acme', bot: 'support' }, bot: { id: 'support', name: 'Aria' }, bots: [], href: (p = '') => `/${p}`, can: () => true } as unknown as ScopeContextValue;
  const router = createMemoryRouter([{ path: '/tickets/:ticketId?', element: <TicketsPage /> }], { initialEntries: [url] });
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
  return router;
}

const select = (label: string) => container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement | null;
const lastCall = () => listCalls[listCalls.length - 1];

async function choose(el: HTMLSelectElement, value: string) {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await tick();
  await tick();
}

describe('ticket filters', () => {
  it('a link for closed tickets lands on All, not the open-only default', async () => {
    await render('/tickets?status=closed');
    expect(lastCall().get('view')).toBe('all');
    expect(lastCall().get('status')).toBe('closed');
  });

  it('picking Closed switches to All, and an open-only view drops it again', async () => {
    const router = await render('/tickets');
    const button = (name: string) => [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Filters' || b.textContent?.includes(name)) as HTMLButtonElement;
    await act(async () => button('Filters').click());
    await choose(select('Status')!, 'closed');
    expect(router.state.location.search).toContain('status=closed');
    expect(router.state.location.search).toContain('view=all');
    expect(lastCall().get('view')).toBe('all');

    const mine = [...container.querySelectorAll('[role="radio"], button')].find((b) => b.textContent?.startsWith('Mine')) as HTMLElement;
    await act(async () => mine.click());
    await tick();
    expect(router.state.location.search).not.toContain('status=closed');
    expect(router.state.location.search).toContain('view=mine');
  });

  it('changing the category loads that category', async () => {
    await render('/tickets?view=all&category=billing');
    expect(lastCall().get('category')).toBe('billing');
    await choose(select('Category')!, 'technical');
    expect(lastCall().get('category')).toBe('technical');
  });

  it('opens the filters when a link carries a category', async () => {
    await render('/tickets?view=all&category=billing');
    expect(select('Category')).not.toBeNull();
  });

  it('puts Category and Channel on one row, and a lone one across the row', async () => {
    await render('/tickets?view=all&category=billing', { channels: true });
    expect(select('Category')!.className).not.toContain('col-span-2');
    expect(select('Channel')!.className).not.toContain('col-span-2');
    await act(async () => root?.unmount());
    document.body.innerHTML = '';

    await render('/tickets?view=all&category=billing');
    expect(select('Category')!.className).toContain('col-span-2');
  });
});

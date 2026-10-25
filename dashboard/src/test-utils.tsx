import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureApi } from '@/lib/api/client';
import type { Permission } from '@/lib/api/types';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';

/* Rendering a page against a fake API, for component tests. Only tests import this. */

export const json = (status: number, body: unknown) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

/** Answers one request; return undefined for the default 404. */
export type FakeApi = (call: Call) => Response | undefined | Promise<Response | undefined>;

let root: Root | undefined;

export const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

/** Renders `routes` at `path` with a scope whose `can` allows `permissions` (all when left out). Returns the calls made. */
export async function renderPage(routes: RouteObject[], path: string, api: FakeApi, permissions?: Permission[]) {
  const calls: Call[] = [];
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const url = new URL(req.url);
      const text = req.method === 'GET' ? '' : await req.text();
      const call = { method: req.method, path: url.pathname.replace(/^\/v3/, ''), query: url.searchParams, body: text ? JSON.parse(text) : undefined };
      calls.push(call);
      return (await api(call)) ?? json(404, { error: { code: 'NOT_FOUND', message: 'route not found' } });
    },
  });
  const ctx = {
    scope: { tenant: 'acme', bot: 'support' },
    bot: { id: 'support', name: 'Aria' },
    bots: [],
    businessName: 'Acme Store',
    href: (p = '') => `/${p}`,
    can: (p: Permission) => !permissions || permissions.includes(p),
  } as unknown as ScopeContextValue;
  const router = createMemoryRouter(routes, { initialEntries: [path] });
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
  return { calls, container, router };
}

export async function cleanup() {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  configureApi({ transport: (req) => fetch(req) });
}

export const text = () => document.body.textContent ?? '';
export const button = (name: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;

export async function click(el: Element | undefined | null) {
  if (!el) throw new Error('nothing to click');
  await act(async () => (el as HTMLElement).click());
  await tick();
}

/** Types into an input or textarea the way React notices. */
export async function type(el: Element | null | undefined, value: string) {
  if (!el) throw new Error('nothing to type into');
  const input = el as HTMLInputElement | HTMLTextAreaElement;
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export async function choose(el: Element | null | undefined, value: string) {
  if (!el) throw new Error('nothing to choose in');
  const select = el as HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/** The input labelled `label` (by its <label for>). */
export function field(label: string) {
  const l = [...document.body.querySelectorAll('label')].find((x) => x.textContent?.trim().startsWith(label));
  return l?.htmlFor ? document.getElementById(l.htmlFor) : null;
}

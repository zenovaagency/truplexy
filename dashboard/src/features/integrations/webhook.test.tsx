import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import { createQueryClient } from '@/lib/query-client';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { notifyError } from '@/lib/notify';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import { WebhookTab } from './IntegrationsPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const apiError = (status: number, code: string, message = 'No.') => json(status, { error: { code, message, request_id: 'req_t' } });
const NONE = () => apiError(404, 'WEBHOOK_NOT_FOUND', 'This bot has no webhook. Save one first.');

const HOOK = {
  url: 'https://hooks.example.com/truplexy',
  enabled: true,
  secret_hint: 'whsec_…abcd',
  events: ['message.created', 'ticket.updated'],
  last_delivery: { event: 'message.created', ok: false, status: 502, at: '2026-10-25T09:00:00Z' },
  created_at: '2026-10-20T09:00:00Z',
  updated_at: '2026-10-20T09:00:00Z',
};

let root: Root | undefined;
let calls: { method: string; path: string; body: any }[] = [];

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.mocked(notifyError).mockClear();
  configureApi({ transport: (req) => fetch(req) });
});

const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function render(routes: Record<string, (body: any) => Response>, can: (p: string) => boolean = () => true) {
  calls = [];
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const path = new URL(req.url).pathname.replace(/^\/v3/, '');
      const body = req.method === 'PUT' ? await req.json() : undefined;
      calls.push({ method: req.method, path, body });
      return routes[`${req.method} ${path}`]?.(body) ?? apiError(404, 'NOT_FOUND');
    },
  });
  // The app's own client: its retries and error toasts are part of what's tested.
  const qc = createQueryClient();
  const ctx = { scope: { tenant: 'acme', bot: 'support' }, bot: { id: 'support', name: 'Aria' }, bots: [], href: (p = '') => `/${p}`, can } as unknown as ScopeContextValue;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ScopeContext.Provider value={ctx}>
            <TooltipProvider>
              <ConfirmProvider>
                <WebhookTab />
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
const sent = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);
const gets = () => sent('GET', '/webhook');
const button = (name: string, within: ParentNode = document.body) => [...within.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
/** The confirm dialog's own button, not the page's button of the same name. */
const confirmButton = (name: string) => button(name, document.body.querySelector('[role="alertdialog"], [role="dialog"]') ?? document.createElement('div'));
const click = async (el: HTMLElement | undefined) => {
  expect(el).toBeDefined();
  await act(async () => el!.click());
  await tick();
};
const urlInput = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Endpoint URL"]')!;
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(urlInput(), value);
    urlInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('a bot with no webhook yet', () => {
  it('shows the empty form, with no error and no retry', async () => {
    await render({ 'GET /webhook': NONE });
    await tick(1500);
    expect(gets()).toHaveLength(1);
    expect(notifyError).not.toHaveBeenCalled();
    expect(page()).not.toContain("Couldn't");
    expect(button('Create webhook')).toBeDefined();
  });

  it('has the URL field, an Enabled switch on by default, Save and the explanation, and nothing else', async () => {
    await render({ 'GET /webhook': NONE });
    expect(urlInput().value).toBe('');
    expect(document.body.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
    expect(page()).toContain('Enabled');
    expect(page()).toContain('Truplexy calls this URL when your team replies to or updates a ticket from a chat API conversation (message.created, ticket.updated).');
    for (const hidden of ['Send test event', 'Replace secret', 'Delete']) expect(button(hidden)).toBeUndefined();
    expect(page()).not.toContain('Last delivery');
  });

  it('still shows the error state for a 500', async () => {
    await render({ 'GET /webhook': () => apiError(500, 'INTERNAL_ERROR', 'Boom') });
    // The app retries server errors twice, after 1 s and 2 s.
    await tick(3500);
    expect(gets()).toHaveLength(3);
    expect(page()).toContain('Something went wrong on our side');
    expect(button('Create webhook')).toBeUndefined();
  });
});

describe('saving', () => {
  it('sends {url, enabled}, shows the secret once, and keeps the response instead of refetching', async () => {
    await render({ 'GET /webhook': NONE, 'PUT /webhook': (b) => json(200, { ...HOOK, ...b, last_delivery: undefined, secret: 'whsec_newsecret123' }) });
    await type('https://hooks.example.com/truplexy');
    await click(document.body.querySelector<HTMLElement>('[role="switch"]')!);
    await click(button('Create webhook'));
    expect(sent('PUT', '/webhook')[0]!.body).toEqual({ url: 'https://hooks.example.com/truplexy', enabled: false });
    expect(page()).toContain("Save this now: it won't be shown again.");
    expect([...document.body.querySelectorAll('input')].some((i) => i.value === 'whsec_newsecret123') || page().includes('whsec_newsecret123')).toBe(true);
    expect(gets()).toHaveLength(1);
    expect(page()).toContain('whsec_…abcd');
  });

  it('later views show only the hint', async () => {
    await render({ 'GET /webhook': () => json(200, HOOK) });
    expect(page()).toContain('whsec_…abcd');
    expect(page()).not.toContain("won't be shown again");
  });

  it("shows the API's message under the URL field for 400 INVALID_REQUEST", async () => {
    const rule = 'url must be https://, up to 2000 characters, with no user name, password or # fragment.';
    await render({ 'GET /webhook': NONE, 'PUT /webhook': () => apiError(400, 'INVALID_REQUEST', rule) });
    await type('https://hooks.example.com/x');
    await click(button('Create webhook'));
    expect(page()).toContain(rule);
    expect(notifyError).not.toHaveBeenCalled();
  });
});

describe('a saved webhook', () => {
  it('shows its settings and last delivery', async () => {
    await render({ 'GET /webhook': () => json(200, HOOK) });
    expect(urlInput().value).toBe(HOOK.url);
    expect(page()).toContain('message.created');
    expect(page()).toContain('ticket.updated');
    expect(page()).toContain('Last delivery');
    expect(page()).toContain('Failed');
    expect(page()).toContain('502');
  });

  it('sends a test and reads ok, even on a 200', async () => {
    await render({ 'GET /webhook': () => json(200, HOOK), 'POST /webhook/test': () => json(200, { event: 'ping', ok: false, error: 'connection refused', at: '2026-10-25T10:00:00Z' }) });
    await click(button('Send test event'));
    expect(sent('POST', '/webhook/test')).toHaveLength(1);
    expect(page()).toContain('Test result');
    expect(page()).toContain('connection refused');
  });

  it('replaces the secret after a confirm, and shows the new one once', async () => {
    await render({ 'GET /webhook': () => json(200, HOOK), 'POST /webhook/secret': () => json(200, { ...HOOK, secret: 'whsec_rotated456' }) });
    await click(button('Replace secret'));
    expect(page()).toContain('The old secret stops working');
    expect(sent('POST', '/webhook/secret')).toHaveLength(0);
    await click(confirmButton('Replace secret'));
    expect(sent('POST', '/webhook/secret')).toHaveLength(1);
    expect(page()).toContain("Save this now: it won't be shown again.");
  });

  it.each([
    ['204', () => new Response(null, { status: 204 })],
    ['404 WEBHOOK_NOT_FOUND', () => apiError(404, 'WEBHOOK_NOT_FOUND')],
  ])('deletes after a confirm (%s) and returns to the empty form', async (_, answer) => {
    await render({ 'GET /webhook': () => json(200, HOOK), 'DELETE /webhook': answer });
    await click(button('Delete'));
    await click(confirmButton('Delete webhook'));
    expect(sent('DELETE', '/webhook')).toHaveLength(1);
    expect(button('Create webhook')).toBeDefined();
    expect(urlInput().value).toBe('');
    expect(page()).not.toContain('Last delivery');
    expect(notifyError).not.toHaveBeenCalled();
  });
});

describe('without integrations.write', () => {
  it('shows the values read-only, with no actions', async () => {
    await render({ 'GET /webhook': () => json(200, HOOK) }, (p) => p !== 'integrations.write');
    expect(urlInput().disabled).toBe(true);
    expect(page()).toContain('whsec_…abcd');
    for (const name of ['Save', 'Send test event', 'Replace secret', 'Delete']) expect(button(name)).toBeUndefined();
    expect(document.body.querySelector('[role="switch"]')).toBeNull();
  });

  it('shows no form when there is no webhook', async () => {
    await render({ 'GET /webhook': NONE }, (p) => p !== 'integrations.write');
    expect(page()).toContain('No webhook yet');
    expect(button('Create webhook')).toBeUndefined();
  });
});

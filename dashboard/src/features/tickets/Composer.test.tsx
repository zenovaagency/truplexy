import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import type { TicketDetail } from '@/lib/api/types';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { TooltipProvider } from '@/components/ui';
import { Composer, Transcript } from './TicketDetail';
import { createImageRefresher } from '@/lib/images/refresh';
import { toast } from 'sonner';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), info: vi.fn(), error: vi.fn() }) }));

const ticket = (over: Record<string, unknown> = {}) =>
  ({ id: 'tkt_1', status: 'open', escalated: false, conversation_id: 'conv_1', messages: [], replies: [], ...over }) as unknown as TicketDetail;

let root: Root | undefined;
let calls: { method: string; path: string; body: any }[] = [];
const draftResponse = { content: 'Your refund was sent on 3 January.', sources: [{ title: 'Refund policy', url: 'https://acme.test/refunds' }] };

beforeEach(() => {
  calls = [];
  sessionStorage.clear();
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const body = req.method === 'GET' ? undefined : await req.json().catch(() => undefined);
      const path = new URL(req.url).pathname.replace(/^\/v3/, '');
      calls.push({ method: req.method, path, body });
      const out = path.endsWith('/suggested-reply') ? draftResponse : { id: 'tkt_1', escalated: true };
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  configureApi({ transport: (req) => fetch(req) });
});

async function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const ctx = { scope: { tenant: 'acme', bot: 'support' }, bot: { id: 'support', name: 'Aria' }, bots: [], href: (p = '') => `/${p}`, can: () => true } as unknown as ScopeContextValue;
  await act(async () =>
    root!.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ScopeContext.Provider value={ctx}>
          <TooltipProvider>{node}</TooltipProvider>
        </ScopeContext.Provider>
      </QueryClientProvider>,
    ),
  );
  return container;
}

const area = (c: HTMLElement) => c.querySelector('textarea') as HTMLTextAreaElement;
const named = (c: HTMLElement, name: string) => [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;

describe('the reply box', () => {
  it('stays locked while the assistant is answering, with Take over as the way in', async () => {
    const c = await render(<Composer ticket={ticket()} />);
    expect(area(c).disabled).toBe(true);
    expect(area(c).placeholder).toMatch(/Take over/);
    expect(named(c, 'Send')!.disabled).toBe(true);
    expect(c.textContent).toMatch(/the customer sees that you joined/);

    await act(async () => named(c, 'Take over')!.click());
    expect(calls.find((x) => x.method === 'PATCH')).toMatchObject({ path: '/tickets/tkt_1', body: { escalated: true } });
  });

  it('is open for internal notes while the assistant is answering', async () => {
    const c = await render(<Composer ticket={ticket()} />);
    await act(async () => [...c.querySelectorAll('[role="radio"], button')].find((b) => b.textContent?.includes('Note'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(area(c).disabled).toBe(false);
    expect(area(c).placeholder).toMatch(/internal note/i);
  });

  it('is open once the conversation is taken over, and when there is no assistant to take over from', async () => {
    for (const over of [{ escalated: true }, { status: 'closed' }, { conversation_id: undefined }]) {
      const c = await render(<Composer ticket={ticket(over)} />);
      expect(area(c).disabled, JSON.stringify(over)).toBe(false);
      expect(c.textContent).not.toMatch(/Take it over to reply/);
      await act(async () => root?.unmount());
      root = undefined;
      document.body.innerHTML = '';
    }
  });
});

describe('an AI draft of the reply', () => {
  const type = async (el: HTMLTextAreaElement | HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
    await act(async () => {
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('is offered only once the reply box is open for a reply', async () => {
    for (const over of [{}, { status: 'closed' }, { conversation_id: undefined }]) {
      const c = await render(<Composer ticket={ticket(over)} />);
      expect(named(c, 'Suggest reply'), JSON.stringify(over)).toBeUndefined();
      await act(async () => root?.unmount());
      root = undefined;
      document.body.innerHTML = '';
    }
    const c = await render(<Composer ticket={ticket({ escalated: true })} />);
    expect(named(c, 'Suggest reply')).toBeDefined();
    await act(async () => [...c.querySelectorAll('[role="radio"], button')].find((b) => b.textContent?.includes('Note'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(named(c, 'Suggest reply')).toBeUndefined();
  });

  it('fills the reply box with the draft and lists its sources, without sending anything', async () => {
    const c = await render(<Composer ticket={ticket({ escalated: true })} />);
    await act(async () => named(c, 'Suggest reply')!.click());
    expect(calls).toEqual([{ method: 'POST', path: '/tickets/tkt_1/suggested-reply', body: {} }]);
    expect(area(c).value).toBe(draftResponse.content);
    expect(c.querySelector('[data-testid="draft-sources"]')!.textContent).toContain('Refund policy');
    expect(named(c, 'Regenerate')).toBeDefined();
    expect(calls.some((x) => x.path.endsWith('/replies'))).toBe(false);
    // Replacing an untouched draft needs no Undo.
    vi.mocked(toast).mockClear();
    await act(async () => named(c, 'Regenerate')!.click());
    expect(calls).toHaveLength(2);
    expect(toast).not.toHaveBeenCalled();
  });

  it('sends the hint with the request', async () => {
    const c = await render(<Composer ticket={ticket({ escalated: true })} />);
    await act(async () => named(c, 'Add hint')!.click());
    const input = c.querySelector('input[aria-label="Hint for the AI draft"]') as HTMLInputElement;
    await type(input, 'offer a refund');
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(calls.at(-1)).toMatchObject({ path: '/tickets/tkt_1/suggested-reply', body: { instructions: 'offer a refund' } });
  });

  it('keeps what the person wrote one Undo away', async () => {
    const shown = vi.mocked(toast);
    shown.mockClear();
    const c = await render(<Composer ticket={ticket({ escalated: true })} />);
    await type(area(c), 'My own words');
    await act(async () => named(c, 'Suggest reply')!.click());
    expect(area(c).value).toBe(draftResponse.content);
    expect(shown).toHaveBeenCalledTimes(1);
    const [, options] = shown.mock.calls[0] as unknown as [string, { action: { onClick: () => void } }];
    await act(async () => options.action.onClick());
    expect(area(c).value).toBe('My own words');
  });
});

describe('a notice in the transcript', () => {
  it('is a line, not a bubble', async () => {
    const t = ticket({
      messages: [
        { id: 'm1', role: 'user', content: 'Need help', author: 'customer', created_at: '2026-10-26T10:00:00Z' },
        { id: 'm2', role: 'assistant', content: 'Sam has joined and will reply here.', author: 'system', agent: 'Sam', created_at: '2026-10-26T10:01:00Z' },
      ],
    });
    const c = await render(<Transcript ticket={t} refresher={createImageRefresher(vi.fn(async () => {}))} />);
    const line = c.querySelector('[role="status"]')!;
    expect(line.textContent).toContain('Sam has joined and will reply here.');
    expect(line.closest('.bubble')).toBeNull();
    expect(c.querySelectorAll('.bubble')).toHaveLength(1);
  });
});

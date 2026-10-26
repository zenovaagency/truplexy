// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, TruplexyChatElement } from '../src/index';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('<truplexy-chat>', () => {
  it('registers and renders the launcher and greeting', () => {
    const el = mount({ demo: true, heading: 'Acme help', greeting: 'Hello **there**' });
    expect(el).toBeInstanceOf(TruplexyChatElement);
    const root = el.shadowRoot!;
    expect(root.querySelector('.title')!.textContent).toBe('Acme help');
    expect(root.querySelector('.greeting .bubble')!.innerHTML).toBe('<p>Hello <strong>there</strong></p>');
    expect((root.querySelector('.panel') as HTMLElement).hidden).toBe(true);
    el.remove();
  });

  it('takes the header name and logo from the profile unless you set your own', async () => {
    const el = mount({ demo: true });
    await tick(5);
    const root = el.shadowRoot!;
    expect(root.querySelector('.title')!.textContent).toBe('Acme Shop');
    expect(root.querySelector('.avatar img')!.getAttribute('src')).toBe('https://cdn.test/acme.png');
    el.setAttribute('heading', 'Mine');
    el.setAttribute('avatar', 'https://mine.test/a.png');
    expect(root.querySelector('.title')!.textContent).toBe('Mine');
    expect(root.querySelector('.avatar img')!.getAttribute('src')).toBe('https://mine.test/a.png');
    el.remove();
  });

  it('opens, sends a message in demo mode and fires events', async () => {
    const el = mount({ demo: true, details: 'off' });
    const events: string[] = [];
    for (const name of ['open', 'close', 'status', 'message']) el.addEventListener(`truplexy:${name}`, () => events.push(name));
    el.open();
    expect((el.shadowRoot!.querySelector('.panel') as HTMLElement).hidden).toBe(false);
    await el.send('where is order 12345');
    await tick();
    const bubbles = [...el.shadowRoot!.querySelectorAll('.msg:not(.greeting):not(.typing) .bubble')].map((b) => b.textContent);
    expect(bubbles[0]).toBe('where is order 12345');
    expect(bubbles[1]).toContain('#12345');
    el.close();
    expect(events).toEqual(['open', 'message', 'status', 'close']);
    el.remove();
  });

  it('shows that a person joined as a line between the messages, not a bubble, and not as unread', async () => {
    vi.useFakeTimers();
    try {
      const el = mount({ demo: true, details: 'off' });
      const root = el.shadowRoot!;
      await vi.advanceTimersByTimeAsync(10);
      const sent = el.send('where is order 12345');
      await vi.advanceTimersByTimeAsync(2000);
      await sent;
      // The window's own button hands the conversation to the team; Sam joins a few seconds later.
      (root.querySelector('.handoff') as HTMLButtonElement).click();
      await vi.advanceTimersByTimeAsync(5000);
      const line = root.querySelector('.msg.notice-line')!;
      expect(line.textContent).toBe('Sam has joined and will reply here.');
      expect(line.getAttribute('role')).toBe('status');
      expect(line.querySelector('.bubble')).toBeNull();
      // Sam's own message is a bubble; the pinned notice no longer repeats the line.
      expect([...root.querySelectorAll('.msg.agent .bubble')].map((b) => b.textContent)).toEqual([expect.stringContaining('Sam from the support team')]);
      expect((root.querySelector('.notice') as HTMLElement).hidden).toBe(true);
      el.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for name and email on the first message, then sends it with them', async () => {
    const el = mount({ demo: true });
    const root = el.shadowRoot!;
    const details = root.querySelector('.details') as HTMLFormElement;
    const composer = root.querySelector('.composer') as HTMLFormElement;
    expect(details.hidden).toBe(true);
    el.open();
    const input = root.querySelector('textarea')!;
    input.value = 'where is order 12345';
    composer.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    expect(details.hidden).toBe(false);
    expect(composer.hidden).toBe(true);

    // An unusable email is refused and the form stays.
    (root.querySelector('.details-name') as HTMLInputElement).value = 'Ada Lovelace';
    (root.querySelector('.details-email') as HTMLInputElement).value = 'nope';
    details.dispatchEvent(new Event('submit', { cancelable: true }));
    expect((root.querySelector('.details-error') as HTMLElement).hidden).toBe(false);
    expect(details.hidden).toBe(false);

    (root.querySelector('.details-email') as HTMLInputElement).value = 'ada@example.com';
    details.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick(1500);
    expect(details.hidden).toBe(true);
    expect(composer.hidden).toBe(false);
    const bubbles = [...root.querySelectorAll('.msg:not(.greeting):not(.typing) .bubble')].map((b) => b.textContent);
    expect(bubbles[0]).toBe('where is order 12345');
    expect(el.client!.getState().ticket).toMatchObject({ subject: 'Chat with Ada Lovelace' });
    el.remove();
  });

  it('links web results as sources, next to cited documents', async () => {
    const sources = [
      { kind: 'web', title: 'Shipping times', url: 'https://help.example.com/shipping', score: 0.71 },
      { document_id: 'doc_1', title: 'Returns', section: 'Refunds', url: 'https://shop.test/returns', score: 0.9 },
      { document_id: 'doc_2', title: 'Internal notes', score: 0.8 },
    ];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const { action } = JSON.parse(String(init.body));
      const body = action === 'message' ? { session: 'S1', message: { id: 'msg_1' }, reply: 'About 3 days.', status: 'answered', sources } : action === 'history' ? { session: null } : {};
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    });
    try {
      const el = mount({ endpoint: '/api/truplexy', details: 'off', showSources: true, storageKey: 'truplexy:sources-test' });
      await el.send('how long is shipping?');
      await tick();
      const links = [...el.shadowRoot!.querySelectorAll('.sources a')].map((a) => [a.textContent, a.getAttribute('href')]);
      expect(links).toEqual([['Shipping times', 'https://help.example.com/shipping'], ['Returns · Refunds', 'https://shop.test/returns']]);
      el.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows a closed conversation read-only and starts a new chat from the button', async () => {
    const key = 'truplexy:closed-test';
    const closedAt = new Date(Date.now() - 86_400_000).toISOString();
    localStorage.setItem(key, JSON.stringify({ session: 'S1', seen: 0, customer: { name: 'Ada', email: 'ada@example.com' }, ticket: { id: 'tkt_1', status: 'open' }, messages: [] }));
    const posted: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const { action } = JSON.parse(String(init.body));
      posted.push(action);
      const body =
        action === 'history'
          ? {
              session: 'S1',
              conversation: {
                status: 'open',
                escalated: false,
                ticket: { id: 'tkt_1', status: 'closed', closed_at: closedAt },
                messages: [
                  { id: 'm1', role: 'user', content: 'Where is my order?', created_at: closedAt },
                  { id: 'm2', role: 'assistant', content: 'It shipped yesterday.', created_at: closedAt },
                ],
              },
            }
          : {};
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    });
    try {
      const el = mount({ endpoint: '/api/truplexy', storageKey: key });
      await tick(10);
      const root = el.shadowRoot!;
      const closed = root.querySelector('.closed') as HTMLElement;
      const composer = root.querySelector('.composer') as HTMLFormElement;
      expect(closed.hidden).toBe(false);
      expect(composer.hidden).toBe(true);
      expect(root.querySelector('.closed-text')!.textContent).toBe('This conversation has been closed.');
      const bubbles = () => [...root.querySelectorAll('.msg:not(.greeting):not(.typing) .bubble')].map((b) => b.textContent);
      expect(bubbles()).toEqual(['Where is my order?', 'It shipped yesterday.']);
      // The chat stays in the browser for a few days, closed.
      expect(JSON.parse(localStorage.getItem(key)!).ticket).toEqual({ id: 'tkt_1', status: 'closed', closedAt });

      // Nothing can be sent, even by script.
      await el.send('one more thing');
      expect(posted).not.toContain('message');

      (root.querySelector('.closed-new') as HTMLButtonElement).click();
      expect(closed.hidden).toBe(true);
      expect(composer.hidden).toBe(false);
      expect(bubbles()).toEqual([]);
      expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ session: null, messages: [], customer: { name: 'Ada' } });
      el.remove();
    } finally {
      vi.unstubAllGlobals();
      localStorage.removeItem(key);
    }
  });

  it('links to Truplexy under the message box, in any language', () => {
    const el = mount({ demo: true });
    const brand = el.shadowRoot!.querySelector<HTMLAnchorElement>('.brand')!;
    expect(brand.textContent!.trim()).toBe('Powered by');
    expect(brand.getAttribute('aria-label')).toBeNull();
    const logos = brand.querySelectorAll('img');
    expect([...logos].map((i) => i.className)).toEqual(['wordmark-on-light', 'wordmark-on-dark']);
    expect([...logos].every((i) => i.alt === 'Truplexy' && i.src.startsWith('data:image/png;base64,'))).toBe(true);
    expect(brand.href).toMatch(/^https:\/\/truplexy\.com\/\?utm_source=chat-widget/);
    expect(brand.target).toBe('_blank');
    expect(brand.rel).toContain('noopener');
    el.labels = { poweredBy: 'Desarrollado por Truplexy' };
    expect(brand.textContent!.trim()).toBe('Desarrollado por');
    expect(brand.querySelectorAll('img')).toHaveLength(2);
    el.remove();
  });

  it('renders inline, always open', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const el = mount({ demo: true, mode: 'inline', target: host });
    expect(el.isOpen).toBe(true);
    expect((el.shadowRoot!.querySelector('.panel') as HTMLElement).hidden).toBe(false);
    host.remove();
  });
});

/** A server route whose profile carries the look the business set in the dashboard. */
function routeWith(widget: Record<string, unknown> | undefined, delay = 0) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const { action } = JSON.parse(init.body);
      calls.push(action);
      if (action === 'profile') {
        await new Promise((r) => setTimeout(r, delay));
        return new Response(JSON.stringify({ business: { name: 'Acme Shop', logo_url: 'https://cdn.test/logo.png' }, bot: { name: 'Aria' }, ...(widget && { widget }) }), { status: 200 });
      }
      return new Response(JSON.stringify({ session: null }), { status: 200 });
    }),
  );
  return calls;
}

const LOOK = { heading: 'Acme help', subtitle: 'We reply fast', greeting: 'Welcome in!', placeholder: 'Ask away', accent: '#c2410c', theme: 'dark', position: 'left', show_sources: true, details: 'off', picture_url: 'https://cdn.test/header.png' };

describe('the look set in the dashboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('is applied from the profile', async () => {
    routeWith(LOOK);
    const el = mount({ endpoint: '/api/truplexy', storageKey: 'look-1' });
    await tick(20);
    const root = el.shadowRoot!;
    expect(root.querySelector('.title')!.textContent).toBe('Acme help');
    expect(root.querySelector('.subtitle')!.textContent).toBe('We reply fast');
    expect(root.querySelector('.greeting .bubble')!.textContent).toBe('Welcome in!');
    expect(root.querySelector('textarea')!.placeholder).toBe('Ask away');
    expect(root.querySelector('.avatar img')!.getAttribute('src')).toBe('https://cdn.test/header.png');
    expect(el.style.getPropertyValue('--truplexy-accent')).toBe('#c2410c');
    expect(el.dataset.txTheme).toBe('dark');
    expect(el.dataset.txPosition).toBe('left');
    el.remove();
  });

  it('never beats what the host page sets', async () => {
    routeWith(LOOK);
    const el = mount({ endpoint: '/api/truplexy', storageKey: 'look-2', heading: 'Mine', accent: '#112233', theme: 'light', position: 'right', avatar: 'https://mine.test/a.png', labels: { placeholder: 'Translated hint' } });
    await tick(20);
    const root = el.shadowRoot!;
    expect(root.querySelector('.title')!.textContent).toBe('Mine');
    expect(root.querySelector('.avatar img')!.getAttribute('src')).toBe('https://mine.test/a.png');
    expect(el.style.getPropertyValue('--truplexy-accent')).toBe('#112233');
    expect(el.dataset.txTheme).toBe('light');
    expect(el.dataset.txPosition).toBe('right');
    // The labels property (translations) beats the dashboard's text; the dashboard still sets the rest.
    expect(root.querySelector('textarea')!.placeholder).toBe('Translated hint');
    expect(root.querySelector('.subtitle')!.textContent).toBe('We reply fast');
    el.remove();
  });

  it('leaves the window its own wording for what was left empty', async () => {
    // The profile leaves out an empty greeting, so the default greeting stays.
    routeWith({ accent: '#2338e6', theme: 'light', position: 'right', details: 'ask', show_sources: false });
    const el = mount({ endpoint: '/api/truplexy', storageKey: 'look-3' });
    await tick(20);
    const root = el.shadowRoot!;
    expect(root.querySelector('.title')!.textContent).toBe('Acme Shop');
    expect((root.querySelector('.greeting') as HTMLElement).hidden).toBe(false);
    expect(root.querySelector('.greeting .bubble')!.textContent).toBe('Hi there! How can we help you today?');
    expect(root.querySelector('.avatar img')!.getAttribute('src')).toBe('https://cdn.test/logo.png');
    el.remove();
  });

  it("skips the name and email form when the dashboard says so, unless the page asks for it", async () => {
    routeWith({ details: 'off' });
    const off = mount({ endpoint: '/api/truplexy', storageKey: 'look-4' });
    await tick(20);
    await off.client!.send('hello').catch(() => {});
    expect(off.client!.getState().needsDetails).toBe(false);
    off.remove();

    routeWith({ details: 'off' });
    const ask = mount({ endpoint: '/api/truplexy', storageKey: 'look-5', details: 'ask' });
    await tick(20);
    await ask.client!.send('hello').catch(() => {});
    expect(ask.client!.getState().needsDetails).toBe(true);
    ask.remove();
  });

  it('holds the launcher until the look is known, then shows it', async () => {
    routeWith(LOOK, 60);
    const el = mount({ endpoint: '/api/truplexy', storageKey: 'look-6' });
    expect(el.hasAttribute('data-tx-pending')).toBe(true);
    await tick(120);
    expect(el.hasAttribute('data-tx-pending')).toBe(false);
    el.remove();
  });

  it("shows the launcher anyway when the route can't say", async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const el = mount({ endpoint: '/api/truplexy', storageKey: 'look-7' });
    expect(el.hasAttribute('data-tx-pending')).toBe(true);
    await vi.advanceTimersByTimeAsync(1300);
    expect(el.hasAttribute('data-tx-pending')).toBe(false);
    vi.useRealTimers();
    el.remove();
  });

  it('looks right from the first paint on a page that loads again', async () => {
    routeWith(LOOK);
    const first = mount({ endpoint: '/api/truplexy', storageKey: 'look-8' });
    await tick(20);
    first.remove();
    // The next page's profile is slow, but the last look is used at once and nothing is held back.
    routeWith(LOOK, 200);
    const again = mount({ endpoint: '/api/truplexy', storageKey: 'look-8' });
    expect(again.hasAttribute('data-tx-pending')).toBe(false);
    expect(again.shadowRoot!.querySelector('.title')!.textContent).toBe('Acme help');
    expect(again.dataset.txPosition).toBe('left');
    again.remove();
  });

  it('is plain when the route passes no look on', async () => {
    routeWith(undefined);
    const el = mount({ endpoint: '/api/truplexy', storageKey: 'look-9' });
    await tick(20);
    expect(el.shadowRoot!.querySelector('.title')!.textContent).toBe('Acme Shop');
    expect(el.dataset.txTheme).toBe('light');
    expect(el.dataset.txPosition).toBe('right');
    el.remove();
  });
});

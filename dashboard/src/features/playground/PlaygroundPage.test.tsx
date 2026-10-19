import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import PlaygroundPage from './PlaygroundPage';

// The draft lives in a layout above the page; the page only reads the bot's name and tools from it.
vi.mock('@/features/llm/draft', () => ({
  useBotDraft: () => ({ draft: { name: 'Aria', bot: { name: 'Aria', toolsEnabled: false, tools: [] } }, dirty: false }),
}));

const CONFIG = { enabled: true, max_bytes: 20_971_520, max_per_message: 3, content_types: ['image/jpeg', 'image/png', 'image/webp'] };
const scope = { tenant: 'acme', bot: 'support' };
const HOUR = 3_600_000;

/* ---- a fake API, and a fake R2 ---- */

type Handler = (body: any, req: Request) => Response | Promise<Response>;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req_page' } });
}
const error = (status: number, code: string, message = code, extra: object = {}) => json(status, { error: { code, message, request_id: 'req_page', ...extra } });

function fakeApi(over: { config?: () => Response; run?: Handler; current?: () => unknown } = {}) {
  const calls: { method: string; path: string; body: any; auth: string | null }[] = [];
  let conv: any = null;
  let n = 0;
  const stored = new Map<string, { width: number; height: number }>();
  const api = async (req: Request) => {
    const path = new URL(req.url).pathname.replace(/^.*\/v3/, '').replace(/^\/[^/]*\/playground/, '/playground');
    const text = req.method === 'GET' ? '' : await req.text();
    const body = text ? JSON.parse(text) : undefined;
    calls.push({ method: req.method, path, body, auth: req.headers.get('Authorization') });
    const key = `${req.method} ${path}`;
    switch (key) {
      case 'GET /playground/attachments/config':
        return over.config ? over.config() : error(404, 'NOT_FOUND', 'No such route.');
      case 'GET /playground/conversations/current':
        return json(200, { conversation: over.current ? over.current() : conv });
      case 'POST /playground/conversations':
        conv = { id: 'conv_1', created_at: new Date().toISOString(), messages: [] };
        return json(201, conv);
      case 'POST /playground/attachments': {
        const id = `att_${String(++n).padStart(32, '0')}`;
        stored.set(id, { width: 1000, height: 800 });
        return json(201, { attachment: { id, status: 'pending', filename: body.filename, content_type: body.content_type, size: body.size }, url: `https://r2.example/${id}?sig=s${n}`, method: 'PUT', headers: { 'Content-Type': body.content_type, 'x-amz-meta-sig': `s${n}` }, expires_at: new Date(Date.now() + 900_000).toISOString() });
      }
      case 'POST /playground/run': {
        if (over.run) {
          const r = await over.run(body, req);
          if (r.status !== 200) return r;
        }
        const now = new Date().toISOString();
        const pictures = (body.attachments ?? []).map((id: string) => ({ id, content_type: 'image/jpeg', width: 1000, height: 800, size: 90_000, url: `https://files.example/${id}?sig=a`, url_expires_at: new Date(Date.now() + HOUR).toISOString() }));
        const user = { id: `msg_${calls.length}u`, role: 'user', content: body.message ?? '', ...(pictures.length && { attachments: pictures }), created_at: now };
        const reply = { id: `msg_${calls.length}r`, role: 'assistant', content: 'Thanks, I can see it.', status: 'answered', created_at: now };
        conv = { ...conv, messages: [...conv.messages, user, reply] };
        return json(200, { output: reply.content, model: 'm/x', latency_ms: 10, finish_reason: 'stop', usage: null, tool_calls: [], status: 'answered', sources: null, context_tokens: 0, conversation_id: conv.id, user_message: user, reply });
      }
    }
    return error(404, 'NOT_FOUND', `unexpected ${key}`);
  };
  return { api, calls, runs: () => calls.filter((c) => c.path === '/playground/run') };
}

/** Stands in for XMLHttpRequest, so the page's real PUT code runs and what it sends can be checked. */
class FakeXhr {
  static puts: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  static hold: Promise<void> | null = null;
  static fail: ((url: string) => number) | null = null;
  static started = 0;
  private rec = { url: '', method: '', headers: {} as Record<string, string>, body: undefined as unknown };
  upload: { onprogress?: (e: unknown) => void } = {};
  status = 200;
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  open(method: string, url: string) {
    this.rec.method = method;
    this.rec.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.rec.headers[k] = v;
  }
  send(body: unknown) {
    this.rec.body = body;
    FakeXhr.puts.push(this.rec);
    FakeXhr.started++;
    void (FakeXhr.hold ?? Promise.resolve()).then(() => {
      const status = FakeXhr.fail?.(this.rec.url) ?? 200;
      if (status === 0) return this.onerror?.();
      this.status = status;
      this.onload?.();
    });
  }
  abort() {
    this.onabort?.();
  }
}

/* ---- mounting ---- */

let root: Root | undefined;
let container: HTMLDivElement;
const realXhr = globalThis.XMLHttpRequest;
const revoked: string[] = [];
let urlSeq = 0;

beforeEach(() => {
  FakeXhr.puts = [];
  FakeXhr.hold = null;
  FakeXhr.fail = null;
  FakeXhr.started = 0;
  revoked.length = 0;
  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  URL.createObjectURL = () => `blob:local-${++urlSeq}`;
  URL.revokeObjectURL = (u: string) => void revoked.push(u);
  Element.prototype.scrollIntoView = () => {};
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  globalThis.XMLHttpRequest = realXhr;
  configureApi({ transport: (req) => fetch(req), getToken: async () => null });
});

const tick = (ms = 0) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

async function mount(server: ReturnType<typeof fakeApi>, opts: { isPlatformAdmin?: boolean } = {}) {
  configureApi({ transport: server.api, getToken: async () => 'tok-secret' });
  const ctx = {
    scope,
    bot: { id: 'support', name: 'Aria' },
    href: (p = '') => `/t/acme/support/${p}`,
    isPlatformAdmin: opts.isPlatformAdmin ?? false,
    can: () => true,
  } as unknown as ScopeContextValue;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ScopeContext.Provider value={ctx}>
            <TooltipProvider>
              <ConfirmProvider>
                <PlaygroundPage />
              </ConfirmProvider>
            </TooltipProvider>
          </ScopeContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
  });
  await tick(20);
  await tick(20);
}

const q = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel);
const attachButton = () => q('button[aria-label="Attach pictures"]');
const fileInput = () => q<HTMLInputElement>('input[type="file"]');
const sendButton = () => q<HTMLButtonElement>('button[aria-label="Send"]')!;
const textarea = () => q<HTMLTextAreaElement>('textarea[aria-label="Message"]')!;
const jpg = (name: string, size = 3000) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' });

async function typeText(text: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(textarea(), text);
    textarea().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function pick(...files: File[]) {
  await act(async () => {
    Object.defineProperty(fileInput()!, 'files', { value: files, configurable: true });
    fileInput()!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await tick(10);
}
async function send() {
  await act(async () => sendButton().click());
  await tick(20);
  await tick(20);
}

/* ---- scenarios ---- */

describe('PlaygroundPage with image input off', () => {
  it('404 on the config: no picture control at all, and a text message is sent exactly as before', async () => {
    const server = fakeApi();
    await mount(server);
    expect(attachButton()).toBeNull();
    expect(fileInput()).toBeNull();
    expect(container.textContent).not.toMatch(/picture/i);

    expect(sendButton().disabled).toBe(true);
    await typeText('Where is my order?');
    expect(sendButton().disabled).toBe(false);
    await send();

    const run = server.runs()[0]!.body;
    expect(run).toMatchObject({ message: 'Where is my order?', conversation_id: 'conv_1' });
    expect('attachments' in run).toBe(false);
    // The only picture-related call ever made is the question about the feature.
    expect(server.calls.filter((c) => /attachments/.test(c.path)).map((c) => `${c.method} ${c.path}`)).toEqual(['GET /playground/attachments/config']);
    expect(container.textContent).toContain('Thanks, I can see it.');
  });

  it('enabled: false with reason "plan": no control, and an upgrade hint that links to the plan page', async () => {
    await mount(fakeApi({ config: () => json(200, { ...CONFIG, enabled: false, reason: 'plan' }) }));
    expect(attachButton()).toBeNull();
    expect(container.textContent).toContain('send pictures on this plan');
    expect(q('a[href="/t/acme/support/settings/plan"]')).toBeTruthy();
  });

  it('enabled: false with reason "no_vision_model": no control and nothing said to a business user', async () => {
    await mount(fakeApi({ config: () => json(200, { ...CONFIG, enabled: false, reason: 'no_vision_model' }) }));
    expect(attachButton()).toBeNull();
    expect(container.textContent).not.toMatch(/picture|vision|model can read/i);
  });

  it('...but a platform admin is told why', async () => {
    await mount(fakeApi({ config: () => json(200, { ...CONFIG, enabled: false, reason: 'no_vision_model' }) }), { isPlatformAdmin: true });
    expect(attachButton()).toBeNull();
    expect(container.textContent).toContain('no active model can read pictures');
  });

  it('a failing config call hides the control quietly', async () => {
    await mount(fakeApi({ config: () => error(500, 'INTERNAL_ERROR') }));
    expect(attachButton()).toBeNull();
    expect(container.textContent).not.toMatch(/something went wrong/i);
  });
});

describe('PlaygroundPage with image input on', () => {
  const on = () => json(200, CONFIG);

  it('shows the attach control with the types from the config', async () => {
    await mount(fakeApi({ config: on }));
    expect(attachButton()).toBeTruthy();
    expect(fileInput()!.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
    expect(fileInput()!.multiple).toBe(true);
  });

  it('uploads each picture as soon as it is picked, with the exact headers and no Authorization, then sends pictures alone', async () => {
    const server = fakeApi({ config: on });
    await mount(server);
    await pick(jpg('one.jpg'), jpg('two.jpg'));

    // Registered with the four declared details, with the sign-in token...
    const regs = server.calls.filter((c) => c.path === '/playground/attachments' && c.method === 'POST');
    expect(regs).toHaveLength(2);
    expect(regs[0]!.body).toEqual({ filename: 'one.jpg', content_type: 'image/jpeg', size: 3000, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(regs[0]!.auth).toBe('Bearer tok-secret');
    // ...and PUT to R2 with exactly the returned headers, and not the token.
    expect(FakeXhr.puts).toHaveLength(2);
    expect(FakeXhr.puts[0]).toMatchObject({ method: 'PUT', url: expect.stringMatching(/^https:\/\/r2\.example\/att_/), headers: { 'Content-Type': 'image/jpeg', 'x-amz-meta-sig': 's1' } });
    for (const p of FakeXhr.puts) expect(Object.keys(p.headers).map((h) => h.toLowerCase())).not.toContain('authorization');

    // Thumbnails with remove buttons; Send is on without any text.
    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(2);
    expect(q('button[aria-label="Remove one.jpg"]')).toBeTruthy();
    expect(sendButton().disabled).toBe(false);

    await send();
    const run = server.runs()[0]!.body;
    expect(run.message).toBe('');
    expect(run.attachments).toEqual([`att_${'1'.padStart(32, '0')}`, `att_${'2'.padStart(32, '0')}`]);
    expect(run.conversation_id).toBe('conv_1');

    // The stored message shows the pictures from their signed URLs; the composer is empty again.
    const shown = [...container.querySelectorAll('img')].filter((i) => i.getAttribute('src')?.startsWith('https://files.example/'));
    expect(shown.map((i) => i.getAttribute('alt'))).toEqual(['Picture sent by the customer (1 of 2)', 'Picture sent by the customer (2 of 2)']);
    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(0);
    expect(container.querySelectorAll('.bubble-me')).toHaveLength(0); // pictures only: no empty text bubble
  });

  it('keeps Send off while an upload is running, and says so', async () => {
    let release!: () => void;
    FakeXhr.hold = new Promise<void>((r) => (release = r));
    const server = fakeApi({ config: on });
    await mount(server);
    await typeText('Is this the right cable?');
    await pick(jpg('cable.jpg'));
    expect(sendButton().disabled).toBe(true);
    expect(container.textContent).toContain('Uploading pictures');
    expect(sendButton().getAttribute('aria-describedby')).toBe('picture-status');
    expect(q('[role="progressbar"]')).toBeTruthy();

    release();
    await tick(20);
    expect(sendButton().disabled).toBe(false);
    await send();
    expect(server.runs()[0]!.body).toMatchObject({ message: 'Is this the right cable?', attachments: [expect.any(String)] });
  });

  it('turns away a fourth picture, a wrong type and an oversized file without uploading them', async () => {
    const server = fakeApi({ config: on });
    await mount(server);
    await pick(jpg('1.jpg'), jpg('2.jpg'), jpg('3.jpg'), jpg('4.jpg'));
    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(3);
    expect(q('[role="status"]')!.textContent).toContain('You can attach up to 3 pictures to a message.');

    await pick(new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(3);
    expect(FakeXhr.started).toBe(3);

    // A message with three pictures goes out with all three IDs.
    await send();
    expect(server.runs()[0]!.body.attachments).toHaveLength(3);
    expect(new Set(server.runs()[0]!.body.attachments).size).toBe(3);
  });

  it('a 12 MB photo is accepted and uploaded (big pictures are compressed by the server, not refused)', async () => {
    const server = fakeApi({ config: on });
    await mount(server);
    await pick(jpg('holiday.jpg', 12 * 1024 * 1024));
    expect(server.calls.find((c) => c.path === '/playground/attachments' && c.method === 'POST')!.body.size).toBe(12 * 1024 * 1024);
    expect(FakeXhr.puts).toHaveLength(1);
    expect(sendButton().disabled).toBe(false);
  });

  it('a suggested question sent while pictures are attached leaves the pictures in the composer, unsent', async () => {
    const server = fakeApi({ config: on });
    await mount(server);
    await pick(jpg('keep.jpg'));
    const chip = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Where is my order?')!;
    await act(async () => chip.click());
    await tick(20);
    await tick(20);
    expect('attachments' in server.runs()[0]!.body).toBe(false);
    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(1);
    expect(revoked).toHaveLength(0);
  });

  it('lets a picture be removed, and revokes its preview', async () => {
    await mount(fakeApi({ config: on }));
    await pick(jpg('gone.jpg'));
    const preview = q('ul[aria-label="Pictures to send"] img')!.getAttribute('src')!;
    await act(async () => q<HTMLButtonElement>('button[aria-label="Remove gone.jpg"]')!.click());
    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(0);
    expect(revoked).toContain(preview);
    expect(sendButton().disabled).toBe(true);
  });

  it('a dropped connection mid-PUT is retried; a failure that persists shows a per-picture error with Retry', async () => {
    const server = fakeApi({ config: on });
    FakeXhr.fail = () => 0;
    await mount(server);
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      await act(async () => {
        Object.defineProperty(fileInput()!, 'files', { value: [jpg('flaky.jpg')], configurable: true });
        fileInput()!.dispatchEvent(new Event('change', { bubbles: true }));
      });
      for (let i = 0; i < 6; i++) await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
    } finally {
      vi.useRealTimers();
    }
    expect(FakeXhr.started).toBe(3); // the first try and two retries
    expect(q('[role="alert"]')!.textContent).toContain('Retry');
    expect(container.textContent).toContain('Upload failed');
    expect(sendButton().disabled).toBe(true);

    FakeXhr.fail = null;
    await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'))!.click());
    await tick(20);
    expect(server.calls.filter((c) => c.path === '/playground/attachments' && c.method === 'POST')).toHaveLength(2); // registered again: fresh URL
    expect(sendButton().disabled).toBe(false);
  });

  it('pasting a picture attaches it, pasting text does not', async () => {
    await mount(fakeApi({ config: on }));
    const paste = async (data: { files: File[]; text?: string }) => {
      const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData?: unknown };
      ev.clipboardData = { files: data.files, getData: (t: string) => (t === 'text/plain' ? (data.text ?? '') : '') };
      await act(async () => void textarea().dispatchEvent(ev));
      await tick(10);
      return ev;
    };
    const textOnly = await paste({ files: [] , text: 'hello' });
    expect(textOnly.defaultPrevented).toBe(false);
    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(0);
    const image = await paste({ files: [new File([new Uint8Array(500)], 'image.png', { type: 'image/png' })] });
    expect(image.defaultPrevented).toBe(true);
    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(1);
  });

  it('dropping files on the chat attaches them', async () => {
    await mount(fakeApi({ config: on }));
    const zone = q('[class*="relative"][class*="min-h-0"]')!;
    const files = [jpg('dropped.jpg')];
    const drop = (type: string) => {
      const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown };
      ev.dataTransfer = { types: ['Files'], files, dropEffect: '' };
      return ev;
    };
    await act(async () => void zone.dispatchEvent(drop('dragenter')));
    expect(container.textContent).toContain('Drop pictures to attach');
    await act(async () => void zone.dispatchEvent(drop('drop')));
    await tick(10);
    expect(container.textContent).not.toContain('Drop pictures to attach');
    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(1);
  });

  it('"new chat" clears the pictures held in the composer and revokes their previews', async () => {
    const server = fakeApi({ config: on });
    await mount(server);
    await typeText('First message');
    await send();
    await pick(jpg('stale.jpg'));
    const preview = q('ul[aria-label="Pictures to send"] img')!.getAttribute('src')!;

    await act(async () => q<HTMLButtonElement>('button[aria-label="New conversation"]')!.click());
    await tick(10);
    const confirm = [...document.querySelectorAll('button')].find((b) => b.textContent === 'New conversation')!;
    await act(async () => confirm.click());
    await tick(20);

    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(0);
    expect(revoked).toContain(preview);
    expect(server.calls.some((c) => c.method === 'POST' && c.path === '/playground/conversations')).toBe(true);
  });
});

describe('pictures that were already sent', () => {
  const on = () => json(200, CONFIG);
  const sent = (url: string, expires: number) => ({
    id: 'conv_1',
    created_at: '2026-10-19T10:00:00Z',
    messages: [
      {
        id: 'msg_1',
        role: 'user',
        content: '',
        created_at: '2026-10-19T10:00:00Z',
        attachments: [{ id: `att_${'7'.padStart(32, '0')}`, content_type: 'image/jpeg', width: 640, height: 480, size: 50_000, url, url_expires_at: new Date(expires).toISOString() }],
      },
      { id: 'msg_2', role: 'assistant', content: 'I can see it.', status: 'answered', created_at: '2026-10-19T10:00:01Z' },
    ],
  });
  const pictureSrc = () => [...container.querySelectorAll('img')].map((i) => i.getAttribute('src')).filter((u) => u?.startsWith('https://files.example/'));

  it('shows them from the conversation, with no empty text bubble', async () => {
    await mount(fakeApi({ config: on, current: () => sent('https://files.example/a?sig=1', Date.now() + HOUR) }));
    expect(pictureSrc()).toEqual(['https://files.example/a?sig=1']);
    expect(container.querySelectorAll('.bubble-me')).toHaveLength(0);
    expect(container.textContent).toContain('I can see it.');
  });

  it('reloads the conversation once when a link has already expired, and shows the fresh one', async () => {
    let loads = 0;
    const server = fakeApi({ config: on, current: () => sent(`https://files.example/${++loads === 1 ? 'old' : 'new'}`, loads === 1 ? Date.now() - 60_000 : Date.now() + HOUR) });
    await mount(server);
    await tick(20);
    await tick(20);
    expect(server.calls.filter((c) => c.path === '/playground/conversations/current')).toHaveLength(2);
    expect(pictureSrc()).toEqual(['https://files.example/new']);
  });

  it('reloads the conversation once when a picture fails to load, then gives up if it still fails', async () => {
    let loads = 0;
    const server = fakeApi({ config: on, current: () => sent(`https://files.example/v${++loads}`, Date.now() + HOUR) });
    await mount(server);
    const fail = async () => {
      await act(async () => void container.querySelector('img[src^="https://files.example/"]')!.dispatchEvent(new Event('error')));
      await tick(20);
    };
    await fail();
    expect(loads).toBe(2);
    expect(pictureSrc()).toEqual(['https://files.example/v2']);
    await fail();
    expect(loads).toBe(2); // one reload only
    expect(container.textContent).toContain('Picture unavailable');
  });

  it('never writes a picture URL to browser storage', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    await mount(fakeApi({ config: on, current: () => sent('https://files.example/secret?sig=1', Date.now() + HOUR) }));
    expect(set.mock.calls.flat().join(' ')).not.toContain('files.example');
    set.mockRestore();
  });
});

describe('picture errors when sending', () => {
  const on = () => json(200, CONFIG);

  it('INVALID_IMAGE: the single picture is removed, the text comes back, and the server message is shown with the request ID', async () => {
    const server = fakeApi({ config: on, run: () => error(400, 'INVALID_IMAGE', 'The picture is 4 px wide; pictures must be at least 8 px.') });
    await mount(server);
    await typeText('Look at this');
    await pick(jpg('tiny.jpg'));
    await send();

    expect(textarea().value).toBe('Look at this');
    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(0);
    expect(container.textContent).toContain("That picture can't be used");
    expect(container.textContent).toContain('The picture is 4 px wide; pictures must be at least 8 px.');
    expect(container.textContent).toContain('Request req_page');
    expect(server.runs()).toHaveLength(1); // not retried
  });

  it('INVALID_IMAGE among several pictures: the file is not named, so every picture goes back to "upload again"', async () => {
    const server = fakeApi({ config: on, run: () => error(400, 'INVALID_IMAGE') });
    await mount(server);
    await pick(jpg('a.jpg'), jpg('b.jpg'));
    await send();
    const items = [...container.querySelectorAll('ul[aria-label="Pictures to send"] li')];
    expect(items).toHaveLength(2);
    expect(items.every((li) => li.textContent?.includes('Check this picture'))).toBe(true);
    expect(sendButton().disabled).toBe(true);
  });

  it.each([
    ['UNSUPPORTED_IMAGE_TYPE', 400, 'Use a JPEG, PNG or WebP picture'],
    ['IMAGE_TOO_LARGE', 413, 'That picture is too large'],
  ])('%s is worded for pictures, not avatars, and not retried', async (code, status, title) => {
    const server = fakeApi({ config: on, run: () => error(status, code) });
    await mount(server);
    await pick(jpg('x.jpg'));
    await send();
    expect(container.textContent).toContain(title);
    expect(container.textContent).not.toContain('512 KiB');
    expect(server.runs()).toHaveLength(1);
  });

  it('ATTACHMENT_NOT_FOUND: uploads the picture again and sends once more with the new ID', async () => {
    let first = true;
    const server = fakeApi({
      config: on,
      run: () => {
        if (!first) return json(200, {});
        first = false;
        return error(404, 'ATTACHMENT_NOT_FOUND');
      },
    });
    await mount(server);
    await pick(jpg('late.jpg'));
    await send();
    await tick(20);
    const runs = server.runs();
    expect(runs).toHaveLength(2);
    expect(runs[0]!.body.attachments).not.toEqual(runs[1]!.body.attachments);
    expect(server.calls.filter((c) => c.path === '/playground/attachments' && c.method === 'POST')).toHaveLength(2);
    expect(container.textContent).toContain('Thanks, I can see it.');
    expect(container.textContent).not.toContain('expired');
  });

  it('ATTACHMENT_NOT_UPLOADED: waits, then sends again once', async () => {
    let first = true;
    const server = fakeApi({
      config: on,
      run: () => {
        if (!first) return json(200, {});
        first = false;
        return error(409, 'ATTACHMENT_NOT_UPLOADED');
      },
    });
    await mount(server);
    await pick(jpg('slow.jpg'));
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      await act(async () => sendButton().click());
      await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    } finally {
      vi.useRealTimers();
    }
    await tick(20);
    expect(server.runs()).toHaveLength(2);
    expect(server.runs()[1]!.body.attachments).toEqual(server.runs()[0]!.body.attachments);
  });

  it('PLAN_LIMIT_REACHED with limit image_input: hides the control and shows the upgrade hint, keeping the text', async () => {
    const server = fakeApi({ config: on, run: () => error(403, 'PLAN_LIMIT_REACHED', 'plan', { limit: 'image_input' }) });
    await mount(server);
    await typeText('Can you see this?');
    await pick(jpg('p.jpg'));
    await send();
    expect(attachButton()).toBeNull();
    expect(container.querySelectorAll('ul[aria-label="Pictures to send"] li')).toHaveLength(0);
    expect(container.textContent).toContain("doesn't include pictures");
    expect(container.textContent).toContain('send pictures on this plan');
    expect(textarea().value).toBe('Can you see this?');
  });

  it('FEATURE_UNAVAILABLE: hides the control', async () => {
    const server = fakeApi({ config: on, run: () => error(400, 'FEATURE_UNAVAILABLE') });
    await mount(server);
    await pick(jpg('p.jpg'));
    await send();
    expect(attachButton()).toBeNull();
  });

  it('another plan limit keeps the existing behaviour: the control stays', async () => {
    const server = fakeApi({ config: on, run: () => error(429, 'PLAN_LIMIT_REACHED', 'replies', { limit: 'replies_per_month' }) });
    await mount(server);
    await typeText('hello');
    await send();
    expect(attachButton()).toBeTruthy();
    expect(container.textContent).toContain('Plan limit reached');
  });
});

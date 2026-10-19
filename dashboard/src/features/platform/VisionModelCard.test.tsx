import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import type { PlatformSettings } from '@/lib/api/types';
import { createQueryClient } from '@/lib/query-client';
import { TooltipProvider } from '@/components/ui';
import { VisionModelCard } from './PlatformPages';

// The first test pays for loading the page's modules.
vi.setConfig({ testTimeout: 30_000 });

vi.mock('@/lib/notify', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn(), notifyInfo: vi.fn() }));

type Vision = PlatformSettings['vision_model'];

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req_vision' } });
const failure = (status: number, code: string, message = code) => json(status, { error: { code, message, request_id: 'req_vision' } });
const settings = (over: Partial<Vision> = {}): PlatformSettings => ({
  vision_model: { value: '', default: 'google/gemini-3.1-flash-lite', effective: 'google/gemini-3.1-flash-lite', source: 'env', ...over },
});

/* ---- a fake API, and OpenRouter's public list for the picker ---- */

function fakeApi(read: () => Response, patch: (body: { vision_model: string | null }) => Response = (b) => json(200, settings(b.vision_model ? { value: b.vision_model, effective: b.vision_model, source: 'console' } : {}))) {
  const sent: { method: string; path: string; body?: any }[] = [];
  const api = async (req: Request) => {
    const body = req.method === 'GET' ? undefined : await req.json();
    sent.push({ method: req.method, path: new URL(req.url).pathname, body });
    return req.method === 'GET' ? read() : patch(body);
  };
  return { api, sent, patches: () => sent.filter((s) => s.method === 'PATCH') };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json(200, {
        data: [
          { id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', pricing: { prompt: '0.0000001', completion: '0.0000004' }, context_length: 1_000_000, architecture: { input_modalities: ['text', 'image'] } },
          { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', pricing: { prompt: '0.0000003', completion: '0.0000011' }, context_length: 128_000, architecture: { input_modalities: ['text'] } },
        ],
      }),
    ),
  );
});

/* ---- mounting ---- */

let root: Root | null = null;
let container: HTMLDivElement;
let qc: QueryClient;

const tick = (ms = 0) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function mount(server: ReturnType<typeof fakeApi>) {
  configureApi({ transport: server.api, getToken: async () => 'tok-secret' });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  qc = createQueryClient();
  qc.setDefaultOptions({ queries: { retry: false, staleTime: 60_000 } });
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <TooltipProvider>
            <VisionModelCard />
          </TooltipProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
  });
  await tick(30);
  await tick(30);
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container?.remove();
  vi.unstubAllGlobals();
});

const text = () => container.textContent ?? '';
const input = () => container.querySelector<HTMLInputElement>('input')!;
const button = (name: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement | undefined;

async function type(value: string) {
  const el = input();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('the vision model card', () => {
  it('shows nothing against an API that predates the setting (404)', async () => {
    await mount(fakeApi(() => failure(404, 'NOT_FOUND', 'route not found')));
    expect(container.querySelector('section')).toBeNull();
    expect(text()).toBe('');
  });

  it('shows the model in use and that it is the server default', async () => {
    await mount(fakeApi(() => json(200, settings())));
    expect(text()).toContain('Vision model');
    expect(text()).toContain('Server default');
    expect(text()).toContain('In use: google/gemini-3.1-flash-lite');
    expect(button('Use the server default')).toBeUndefined();
    expect(input().value).toBe('');
    expect(input().placeholder).toBe('google/gemini-3.1-flash-lite');
  });

  it('warns when no model is in use at all', async () => {
    await mount(fakeApi(() => json(200, settings({ default: '', effective: '', source: 'none' }))));
    expect(text()).toContain('No vision model is in use');
    expect(text()).toContain('hide the attach button');
    expect(text()).not.toContain('In use:');
  });

  it('keeps Save off until the box holds a changed, well-formed model ID', async () => {
    const server = fakeApi(() => json(200, settings()));
    await mount(server);
    const save = () => button('Save')!;
    expect(save().disabled).toBe(true);
    await type('not a model');
    expect(save().disabled).toBe(true);
    await type('openai/gpt-5-mini');
    expect(save().disabled).toBe(false);
  });

  it('saves the ID it was given and then shows it as set here', async () => {
    const server = fakeApi(() => json(200, settings()));
    await mount(server);
    await type('  openai/gpt-5-mini ');
    await act(async () => button('Save')!.click());
    await tick(30);
    expect(server.patches()).toEqual([{ method: 'PATCH', path: expect.stringMatching(/\/platform\/settings$/), body: { vision_model: 'openai/gpt-5-mini' } }]);
    expect(text()).toContain('Set here');
    expect(text()).toContain('In use: openai/gpt-5-mini');
    expect(button('Use the server default')).toBeDefined();
  });

  it('sends null to go back to the server default', async () => {
    const server = fakeApi(() => json(200, settings({ value: 'openai/gpt-5-mini', effective: 'openai/gpt-5-mini', source: 'console' })));
    await mount(server);
    expect(input().value).toBe('openai/gpt-5-mini');
    await act(async () => button('Use the server default')!.click());
    await tick(30);
    expect(server.patches().map((p) => p.body)).toEqual([{ vision_model: null }]);
    expect(text()).toContain('Server default');
    expect(input().value).toBe('');
  });

  it('says "Remove the setting" when the server has no default to fall back to', async () => {
    await mount(fakeApi(() => json(200, settings({ value: 'openai/gpt-5-mini', default: '', effective: 'openai/gpt-5-mini', source: 'console' }))));
    expect(button('Use the server default')).toBeUndefined();
    expect(button('Remove the setting')).toBeDefined();
  });

  it('keeps what was typed and leaves the setting alone when the API refuses it', async () => {
    const server = fakeApi(() => json(200, settings()), () => failure(400, 'INVALID_REQUEST', 'deepseek/deepseek-v3.2 can\'t read pictures.'));
    await mount(server);
    await type('deepseek/deepseek-v3.2');
    await act(async () => button('Save')!.click());
    await tick(30);
    expect(input().value).toBe('deepseek/deepseek-v3.2');
    expect(text()).toContain('Server default');
    expect(button('Save')!.disabled).toBe(false);
  });

  it('makes the playground ask again about pictures after a save', async () => {
    const server = fakeApi(() => json(200, settings()));
    await mount(server);
    const key = ['bot', 'acme', 'support', 'attachment-config'];
    qc.setQueryData(key, { enabled: false, reason: 'no_vision_model' });
    await type('openai/gpt-5-mini');
    await act(async () => button('Save')!.click());
    await tick(30);
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('offers only models that read pictures in the picker', async () => {
    await mount(fakeApi(() => json(200, settings())));
    expect(text()).toContain('1 OpenRouter models that read pictures');
  });
});

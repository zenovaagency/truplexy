import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { TooltipProvider } from '@/components/ui';
import { SendingPictures } from './ImageGuide';
import { IMAGE_CURL, IMAGE_ERRORS, IMAGE_FEATURE_CHECK, IMAGE_LIMITS, IMAGE_NOTES, IMAGE_SNIPPETS, IMAGE_WIDGET } from './snippets/images';

const CONFIG = { enabled: true, max_bytes: 20_971_520, max_per_message: 3, content_types: ['image/jpeg', 'image/png', 'image/webp'] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const NOT_FOUND = () => json(404, { error: { code: 'NOT_FOUND', message: 'No such route.', request_id: 'req_t' } });

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.unstubAllEnvs();
  vi.resetModules();
  configureApi({ transport: (req) => fetch(req), getToken: async () => null });
});

async function render(respond: () => Response, can = true) {
  configureApi({ transport: async () => respond() });
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const ctx = { scope: { tenant: 'acme', bot: 'support' }, can: () => can } as unknown as ScopeContextValue;
  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ScopeContext.Provider value={ctx}>
          <TooltipProvider>
            <SendingPictures />
          </TooltipProvider>
        </ScopeContext.Provider>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return container;
}

describe('the "Sending pictures" section', () => {
  it('is labelled "Coming soon" while the API answers 404 to the feature check', async () => {
    const c = await render(NOT_FOUND);
    expect(c.querySelector('h3')!.textContent).toBe('Sending pictures');
    expect(c.textContent).toContain('Coming soon');
    expect(c.textContent).toContain('Pictures are not live yet');
  });

  it('is labelled "Coming soon" when the feature check cannot be made', async () => {
    const c = await render(() => json(403, { error: { code: 'FORBIDDEN', message: 'no', request_id: 'r' } }));
    expect(c.textContent).toContain('Coming soon');
  });

  it('is labelled "Coming soon" for someone who may not run the check', async () => {
    const c = await render(() => json(200, CONFIG), false);
    expect(c.textContent).toContain('Coming soon');
  });

  it('loses the label once the API serves image input', async () => {
    const c = await render(() => json(200, CONFIG));
    expect(c.textContent).not.toContain('Coming soon');
    expect(c.textContent).not.toContain('not live yet');
  });

  it('loses the label when the API serves it but this plan or server cannot use it', async () => {
    for (const reason of ['plan', 'no_vision_model']) {
      const c = await render(() => json(200, { ...CONFIG, enabled: false, reason }));
      expect(c.textContent, reason).not.toContain('Coming soon');
      await act(async () => root?.unmount());
      root = undefined;
      document.body.innerHTML = '';
    }
  });

  it('is left out altogether with VITE_IMAGE_INPUT_GUIDE=hidden', async () => {
    // The flag is read when the module loads, so load a fresh copy of everything with it set.
    vi.stubEnv('VITE_IMAGE_INPUT_GUIDE', 'hidden');
    vi.resetModules();
    const [{ SendingPictures: Hidden, IMAGE_GUIDE_HIDDEN }, scope, ui, query, client] = await Promise.all([
      import('./ImageGuide'),
      import('@/lib/session/scope-context'),
      import('@/components/ui'),
      import('@tanstack/react-query'),
      import('@/lib/api/client'),
    ]);
    expect(IMAGE_GUIDE_HIDDEN).toBe(true);
    client.configureApi({ transport: async () => json(200, CONFIG) });
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const ctx = { scope: { tenant: 'acme', bot: 'support' }, can: () => true } as unknown as ScopeContextValue;
    await act(async () => {
      root!.render(
        <query.QueryClientProvider client={new query.QueryClient()}>
          <scope.ScopeContext.Provider value={ctx}>
            <ui.TooltipProvider>
              <Hidden />
            </ui.TooltipProvider>
          </scope.ScopeContext.Provider>
        </query.QueryClientProvider>,
      );
    });
    expect(container.innerHTML).toBe('');
  });


  it('explains the three steps, the browser variant, the limits, the notes, the feature check, the errors, idempotency and CORS', async () => {
    const c = await render(NOT_FOUND);
    const text = c.textContent!;
    for (const needle of ['Register', 'PUT', 'Send the message', 'POST /conversations/{id}/attachments', 'A website widget', 'Limits, and what happens to a picture', 'Behavior notes', 'Check that pictures are available', 'GET /profile', 'Errors', 'Idempotency-Key', 'CORS', 'single-use']) {
      expect(text, needle).toContain(needle);
    }
    expect(c.querySelector('a[href*="dashboard/README.md"]')).toBeTruthy();
  });
});

describe('the guide content', () => {
  it('has a server example in every language the guide has, plus curl', () => {
    expect(Object.keys(IMAGE_SNIPPETS).sort()).toEqual(['csharp', 'go', 'java', 'node', 'php', 'python', 'ruby']);
    expect(IMAGE_CURL).toContain('/attachments');
  });

  it('never puts the chat key on the request to storage', () => {
    // Every example says so where it PUTs; the languages whose helper client carries the key use a separate client.
    expect(IMAGE_SNIPPETS.python.code).toContain('httpx.AsyncClient');
    expect(IMAGE_SNIPPETS.csharp.code).toContain('new HttpClient()');
    expect(IMAGE_SNIPPETS.java.code).toContain('HttpClient.newHttpClient()');
    expect(IMAGE_CURL).toMatch(/PUT[\s\S]*No Authorization header/);
    for (const s of Object.values(IMAGE_SNIPPETS)) expect(s.code).not.toMatch(/Authorization/);
  });

  it('puts the chat key in server code only; the browser variant has none', () => {
    expect(IMAGE_WIDGET.browser.code).not.toMatch(/TRUPLEXY_CHAT_KEY|Bearer|tpx_|["']Authorization["']/i);
    expect(IMAGE_WIDGET.server.code).toContain('registerImage');
    expect(IMAGE_WIDGET.browser.code).toContain('uploadImage');
  });

  it('lists the errors and the limits from the contract', () => {
    expect(IMAGE_ERRORS.map((e) => e[0]).sort()).toEqual(['ATTACHMENT_NOT_FOUND', 'ATTACHMENT_NOT_UPLOADED', 'FEATURE_UNAVAILABLE', 'IMAGE_TOO_LARGE', 'INVALID_IMAGE', 'PLAN_LIMIT_REACHED', 'UNSUPPORTED_IMAGE_TYPE']);
    const limits = IMAGE_LIMITS.map(([, v]) => v).join(' ');
    for (const needle of ['1 to 3', 'JPEG, PNG and WebP', '20 MB', '20,971,520', '16,384', '1280', '1 MiB', 'EXIF', 'location', 'transparency']) expect(limits, needle).toContain(needle);
    expect(IMAGE_FEATURE_CHECK).toContain('getProfile');
  });

  it('keeps the older advice about placeholder messages, and says real pictures replace it', () => {
    const note = IMAGE_NOTES.find((n) => n.includes('[sent an attachment in Discord]'))!;
    expect(note).toContain('asks the customer to describe it');
    expect(note).toContain('replaces the need');
  });
});

/** Everything the public site builds its docs from, and the pages themselves. */
describe('the public docs cover pictures over plain HTTP', () => {
  const repo = join(process.cwd(), '..');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const site = () => walk(join(repo, 'src')).filter((f) => /\.(astro|ts|tsx|md|mdx)$/.test(f));
  const read = (path: string) => readFileSync(join(repo, path), 'utf8');

  it('the site does not import the dashboard’s React guide', () => {
    expect(site().length).toBeGreaterThan(10);
    for (const f of site()) expect(readFileSync(f, 'utf8'), relative(repo, f)).not.toMatch(/ImageGuide/);
  });

  it('the site names no SDK method that is not published yet', () => {
    for (const f of site()) {
      expect(readFileSync(f, 'utf8'), relative(repo, f)).not.toMatch(/registerImage|uploadImage|getAttachmentConfig|IMAGE_WIDGET|IMAGE_ENDPOINTS|IMAGE_FEATURE_CHECK/);
    }
  });

  it('/docs/api has the pictures section and the web-sdk and channel guides point to it', () => {
    expect(read('src/pages/docs/[id].astro')).toContain('<SendingPictures />');
    expect(read('src/components/docs/SendingPictures.astro')).toContain('id="pictures"');
    expect(read('src/pages/docs/web-sdk.astro')).toContain('/docs/api#pictures');
    expect(read('src/data/setup-guides.ts')).toContain('/docs/api');
  });

  it('the pictures tabs are built from the dashboard’s snippets, with curl', () => {
    const tabs = read('src/data/snippets.ts');
    expect(tabs).toContain('pictureTabs');
    expect(tabs).toContain('IMAGE_SNIPPETS');
    expect(tabs).toContain('IMAGE_CURL');
  });

  it('the shared language packs and endpoint table are as they were', () => {
    const dir = join(process.cwd(), 'src/features/integrations/snippets');
    for (const f of ['node', 'python', 'php', 'go', 'java', 'csharp', 'ruby', 'chat-api', 'types', 'web-sdk', 'wordpress-plugin']) {
      const text = readFileSync(join(dir, `${f}.ts`), 'utf8');
      expect(text, f).not.toMatch(/\/attachments|attachments:|image input|registerImage|uploadImage/i);
    }
  });
});

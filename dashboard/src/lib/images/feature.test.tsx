import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import { getPlaygroundAttachmentConfig } from '@/lib/api/endpoints/playground';
import { AttachButton, PictureHint, PictureTray } from '@/components/domain/PictureComposer';
import { TooltipProvider } from '@/components/ui';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { canAttach, featureFromConfig, isServed, lacksVisionModel, needsUpgrade, usePictureFeature, type PictureFeature } from './feature';

const CONFIG = { enabled: true, max_bytes: 20_971_520, max_per_message: 3, content_types: ['image/jpeg', 'image/png', 'image/webp'] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req_t' } });
const NOT_FOUND = () => json(404, { error: { code: 'NOT_FOUND', message: 'No such route.', request_id: 'req_t' } });
const scope = { tenant: 'acme', bot: 'support' };

afterEach(() => configureApi({ transport: (req) => fetch(req), getToken: async () => null }));

describe('getPlaygroundAttachmentConfig', () => {
  it('resolves to { enabled: false } on 404 NOT_FOUND: an API that predates the feature', async () => {
    configureApi({ transport: async () => NOT_FOUND() });
    await expect(getPlaygroundAttachmentConfig(scope)).resolves.toEqual({ enabled: false, unavailable: true });
  });

  it('returns the config as served', async () => {
    configureApi({ transport: async () => json(200, CONFIG) });
    await expect(getPlaygroundAttachmentConfig(scope)).resolves.toEqual(CONFIG);
  });

  it('sends the scope headers', async () => {
    const seen = vi.fn();
    configureApi({
      transport: async (req) => {
        seen(req.headers.get('X-Truplexy-Tenant'), req.headers.get('X-Truplexy-Bot'), new URL(req.url).pathname);
        return json(200, CONFIG);
      },
    });
    await getPlaygroundAttachmentConfig(scope);
    expect(seen).toHaveBeenCalledWith('acme', 'support', expect.stringMatching(/\/playground\/attachments\/config$/));
  });

  it('does not hide a lost business or bot behind "feature off": other 404s still throw', async () => {
    configureApi({ transport: async () => json(404, { error: { code: 'BOT_NOT_FOUND', message: 'x', request_id: 'r' } }) });
    await expect(getPlaygroundAttachmentConfig(scope)).rejects.toMatchObject({ code: 'BOT_NOT_FOUND' });
  });

  it('throws other failures, so they are not mistaken for "off"', async () => {
    configureApi({ transport: async () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'x', request_id: 'r' } }) });
    await expect(getPlaygroundAttachmentConfig(scope)).rejects.toMatchObject({ status: 500 });
  });
});

describe('featureFromConfig', () => {
  it('404 is "unavailable": the API predates the feature', () => {
    expect(featureFromConfig({ enabled: false, unavailable: true })).toEqual({ status: 'unavailable' });
  });

  it('enabled: false keeps the reason', () => {
    expect(featureFromConfig({ enabled: false, reason: 'plan' })).toEqual({ status: 'off', reason: 'plan' });
    expect(featureFromConfig({ enabled: false, reason: 'no_vision_model' })).toEqual({ status: 'off', reason: 'no_vision_model' });
    expect(featureFromConfig({ enabled: false })).toEqual({ status: 'off', reason: undefined });
  });

  it('enabled: true takes every limit from the config', () => {
    expect(featureFromConfig(CONFIG)).toEqual({ status: 'on', limits: { maxBytes: 20_971_520, maxPerMessage: 3, contentTypes: ['image/jpeg', 'image/png', 'image/webp'] } });
    const other = featureFromConfig({ enabled: true, max_bytes: 5_000_000, max_per_message: 2, content_types: ['image/jpeg'] });
    expect(other).toEqual({ status: 'on', limits: { maxBytes: 5_000_000, maxPerMessage: 2, contentTypes: ['image/jpeg'] } });
  });

  it('enabled: true without usable limits is treated as off: there is nothing to check against', () => {
    expect(featureFromConfig({ enabled: true }).status).toBe('off');
    expect(featureFromConfig({ ...CONFIG, content_types: [] }).status).toBe('off');
    expect(featureFromConfig({ ...CONFIG, max_per_message: 0 }).status).toBe('off');
  });

  it('classifies for the controls and the guide', () => {
    const on = featureFromConfig(CONFIG);
    expect([canAttach(on), isServed(on)]).toEqual([true, true]);
    const plan = featureFromConfig({ enabled: false, reason: 'plan' });
    expect([canAttach(plan), isServed(plan), needsUpgrade(plan), lacksVisionModel(plan)]).toEqual([false, true, true, false]);
    const novision = featureFromConfig({ enabled: false, reason: 'no_vision_model' });
    expect([needsUpgrade(novision), lacksVisionModel(novision)]).toEqual([false, true]);
    const gone = featureFromConfig({ enabled: false, unavailable: true });
    expect([canAttach(gone), isServed(gone)]).toEqual([false, false]);
  });
});

/* ---- the hook, and what the composer shows for each answer ---- */

function Probe({ onFeature }: { onFeature: (f: PictureFeature) => void }) {
  const { feature } = usePictureFeature();
  onFeature(feature);
  return <output>{feature.status}</output>;
}

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

async function mount(ui: ReactNode, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const ctx = { scope } as ScopeContextValue;
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ScopeContext.Provider value={ctx}>{ui}</ScopeContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { container, qc };
}

describe('usePictureFeature', () => {
  it('404: the feature is "unavailable", nothing is shown and no error is raised', async () => {
    const requests: string[] = [];
    configureApi({
      transport: async (req) => {
        requests.push(new URL(req.url).pathname);
        return NOT_FOUND();
      },
    });
    const seen: PictureFeature[] = [];
    const { container } = await mount(<Probe onFeature={(f) => seen.push(f)} />);
    expect(container.textContent).toBe('unavailable');
    expect(seen.at(-1)).toEqual({ status: 'unavailable' });
    // The only call made is the question itself: nothing registers, nothing uploads.
    expect(requests.map((p) => p.replace(/^.*\/playground/, '/playground'))).toEqual(['/playground/attachments/config']);
  });

  it('enabled: false: off, with the reason', async () => {
    configureApi({ transport: async () => json(200, { ...CONFIG, enabled: false, reason: 'plan' }) });
    const seen: PictureFeature[] = [];
    await mount(<Probe onFeature={(f) => seen.push(f)} />);
    expect(seen.at(-1)).toEqual({ status: 'off', reason: 'plan' });
  });

  it('enabled: true: on, with the limits from the config', async () => {
    configureApi({ transport: async () => json(200, CONFIG) });
    const seen: PictureFeature[] = [];
    await mount(<Probe onFeature={(f) => seen.push(f)} />);
    expect(seen.at(-1)).toMatchObject({ status: 'on', limits: { maxPerMessage: 3 } });
  });

  it('asks once and keeps the answer for the session', async () => {
    const transport = vi.fn(async () => json(200, CONFIG));
    configureApi({ transport });
    const { qc } = await mount(
      <>
        <Probe onFeature={() => {}} />
        <Probe onFeature={() => {}} />
      </>,
    );
    expect(transport).toHaveBeenCalledTimes(1);
    // Mounting the same bot again reuses the answer.
    await act(async () => root!.unmount());
    root = undefined;
    await mount(<Probe onFeature={() => {}} />, qc);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('asks again for another bot', async () => {
    const transport = vi.fn(async () => json(200, CONFIG));
    configureApi({ transport });
    const qc = new QueryClient();
    await mount(<Probe onFeature={() => {}} />, qc);
    await act(async () => root!.unmount());
    root = undefined;
    // A different bot: another scope in the provider.
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={qc}>
          <ScopeContext.Provider value={{ scope: { tenant: 'acme', bot: 'sales' } } as ScopeContextValue}>
            <Probe onFeature={() => {}} />
          </ScopeContext.Provider>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('a failed question (network, 403) is "unknown", treated as off, and raises nothing', async () => {
    configureApi({ transport: async () => json(403, { error: { code: 'FORBIDDEN', message: 'no', request_id: 'r' } }) });
    const seen: PictureFeature[] = [];
    await mount(<Probe onFeature={(f) => seen.push(f)} />);
    expect(seen.at(-1)).toEqual({ status: 'unknown' });
  });
});

describe('with the feature off the composer is exactly what it was', () => {
  const noop = () => {};
  const off: PictureFeature[] = [
    { status: 'pending' },
    { status: 'unavailable' },
    { status: 'unknown' },
    { status: 'off', reason: 'plan' },
    { status: 'off', reason: 'no_vision_model' },
    { status: 'off' },
  ];

  it.each(off)('no attach button for %j', (feature) => {
    expect(renderToStaticMarkup(<AttachButton feature={feature} onFiles={noop} />)).toBe('');
  });

  it('no thumbnails without pictures', () => {
    expect(renderToStaticMarkup(<PictureTray pictures={[]} set={{} as never} />)).toBe('');
  });

  it.each(off.filter((f) => !(f.status === 'off' && f.reason === 'plan')))('no hint for %j', (feature) => {
    expect(renderToStaticMarkup(<PictureHint feature={feature} upgradeTo="/plan" platformAdmin={false} modelsTo="/platform/models" />)).toBe('');
  });

  it('a platform admin, and only a platform admin, sees the missing-model hint', () => {
    const f: PictureFeature = { status: 'off', reason: 'no_vision_model' };
    const html = (admin: boolean) => renderToStaticMarkup(<MemoryRouter><PictureHint feature={f} platformAdmin={admin} modelsTo="/platform/models" /></MemoryRouter>);
    expect(html(false)).toBe('');
    expect(html(true)).toContain('no active model can read pictures');
  });

  it('the plan reason shows an upgrade hint that links to the plan page', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PictureHint feature={{ status: 'off', reason: 'plan' }} upgradeTo="/t/acme/support/settings/plan" />
      </MemoryRouter>,
    );
    expect(html).toContain('send pictures on this plan');
    expect(html).toContain('href="/t/acme/support/settings/plan"');
  });

  it('when on, the picker takes the types from the config and several files', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AttachButton feature={{ status: 'on', limits: { maxBytes: 1, maxPerMessage: 3, contentTypes: ['image/jpeg', 'image/png', 'image/webp'] } }} onFiles={noop} />
      </TooltipProvider>,
    );
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).toContain('multiple');
    expect(html).toContain('aria-label="Attach pictures"');
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import { buildPerformance, type PerformanceMode } from '@/lib/api/mock/performance';
import type { PerformanceStats } from '@/lib/api/types';
import { createQueryClient } from '@/lib/query-client';
import { notifyError } from '@/lib/notify';
import { resetPerformanceAvailability, usePerformanceMissing } from '@/lib/performance';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { TooltipProvider } from '@/components/ui';
import { PlatformPerformance } from './PerformancePage';

// The first test pays for loading the chart library.
vi.setConfig({ testTimeout: 30_000 });

vi.mock('@/lib/notify', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn(), notifyInfo: vi.fn() }));

const scope = { tenant: 'acme', bot: 'support' };

/* ---- a fake API ---- */

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req_perf' } });
const failure = (status: number, code: string, message = code) => json(status, { error: { code, message, request_id: 'req_perf' } });

const DAYS = ['2026-10-17', '2026-10-18', '2026-10-19'];

function stats(mode: PerformanceMode, over: (s: PerformanceStats) => PerformanceStats = (s) => s, platform = true) {
  const s = buildPerformance({
    from: DAYS[0]!,
    to: DAYS[2]!,
    scope: platform ? 'platform' : 'bot',
    mode,
    days: DAYS.map((date, i) => ({ date, replies: 40 + i * 10 })),
    tenants: platform
      ? [
          { tenant_id: 'acme', name: 'Acme Co', replies: 90 },
          { tenant_id: 'quiet', name: '', replies: 10 },
        ]
      : undefined,
  });
  return over(s);
}

type Answer = () => Response | Promise<Response>;

function fakeApi(answer: Answer) {
  const urls: URL[] = [];
  const api = async (req: Request) => {
    urls.push(new URL(req.url));
    return answer();
  };
  return { api, urls, hits: () => urls.length };
}

/* ---- mounting ---- */

let root: Root | null = null;
let container: HTMLDivElement;

const tick = (ms = 0) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function mount(node: 'platform', server: ReturnType<typeof fakeApi>, opts: { bots?: number } = {}) {
  configureApi({ transport: server.api, getToken: async () => 'tok-secret' });
  const bots = Array.from({ length: opts.bots ?? 2 }, (_, i) => ({ id: i ? `bot${i}` : 'support', name: i ? `Bot ${i}` : 'Aria' }));
  const ctx = { scope, bot: bots[0], bots, businessName: 'Acme', href: (p = '') => `/${p}`, isPlatformAdmin: node === 'platform', can: () => true } as unknown as ScopeContextValue;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const qc = createQueryClient();
  qc.setDefaultOptions({ queries: { retry: false, staleTime: 60_000 } });
  function Probe() {
    return <span data-testid="missing">{String(usePerformanceMissing(node))}</span>;
  }
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ScopeContext.Provider value={ctx}>
            <TooltipProvider>
              <Probe />
              <PlatformPerformance />
            </TooltipProvider>
          </ScopeContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
  });
  await tick(30);
  await tick(30);
}

const text = () => container.textContent ?? '';
const q = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel);
const heading = (name: string) => [...container.querySelectorAll('h2')].find((h) => h.textContent === name);
const button = (name: string) => [...container.querySelectorAll('button, [role="radio"]')].find((b) => b.textContent === name) as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  resetPerformanceAvailability();
  vi.mocked(notifyError).mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container?.remove();
});

describe('the shared Performance sections', () => {
  it('1. recording.http false: the request sections become a notice; the pipeline and retrieval still show', async () => {
    await mount('platform', fakeApi(() => json(200, stats('no_http'))));
    expect(text()).toContain('Request statistics are off on this server');
    expect(heading('Requests over time')).toBeFalsy();
    expect(heading('Latency by route')).toBeFalsy();
    expect(text()).not.toContain('No activity in this range');
    expect(heading("Where a reply's time goes")).toBeTruthy();
    expect(heading('Retrieval quality')).toBeTruthy();
    // zero is "not recorded", never "fast"
    const cards = container.querySelectorAll('.panel');
    const requestCards = [...cards].filter((c) => /^(Requests|Server error rate|p50 latency|p95 latency)/.test(c.textContent ?? ''));
    expect(requestCards).toHaveLength(4);
    for (const c of requestCards) expect(c.textContent).toContain('—');
  });

  it('2. a sample below 1 adds the sample note', async () => {
    await mount('platform', fakeApi(() => json(200, stats('sampled'))));
    expect(text()).toContain('based on a 25% sample');
  });

  it('3. recording.model_attempts false: says model statistics are off instead of an empty table', async () => {
    await mount('platform', fakeApi(() => json(200, stats('no_models'))));
    expect(text()).toContain('Model call statistics are off');
    expect(text()).not.toContain('No model calls in this range');
  });

  it('with model statistics on but no calls, says there are none', async () => {
    await mount('platform', fakeApi(() => json(200, stats('on', (s) => ({ ...s, models: [] })))));
    expect(text()).toContain('No model calls in this range');
    expect(text()).not.toContain('Model call statistics are off');
  });

  it('4. a range with requests but no replies: every stage shows 0 replies and nothing is NaN', async () => {
    await mount('platform', fakeApi(() => json(200, stats('noreplies'))));
    expect(heading("Where a reply's time goes")).toBeTruthy();
    const rows = [...container.querySelectorAll('tbody tr')].filter((r) => /Prepare|Quota|Retrieval|Web search|Model|Post-processing|Other/.test(r.textContent ?? ''));
    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(text()).toContain('No reply time was recorded in this range');
    expect(text()).not.toMatch(/NaN|undefined|Infinity/);
    expect(text()).toMatch(/0 replies/);
  });

  it('shows "No activity" when there are neither requests nor replies', async () => {
    await mount('platform', fakeApi(() => json(200, stats('empty'))));
    expect(text()).toContain('No activity in this range');
    expect(heading('Latency by route')).toBeFalsy();
  });

  it('5. a day with no requests is a gap in the latency, listed as "No requests" in the table', async () => {
    const withGap = (s: PerformanceStats): PerformanceStats => ({
      ...s,
      requests: { ...s.requests, by_day: s.requests.by_day.map((d, i) => (i === 1 ? { ...d, requests: 0, errors: 0, server_errors: 0, p50_ms: 0, p95_ms: 0 } : d)) },
    });
    await mount('platform', fakeApi(() => json(200, stats('on', withGap))));
    const rows = [...container.querySelectorAll('details tbody tr')];
    expect(rows).toHaveLength(3);
    expect(rows[1]!.textContent).toContain('No requests');
    expect(rows[1]!.textContent).not.toContain('0 ms');
    expect(rows[0]!.textContent).not.toContain('No requests');
  });

  it('explains "other" when it is over a third of reply time, and leaves it out otherwise', async () => {
    await mount('platform', fakeApi(() => json(200, stats('old'))));
    expect(text()).toMatch(/of reply time isn't itemised/);
    expect(text()).toContain('Other / not itemised');
    await act(async () => root!.unmount());
    root = null;
    container.remove();
    await mount('platform', fakeApi(() => json(200, stats('on'))));
    expect(text()).not.toMatch(/of reply time isn't itemised/);
    expect(text()).toContain('Other / not itemised'); // never hidden
  });

  it('shows "Ran for" beside every stage average', async () => {
    await mount('platform', fakeApi(() => json(200, stats('on'))));
    const web = [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.startsWith('Web search'));
    expect(web?.textContent).toMatch(/\d+ repl(y|ies)/);
  });

  it('colours the server error rate only past 1%, and says "High" in words too', async () => {
    await mount('platform', fakeApi(() => json(200, stats('on', (s) => ({ ...s, requests: { ...s.requests, server_error_rate: 0.0099 } })))));
    const card = () => [...container.querySelectorAll('.panel')].find((c) => c.textContent?.startsWith('Server error rate'))!;
    expect(card().textContent).not.toContain('High');
    expect(card().querySelector('.text-warn')).toBeNull();
    await act(async () => root!.unmount());
    root = null;
    container.remove();
    await mount('platform', fakeApi(() => json(200, stats('on', (s) => ({ ...s, requests: { ...s.requests, server_error_rate: 0.01 } })))));
    expect(card().textContent).toContain('High');
    expect(card().querySelector('.text-warn')).not.toBeNull();
  });

  it('sorts routes by requests, then by p95', async () => {
    await mount('platform', fakeApi(() => json(200, stats('on'))));
    const routes = () => [...container.querySelectorAll('tbody tr')].map((r) => r.querySelector('td:nth-child(2)')?.textContent).filter((t) => t?.startsWith('/'));
    const byRequests = routes();
    expect(byRequests[0]).toBe('/conversations/{id}/messages');
    await act(async () => button('p95').click());
    const byP95 = routes();
    expect(byP95).toHaveLength(byRequests.length);
    expect(byP95).not.toEqual(byRequests);
  });

  it('keeps the numbers and offers a retry when a refresh fails', async () => {
    let fail = false;
    const server = fakeApi(() => (fail ? failure(500, 'INTERNAL_ERROR') : json(200, stats('on'))));
    await mount('platform', server);
    expect(heading('Latency by route')).toBeTruthy();
    fail = true;
    await act(async () => button('7d').click());
    await tick(30);
    expect(text()).toContain("Couldn't refresh. Showing the last numbers.");
    expect(heading('Latency by route')).toBeTruthy();
    expect(button('Try again')).toBeTruthy();
    fail = false;
    await act(async () => button('Try again').click());
    await tick(30);
    expect(text()).not.toContain("Couldn't refresh");
  });

  it('6. 404: no page, no toast, and the menu is told', async () => {
    const server = fakeApi(() => failure(404, 'NOT_FOUND', 'No such route.'));
    await mount('platform', server);
    expect(server.hits()).toBe(1);
    expect(heading('Latency by route')).toBeFalsy();
    expect(text()).not.toContain('Try again');
    expect(notifyError).not.toHaveBeenCalled();
    expect(q('[data-testid="missing"]')!.textContent).toBe('true');
  });

  it('403: no page, no toast, no retry', async () => {
    const server = fakeApi(() => failure(403, 'FORBIDDEN'));
    await mount('platform', server);
    await tick(50);
    expect(server.hits()).toBe(1);
    expect(heading('Latency by route')).toBeFalsy();
    expect(notifyError).not.toHaveBeenCalled();
    expect(q('[data-testid="missing"]')!.textContent).toBe('false');
  });

  it('a server error with nothing to show yet gets an inline retry', async () => {
    await mount('platform', fakeApi(() => failure(500, 'INTERNAL_ERROR')));
    expect(button('Try again')).toBeTruthy();
    expect(text()).toContain('req_perf');
  });
});

describe('the platform Performance page', () => {
  it('sends no scope, leads with the server error rate and lists the busiest businesses', async () => {
    const server = fakeApi(() => json(200, stats('on', (s) => s, true)));
    await mount('platform', server);
    expect(server.hits()).toBe(1);
    expect(server.urls[0]!.pathname.endsWith('/platform/performance')).toBe(true);
    expect(server.urls[0]!.searchParams.has('scope')).toBe(false);
    expect(button('This bot')).toBeUndefined();
    const first = container.querySelector('.panel')!;
    expect(first.textContent).toContain('Server error rate');
    expect(heading('Busiest businesses')).toBeTruthy();
    const links = [...container.querySelectorAll('table a')].filter((a) => a.getAttribute('href')?.startsWith('/platform/businesses?open='));
    expect(links.map((a) => a.textContent)).toEqual(['Acme Co', 'quiet']); // an empty name falls back to the ID
    expect(links[0]!.getAttribute('href')).toBe('/platform/businesses?open=acme');
  });

  it('puts the explanation of the request total on its card', async () => {
    await mount('platform', fakeApi(() => json(200, stats('on', (s) => s, true))));
    const card = [...container.querySelectorAll('.panel')].find((c) => c.textContent?.startsWith('Requests'))!;
    expect(card.querySelector('button[aria-label="About this number"]')).not.toBeNull();
    expect(text()).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('404 hides the platform page too', async () => {
    await mount('platform', fakeApi(() => failure(404, 'NOT_FOUND')));
    expect(heading('Busiest businesses')).toBeFalsy();
    expect(q('[data-testid="missing"]')!.textContent).toBe('true');
    expect(notifyError).not.toHaveBeenCalled();
  });
});

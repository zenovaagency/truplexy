import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUSINESS_NAV, PLATFORM_NAV } from '@/app/nav';
import type { PerformanceStats } from '@/lib/api/types';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/** The in-app mock API (demo mode) for performance stats: served by default, switchable with localStorage 'truplexy.mock.performance'. */
let db: MockDb;
let headers: Headers;

beforeEach(() => {
  localStorage.clear();
  db = loadDb(seedDb);
  const m = db.memberships.find((x) => x.user_id === db.currentUserId && x.role === 'owner')!;
  const bot = db.bots.find((b) => b.tenant_id === m.tenant_id)!;
  headers = new Headers({ Authorization: 'Bearer demo', 'X-Truplexy-Tenant': m.tenant_id, 'X-Truplexy-Bot': bot.id });
});
afterEach(() => localStorage.clear());

const get = (path: string, query = '') => dispatch(db, { method: 'GET', path, query: new URLSearchParams(query), headers, body: undefined }).body as PerformanceStats;
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MockHttpError) return { status: e.status, code: e.code };
    throw e;
  }
  throw new Error('expected an error');
};
const asAdmin = () => (db.currentUserId = db.users.find((u) => u.platform_admin)!.id);
const mode = (m: string) => localStorage.setItem('truplexy.mock.performance', m);

describe('mock performance stats', () => {
  it('answers the contract: every list present, rates in 0–1, a day per day of the range', () => {
    asAdmin();
    const s = get('/platform/performance', 'from=2026-10-01&to=2026-10-10');
    expect(s).toMatchObject({ from: '2026-10-01', to: '2026-10-10', scope: 'platform', recording: { http: true, sample_rate: 1, model_attempts: true } });
    expect(s.requests.by_day).toHaveLength(10);
    expect(s.pipeline.stages.map((x) => x.stage)).toEqual(['prepare', 'quota', 'retrieval', 'web_search', 'llm', 'postprocess', 'other']);
    expect(s.pipeline.retrieval_stages.map((x) => x.stage)).toEqual(['rewrite', 'embed', 'dense', 'lexical', 'load', 'rerank']);
    for (const r of [s.requests.error_rate, s.requests.server_error_rate, s.rag.no_answer_rate, s.rag.cache_hit_rate]) expect(r).toBeGreaterThanOrEqual(0), expect(r).toBeLessThanOrEqual(1);
  });

  it('refuses a range that ends before it starts', () => {
    asAdmin();
    expect(fails(() => get('/platform/performance', 'from=2026-10-10&to=2026-10-01'))).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  });

  it('platform: scope platform, the busiest businesses, and no scope parameter', () => {
    asAdmin();
    const s = get('/platform/performance', 'from=2026-10-01&to=2026-10-10');
    expect(s.scope).toBe('platform');
    expect(s.tenants!.length).toBeGreaterThan(0);
    expect(s.tenants!.length).toBeLessThanOrEqual(20);
    expect(fails(() => get('/platform/performance', 'scope=bot'))).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  });

  it('platform: a member who is not a platform admin is refused', () => {
    expect(fails(() => get('/platform/performance'))).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('off: 404 NOT_FOUND, like a server that predates the route', () => {
    asAdmin();
    mode('off');
    expect(fails(() => get('/platform/performance'))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('no_http: requests, latency and routes are all zero, and recording says why', () => {
    asAdmin();
    mode('no_http');
    const s = get('/platform/performance');
    expect(s.recording.http).toBe(false);
    expect(s.requests).toMatchObject({ total: 0, errors: 0, by_route: [] });
    expect(s.latency.count).toBe(0);
    expect(s.pipeline.replies).toBeGreaterThan(0);
  });

  it('sampled, no_models, empty and noreplies play their situations', () => {
    asAdmin();
    mode('sampled');
    expect(get('/platform/performance').recording.sample_rate).toBe(0.25);
    mode('no_models');
    expect(get('/platform/performance')).toMatchObject({ recording: { model_attempts: false }, models: [] });
    mode('empty');
    expect(get('/platform/performance')).toMatchObject({ requests: { total: 0 }, pipeline: { replies: 0 } });
    mode('noreplies');
    const s = get('/platform/performance');
    expect(s.requests.total).toBeGreaterThan(0);
    expect(s.pipeline.replies).toBe(0);
    expect(s.pipeline.stages.every((x) => x.ran === 0 && x.share === 0)).toBe(true);
  });

  it('a day without requests has no latency', () => {
    asAdmin();
    mode('empty');
    expect(get('/platform/performance').requests.by_day.every((d) => d.requests === 0 && d.p95_ms === 0)).toBe(true);
  });
});

describe('where the Performance page lives', () => {
  it('is not a business page: no member sees it', () => {
    expect(BUSINESS_NAV.flatMap((sec) => sec.items).some((i) => i.id === 'performance')).toBe(false);
  });

  it('is in the platform console, whose routes only platform admins reach', () => {
    expect(PLATFORM_NAV.flatMap((s) => s.items).find((i) => i.id === 'p-performance')).toMatchObject({ path: '/platform/performance', needs: 'platform' });
  });
});

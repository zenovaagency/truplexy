import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/** The in-app mock API (demo mode) for websites a bot learns from. */
let db: MockDb;
const scoped = new Headers({ Authorization: 'Bearer demo', 'X-Truplexy-Tenant': 'acme', 'X-Truplexy-Bot': 'support' });

beforeEach(() => {
  localStorage.clear();
  db = loadDb(seedDb);
});

const call = (method: string, path: string, body?: unknown) => dispatch(db, { method, path, query: new URLSearchParams(), headers: scoped, body }).body as any;
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MockHttpError) return { status: e.status, code: e.code, message: e.message };
    throw e;
  }
  throw new Error('expected an error');
};
const webDocs = () => db.documents.filter((d) => d.source_type === 'web');

/** Steps a site until it reports nothing left, as the dashboard does. */
function drive(id: string) {
  for (let i = 0; i < 50; i++) {
    const r = call('POST', `/knowledge/sites/${id}/step`);
    if (!r.remaining) return r.site;
  }
  throw new Error('the site never finished');
}

describe('websites', () => {
  it('maps a site, unticks junk, imports the ticked pages and keeps them in sync', () => {
    const site = call('POST', '/knowledge/sites', { url: 'www.example.com' });
    expect(site).toMatchObject({ status: 'mapping', host: 'example.com', root_url: 'https://www.example.com/', refresh: 'weekly' });

    expect(drive(site.id).status).toBe('review');
    const detail = call('GET', `/knowledge/sites/${site.id}`);
    const login = detail.pages.find((p: any) => p.url.endsWith('/login'));
    const returns = detail.pages.find((p: any) => p.url.endsWith('/help/returns'));
    expect(login).toMatchObject({ selected: false, junk_reason: 'Sign-in page' });
    expect(returns).toMatchObject({ selected: true, status: 'new' });
    expect(detail.capacity.used).toBe(db.documents.filter((d) => d.tenant_id === 'acme' && d.bot_id === 'support').length - webDocs().length);

    // Nothing reaches the knowledge base before the import.
    expect(webDocs()).toHaveLength(0);
    call('POST', `/knowledge/sites/${site.id}/import`);
    const done = drive(site.id);
    expect(done).toMatchObject({ status: 'ready' });
    expect(done.counts.indexed).toBe(done.counts.selected);
    expect(webDocs()).toHaveLength(done.counts.selected);
    expect(webDocs().find((d) => d.source_url?.endsWith('/help/returns'))).toMatchObject({ source_name: site.id, status: 'indexed' });

    // Unticking a page removes its document at the next step.
    call('PUT', `/knowledge/sites/${site.id}`, { unselect: [returns.url] });
    drive(site.id);
    expect(webDocs().some((d) => d.source_url === returns.url)).toBe(false);

    // Deleting a page's document in the Documents tab unticks it.
    const shipping = webDocs().find((d) => d.source_url?.endsWith('/help/shipping'))!;
    call('DELETE', `/knowledge/documents/${shipping.id}`);
    const after = call('GET', `/knowledge/sites/${site.id}`);
    expect(after.pages.find((p: any) => p.url === shipping.source_url)).toMatchObject({ selected: false, status: 'new' });
    expect(after.pages.find((p: any) => p.url === shipping.source_url).document_id).toBeUndefined();
  });

  it('maps only the section given', () => {
    const site = call('POST', '/knowledge/sites', { url: 'https://example.com/help' });
    drive(site.id);
    const { pages } = call('GET', `/knowledge/sites/${site.id}`);
    expect(pages.length).toBeGreaterThan(3);
    expect(pages.every((p: any) => p.url.startsWith('https://example.com/help'))).toBe(true);
  });

  it('refuses addresses that are not public websites, and a site added twice', () => {
    expect(fails(() => call('POST', '/knowledge/sites', { url: 'http://localhost:3000' }))).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    expect(fails(() => call('POST', '/knowledge/sites', { url: 'http://10.0.0.1' }))).toMatchObject({ status: 400 });
    call('POST', '/knowledge/sites', { url: 'example.com' });
    expect(fails(() => call('POST', '/knowledge/sites', { url: 'https://www.example.com/help' }))).toMatchObject({ status: 400, message: expect.stringContaining('already') });
  });

  it('removes a site and every page learned from it', () => {
    const site = call('POST', '/knowledge/sites', { url: 'example.com' });
    drive(site.id);
    call('POST', `/knowledge/sites/${site.id}/import`);
    drive(site.id);
    expect(webDocs().length).toBeGreaterThan(0);
    const deleting = dispatch(db, { method: 'DELETE', path: `/knowledge/sites/${site.id}`, query: new URLSearchParams(), headers: scoped, body: undefined });
    expect(deleting.status).toBe(202);
    // The last step answers with the site still deleting and nothing left; then the site is gone.
    expect(drive(site.id)).toMatchObject({ status: 'deleting' });
    expect(webDocs()).toHaveLength(0);
    expect(fails(() => call('POST', `/knowledge/sites/${site.id}/step`))).toMatchObject({ status: 404, code: 'SITE_NOT_FOUND' });
    expect(call('GET', '/knowledge/sites').data).toHaveLength(0);
  });

  it('refuses an import that would not fit in the knowledge base', () => {
    const tenant = db.tenants.find((t) => t.id === 'acme')!;
    const used = db.documents.filter((d) => d.tenant_id === 'acme' && d.bot_id === 'support').length;
    tenant.limit_overrides = { ...tenant.limit_overrides, documents_per_bot: used + 2 };
    const site = call('POST', '/knowledge/sites', { url: 'example.com' });
    drive(site.id);
    const detail = call('GET', `/knowledge/sites/${site.id}`);
    // Mapping ticks only what fits.
    expect(detail.counts.selected).toBe(2);
    const more = detail.pages.find((p: any) => !p.selected && !p.junk_reason);
    call('PUT', `/knowledge/sites/${site.id}`, { select: [more.url] });
    expect(fails(() => call('POST', `/knowledge/sites/${site.id}/import`))).toMatchObject({ status: 400, message: expect.stringContaining('room for 2') });
  });
});

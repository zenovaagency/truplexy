import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeDocument, KnowledgeSite, KnowledgeSiteDetail, SitePage } from '@/lib/api/types';
import { button, cleanup, click, json, renderPage, text, tick, type, type FakeApi } from '@/test-utils';
import KnowledgePage, { DocumentsTab, WebsitesTab } from './KnowledgePage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

const counts = (pages: SitePage[], pending = 0): KnowledgeSite['counts'] => ({
  total: pages.length,
  selected: pages.filter((p) => p.selected).length,
  indexed: pages.filter((p) => p.status === 'indexed').length,
  failed: 0,
  skipped: 0,
  gone: 0,
  pending,
});

/** A small site the fake API maps, imports and syncs in one step each. */
function fakeSite() {
  let site: KnowledgeSiteDetail | null = null;
  const docs: KnowledgeDocument[] = [];
  const out = () => ({ ...site!, counts: counts(site!.pages, site!.status === 'syncing' ? site!.pages.filter((p) => p.selected && p.status !== 'indexed').length : 0) });
  const summary = () => {
    const { pages: _p, capacity: _c, ...s } = out();
    return s;
  };
  const api: FakeApi = ({ method, path, body }) => {
    if (method === 'GET' && path === '/knowledge/documents') return json(200, { data: docs, total: docs.length, counts: {}, max_documents: 100, max_file_bytes: 25 << 20, accept: '.md' });
    if (path === '/knowledge/suggestions') return json(200, { data: [] });
    if (method === 'GET' && path === '/knowledge/sites') return json(200, { data: site ? [summary()] : [] });
    if (method === 'POST' && path === '/knowledge/sites') {
      site = {
        id: 'site_1',
        root_url: 'https://example.com/',
        host: 'example.com',
        status: 'mapping',
        refresh: 'weekly',
        auto_add_new: true,
        created_at: '2026-11-22T00:00:00Z',
        updated_at: '2026-11-22T00:00:00Z',
        counts: counts([]),
        max_pages: 500,
        pages: [],
        capacity: { used: 0, max: 100 },
      };
      return json(201, summary());
    }
    if (!site) return undefined;
    if (method === 'GET' && path === '/knowledge/sites/site_1') return json(200, out());
    if (method === 'PUT' && path === '/knowledge/sites/site_1') {
      const b = body as { select?: string[]; unselect?: string[] };
      for (const p of site.pages) {
        if (b.select?.includes(p.url)) p.selected = true;
        if (b.unselect?.includes(p.url)) p.selected = false;
      }
      return json(200, out());
    }
    if (method === 'POST' && path === '/knowledge/sites/site_1/import') {
      site.status = 'syncing';
      return json(200, summary());
    }
    if (method === 'POST' && path === '/knowledge/sites/site_1/step') {
      if (site.status === 'mapping') {
        site.status = 'review';
        site.pages = [
          { url: 'https://example.com/', title: 'Home', selected: true, status: 'new' },
          { url: 'https://example.com/help/returns', title: 'Returns', selected: true, status: 'new' },
          { url: 'https://example.com/login', title: 'Sign in', selected: false, junk_reason: 'Sign-in page', status: 'new' },
        ];
      } else if (site.status === 'syncing') {
        for (const p of site.pages.filter((x) => x.selected)) {
          p.status = 'indexed';
          p.document_id = `doc_${docs.length + 1}`;
          docs.push({ id: p.document_id, title: p.title!, source_type: 'web', source_name: 'site_1', source_url: p.url, byte_size: 10, status: 'indexed', chunk_count: 1, embedded_count: 1, token_count: 5, created_at: '', updated_at: '' });
        }
        site.status = 'ready';
        site.last_synced_at = '2026-11-22T00:00:00Z';
      }
      return json(200, { site: summary(), remaining: false });
    }
    return undefined;
  };
  return { api, docs, get site() { return site; } };
}

const routes = [
  {
    path: '/knowledge',
    element: <KnowledgePage />,
    children: [
      { index: true, element: <DocumentsTab /> },
      { path: 'websites', element: <WebsitesTab /> },
    ],
  },
];

async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await tick(20);
  expect(check()).toBe(true);
}

afterEach(cleanup);

describe('Add website', () => {
  it('maps the site, shows the pages with junk unticked, and imports them', async () => {
    const fake = fakeSite();
    const { calls } = await renderPage(routes, '/knowledge/websites', fake.api);
    expect(text()).toContain('Learn from your website');

    await click(button('Add website'));
    await type(document.body.querySelector('input[type="url"]'), 'example.com');
    await click(button('Find pages'));
    // The dialog drives the mapping step, then lists the pages.
    await until(() => text().includes('Found 3 pages'));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/knowledge/sites' && (c.body as { url: string }).url === 'example.com')).toBe(true);
    expect(text()).toContain('Sign-in page');
    const login = document.body.querySelector('input[aria-label="Learn from /login"]') as HTMLInputElement;
    expect(login.checked).toBe(false);

    // Unticking a page saves it.
    await click(document.body.querySelector('input[aria-label="Learn from /help/returns"]'));
    await until(() => calls.some((c) => c.method === 'PUT' && (c.body as { unselect?: string[] }).unselect?.[0] === 'https://example.com/help/returns'));
    await until(() => Boolean(button('Import 1 page')));

    await click(button('Import 1 page'));
    await until(() => text().includes('Learned 1 page from example.com'));
    expect(fake.docs.map((d) => d.source_url)).toEqual(['https://example.com/']);
  });
});

describe('web documents', () => {
  it('show their website and offer no content editing', async () => {
    const fake = fakeSite();
    fake.docs.push({ id: 'doc_9', title: 'Returns', source_type: 'web', source_name: 'site_1', source_url: 'https://www.example.com/help/returns', byte_size: 10, status: 'indexed', chunk_count: 1, embedded_count: 1, token_count: 5, created_at: '', updated_at: '' });
    const api: FakeApi = (c) => (c.method === 'GET' && c.path === '/knowledge/documents/doc_9' ? json(200, { ...fake.docs[0], content: '# Returns' }) : fake.api(c));
    await renderPage(routes, '/knowledge?doc=doc_9', api);
    await tick();
    expect(text()).toContain('From example.com');
    expect(text()).toContain('Synced from the website');
    expect(button('Edit content')).toBeFalsy();
  });
});

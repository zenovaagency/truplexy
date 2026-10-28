import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeDocument } from '@/lib/api/types';
import { button, cleanup, click, json, renderPage, text, tick, type FakeApi } from '@/test-utils';
import KnowledgePage, { DocumentsTab } from './KnowledgePage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

const doc = (over: Partial<KnowledgeDocument>): KnowledgeDocument => ({
  id: 'doc_1',
  title: 'Pricing',
  source_type: 'file',
  source_name: 'pricing.pdf',
  mime_type: 'application/pdf',
  byte_size: 2048,
  status: 'indexed',
  chunk_count: 3,
  embedded_count: 3,
  token_count: 400,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

const pricing = doc({});
const article = doc({ id: 'doc_2', title: 'Hours', source_type: 'manual', source_name: undefined, mime_type: 'text/markdown' });

const api: FakeApi = ({ method, path, query }) => {
  if (method === 'GET' && path === '/knowledge/documents') {
    const name = query.get('source_name');
    const data = name ? [pricing].filter((d) => d.source_name?.toLowerCase() === name.toLowerCase()) : [pricing, article];
    return json(200, { data, total: data.length, counts: { indexed: data.length }, max_documents: 100, max_file_bytes: 25 << 20, accept: '.md,.pdf' });
  }
  if (method === 'GET' && path === `/knowledge/documents/${pricing.id}`) return json(200, { ...pricing, content: 'Plans start at 10.' });
  if (method === 'DELETE' && path.startsWith('/knowledge/documents/')) return json(204, null);
  if (path === '/knowledge/suggestions') return json(200, { data: [] });
  return undefined;
};

const routes = [{ path: '/knowledge', element: <KnowledgePage />, children: [{ index: true, element: <DocumentsTab /> }] }];
const byLabel = (label: string) => document.body.querySelector(`button[aria-label="${label}"]`);

afterEach(cleanup);

describe('Documents tab', () => {
  it('offers Replace on files and Delete on every row', async () => {
    await renderPage(routes, '/knowledge', api);
    expect(byLabel('Replace pricing.pdf')).toBeTruthy();
    expect(byLabel('Delete Pricing')).toBeTruthy();
    expect(byLabel('Delete Hours')).toBeTruthy();
    // Articles are edited, not replaced.
    expect(byLabel('Replace Hours')).toBeFalsy();
  });

  it('hides the row actions without knowledge.write', async () => {
    await renderPage(routes, '/knowledge', api, ['knowledge.read']);
    expect(text()).toContain('Pricing');
    expect(byLabel('Delete Pricing')).toBeFalsy();
    expect(byLabel('Replace pricing.pdf')).toBeFalsy();
  });

  it('deletes a row after confirming', async () => {
    const { calls } = await renderPage(routes, '/knowledge', api);
    await click(byLabel('Delete Hours'));
    expect(text()).toContain('Delete “Hours”?');
    await click(button('Delete document'));
    await tick();
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/knowledge/documents/doc_2')).toBe(true);
  });

  it('opens the replace dialog for a file', async () => {
    const { router } = await renderPage(routes, '/knowledge', api);
    await click(byLabel('Replace pricing.pdf'));
    await tick();
    expect(router.state.location.search).toContain('replace=doc_1');
    expect(text()).toContain('Replace “Pricing”');
    expect(text()).toContain('Drop the new version here');
    expect(button('Replace file')).toBeTruthy();
  });

  it('says which upload replaces a file with the same name', async () => {
    const { calls } = await renderPage(routes, '/knowledge?upload=1', api);
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['new prices'], 'Pricing.pdf', { type: 'application/pdf' });
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await tick();
    expect(calls.some((c) => c.path === '/knowledge/documents' && c.query.get('source_name') === 'Pricing.pdf')).toBe(true);
    expect(text()).toContain('Replaces “Pricing”');
  });
});

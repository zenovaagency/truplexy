import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductDraft, ProductImport } from '@/lib/api/types';
import { button, cleanup, click, json, renderPage, text, type } from '@/test-utils';
import { ImportReviewPage } from './ImportReviewPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

afterEach(cleanup);

const draft = (name: string, extra: Partial<ProductDraft> = {}): ProductDraft => ({
  name,
  sku: '',
  description: '',
  price: null,
  currency: 'USD',
  stock: null,
  url: '',
  image_url: '',
  properties: {},
  problems: [],
  exists: false,
  ...extra,
});

const ready: ProductImport = {
  id: 'imp_1',
  source: 'url',
  name: 'https://shop.test/collections/all',
  status: 'ready',
  method: 'ai',
  items: [draft('Mug', { sku: 'MUG-1', price: '12.00', exists: true }), draft('Kettle', { price: '30', problems: ['The stock "many" isn’t a whole number, so it was left out.'] }), draft('', { sku: 'X' })],
  item_count: 3,
  truncated: false,
  created: 0,
  updated: 0,
  skipped: 0,
  created_at: '2026-10-25T10:00:00Z',
  updated_at: '2026-10-25T10:00:00Z',
};

const routes = [{ path: '/products/imports/:importId', element: <ImportReviewPage /> }];

describe('Reviewing an import', () => {
  it('shows what was found, what is already in the catalog, and the problems', async () => {
    await renderPage(routes, '/products/imports/imp_1', ({ path }) => (path === '/products/imports/imp_1' ? json(200, ready) : undefined));
    expect(text()).toContain('3 products found');
    expect(text()).toContain('In catalog');
    expect(text()).toContain('isn’t a whole number');
    expect(text()).toContain('Read with AI');
    // The nameless draft starts unticked, so two are saved.
    expect(button('Save 2 products')).toBeDefined();
  });

  it('saves the ticked drafts with only what was changed', async () => {
    const { calls } = await renderPage(routes, '/products/imports/imp_1', ({ method, path }) => {
      if (path === '/products/imports/imp_1') return json(200, ready);
      if (method === 'POST' && path === '/products/imports/imp_1/commit') return json(200, { import: { ...ready, status: 'committed', items: [], created: 1, updated: 0, skipped: 1 }, errors: [] });
      return undefined;
    });
    const prices = document.querySelectorAll<HTMLInputElement>('input[aria-label="Price"]');
    await type(prices[1], '29,90');
    await click(button('Save 2 products'));
    const commit = calls.find((c) => c.method === 'POST');
    expect(commit?.body).toEqual({ indexes: [0, 1], edits: { 1: { price: '29.90' } }, on_duplicate: 'skip' });
    expect(text()).toContain('Saved to your catalog');
    expect(text()).toContain('1 product added');
  });

  it("won't save a ticked draft that has a problem", async () => {
    await renderPage(routes, '/products/imports/imp_1', ({ path }) => (path === '/products/imports/imp_1' ? json(200, ready) : undefined));
    await type(document.querySelectorAll<HTMLInputElement>('input[aria-label="Price"]')[0], 'cheap');
    expect(text()).toContain('Fix or untick 1 row first.');
    expect(button('Save 2 products')?.disabled).toBe(true);
  });

  it('explains a failed import', async () => {
    await renderPage(routes, '/products/imports/imp_1', ({ path }) =>
      path === '/products/imports/imp_1' ? json(200, { ...ready, status: 'failed', items: [], error: 'The page answered 404 Not Found.' }) : undefined,
    );
    expect(text()).toContain('No products could be read');
    expect(text()).toContain('404 Not Found');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/api/types';
import { button, cleanup, click, field, json, renderPage, text, tick, type, type FakeApi } from '@/test-utils';
import ProductsPage from './ProductsPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

afterEach(cleanup);

const mug: Product = {
  id: 'prd_mug',
  tenant_id: 'acme',
  bot_id: 'support',
  name: 'Blue mug',
  sku: 'MUG-1',
  description: 'Big and blue.',
  price: '12.5',
  currency: 'USD',
  stock: 0,
  url: 'https://shop.test/mug',
  image_url: '',
  status: 'active',
  source: 'manual',
  properties: {},
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-20T00:00:00Z',
};

const routes = [{ path: '/products/:productId?', element: <ProductsPage /> }];

const fakeApi: FakeApi = ({ method, path, body }) => {
  if (path === '/products' && method === 'GET') return json(200, { data: [mug] });
  if (path === '/products/imports') return json(200, { data: [] });
  if (path === '/properties') return json(200, { data: [] });
  if (path === `/products/${mug.id}` && method === 'GET') return json(200, mug);
  if (path === `/products/${mug.id}` && method === 'PATCH') return json(200, { ...mug, ...(body as object) });
  return undefined;
};

describe('Products', () => {
  it('list prices and stock', async () => {
    await renderPage(routes, '/products', fakeApi);
    expect(text()).toContain('Blue mug');
    expect(text()).toContain('$12.50');
    expect(text()).toContain('Sold out');
  });

  it('open from the address, and save only what changed', async () => {
    const { calls } = await renderPage(routes, `/products/${mug.id}`, fakeApi);
    await tick();
    await type(field('Price'), '13');
    await click(button('Save product'));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ price: '13' });
  });

  it('are read-only for viewers', async () => {
    await renderPage(routes, `/products/${mug.id}`, fakeApi, ['products.read']);
    await tick();
    expect(button('Save product')).toBeUndefined();
    expect(button('Add product')).toBeUndefined();
    expect(button('Import')).toBeUndefined();
  });
});

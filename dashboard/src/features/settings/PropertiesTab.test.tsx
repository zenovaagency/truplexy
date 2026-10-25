import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PropertyDefinition } from '@/lib/api/types';
import { button, choose, cleanup, click, field, json, renderPage, text, type } from '@/test-utils';
import { PropertiesTab } from './PropertiesTab';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

afterEach(cleanup);

const tier: PropertyDefinition = {
  id: 'prp_tier',
  entity: 'customer',
  key: 'loyalty_tier',
  label: 'Loyalty tier',
  description: '',
  type: 'select',
  options: [{ value: 'gold', label: 'Gold' }],
  required: false,
  sensitive: true,
  sort_order: 0,
  created_at: '',
  updated_at: '',
};

const routes = [{ path: '/settings/properties', element: <PropertiesTab /> }];

describe('Settings → Properties', () => {
  it('lists properties with their type and rules', async () => {
    await renderPage(routes, '/settings/properties', ({ path }) => (path === '/properties' ? json(200, { data: [tier] }) : undefined));
    expect(text()).toContain('Loyalty tier');
    expect(text()).toContain('loyalty_tier');
    expect(text()).toContain('Single choice · 1 option');
    expect(text()).toContain('Sensitive');
  });

  it('adds a property with a key made from its label', async () => {
    const { calls } = await renderPage(routes, '/settings/properties', ({ method, path, body }) => {
      if (path === '/properties' && method === 'GET') return json(200, { data: [] });
      if (path === '/properties' && method === 'POST') return json(201, { ...tier, ...(body as object), id: 'prp_new' });
      return undefined;
    });
    await click(button('Add property'));
    await type(field('Label'), 'Seats bought');
    await choose(field('Type'), 'number');
    await click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Add property'));
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ entity: 'customer', key: 'seats_bought', label: 'Seats bought', type: 'number', description: '', required: false, sensitive: false });
  });

  it("doesn't let a viewer change anything", async () => {
    await renderPage(routes, '/settings/properties', ({ path }) => (path === '/properties' ? json(200, { data: [tier] }) : undefined), ['properties.read']);
    expect(button('Add property')).toBeUndefined();
    expect(document.querySelector('button[aria-label="Delete Loyalty tier"]')).toBeNull();
  });

  it('says so when the server has no properties yet', async () => {
    await renderPage(routes, '/settings/properties', () => undefined);
    expect(text()).toContain("Custom properties aren't available on this server yet");
  });
});

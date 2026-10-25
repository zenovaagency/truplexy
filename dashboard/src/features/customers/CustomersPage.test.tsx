import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Customer, PropertyDefinition } from '@/lib/api/types';
import { button, choose, cleanup, click, json, renderPage, text, tick, type FakeApi } from '@/test-utils';
import CustomersPage from './CustomersPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

afterEach(cleanup);

const def = (key: string, label: string, type: PropertyDefinition['type'], extra: Partial<PropertyDefinition> = {}): PropertyDefinition => ({
  id: `prp_${key}`,
  entity: 'customer',
  key,
  label,
  description: '',
  type,
  options: [],
  required: false,
  sensitive: false,
  sort_order: 0,
  created_at: '',
  updated_at: '',
  ...extra,
});

const defs = [def('tier', 'Loyalty tier', 'select', { options: [{ value: 'gold', label: 'Gold' }, { value: 'silver', label: 'Silver' }] }), def('dob', 'Birthday', 'date', { sensitive: true })];

const ann: Customer = {
  id: 'cus_ann',
  tenant_id: 'acme',
  bot_id: 'support',
  name: 'Ann Lee',
  contacts: [{ type: 'email', value: 'ann@example.com', primary: true }],
  metadata: {},
  properties: { tier: 'gold', dob: '1990-04-01' },
  avatar_url: 'https://img.test/avatars/customers/acme/support/cus_ann/abc.png',
  avatar_source: 'url',
  first_seen_at: '2026-10-01T00:00:00Z',
  last_seen_at: '2026-10-20T00:00:00Z',
  conversations: 1,
  tickets: 0,
  open_tickets: 0,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-20T00:00:00Z',
};

const routes = [{ path: '/customers/:customerId?', element: <CustomersPage /> }];

function fakeApi(customer: Customer): FakeApi {
  return ({ method, path, body }) => {
    if (path === '/properties') return json(200, { data: defs });
    if (path === '/customers' && method === 'GET') return json(200, { data: [customer] });
    if (path === `/customers/${customer.id}` && method === 'GET') return json(200, { ...customer, recent_conversations: [], recent_tickets: [] });
    if (path === `/customers/${customer.id}` && method === 'PATCH') return json(200, { ...customer, ...(body as object) });
    return undefined;
  };
}

describe('Customers', () => {
  it('show their picture', async () => {
    await renderPage(routes, '/customers', fakeApi(ann));
    expect(document.querySelector(`img[src="${ann.avatar_url}"]`)).not.toBeNull();
  });

  it('open from the address, with their properties, and hide sensitive ones from viewers', async () => {
    const masked = { ...ann, properties: { tier: 'gold' }, masked_properties: ['dob'] };
    await renderPage(routes, `/customers/${ann.id}`, fakeApi(masked), ['customers.read', 'properties.read']);
    await tick();
    expect(text()).toContain('Loyalty tier');
    expect(text()).toContain('Gold');
    expect(text()).toContain('Hidden');
    expect(text()).not.toContain('1990');
    // Viewers can't change the picture.
    expect(button('Replace')).toBeUndefined();
    expect(button('Remove')).toBeUndefined();
  });

  it('send only the properties that changed', async () => {
    const { calls } = await renderPage(routes, `/customers/${ann.id}`, fakeApi(ann));
    await tick();
    // Agents and up can change the picture.
    expect(button('Replace')).toBeDefined();
    await click(button('Edit'));
    const tier = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'silver'));
    await choose(tier, 'silver');
    await click(button('Save customer'));
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ properties: { tier: 'silver' } });
  });

  it('filter by a property value', async () => {
    const { calls } = await renderPage(routes, '/customers', fakeApi(ann));
    await choose(document.querySelector('select[aria-label="Filter by property"]'), 'tier=gold');
    await tick();
    const last = calls.filter((c) => c.path === '/customers').at(-1);
    expect(last?.query.get('property[tier]')).toBe('gold');
  });
});

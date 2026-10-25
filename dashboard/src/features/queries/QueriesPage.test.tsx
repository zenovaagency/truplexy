import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CustomerQuery, PropertyDefinition, QueryType } from '@/lib/api/types';
import { button, choose, cleanup, click, json, renderPage, text, tick, type, type FakeApi } from '@/test-utils';
import QueriesPage from './QueriesPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

afterEach(cleanup);

const orderType: QueryType = {
  id: 'qtp_order',
  key: 'order',
  name: 'Order problem',
  description: '',
  statuses: [
    { key: 'new', label: 'New', category: 'open' },
    { key: 'waiting', label: 'Waiting on customer', category: 'pending' },
    { key: 'resolved', label: 'Resolved', category: 'done' },
  ],
  default_status: 'new',
  visible_roles: [],
  bot_enabled: true,
  sort_order: 0,
  archived: false,
  open: 1,
  created_at: '',
  updated_at: '',
};

const field = (key: string, extra: Partial<PropertyDefinition> = {}): PropertyDefinition => ({
  id: `prp_${key}`,
  entity: 'query',
  scope_id: 'qtp_order',
  key,
  label: key,
  description: '',
  type: 'text',
  options: [],
  required: false,
  sensitive: false,
  sort_order: 0,
  created_at: '',
  updated_at: '',
  ...extra,
});

const q1: CustomerQuery = {
  id: 'qry_1',
  reference: 'Q-1001',
  number: 1001,
  type_id: 'qtp_order',
  type_name: 'Order problem',
  subject: 'Mug arrived cracked',
  status: 'new',
  status_label: 'New',
  status_category: 'open',
  customer_id: 'cus_ann',
  customer_name: 'Ann',
  source: 'assistant',
  properties: { order_number: '4821' },
  masked_properties: ['address'],
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-21T00:00:00Z',
};

const routes = [{ path: '/queries/:queryId?', element: <QueriesPage /> }];

function fakeApi(extra?: FakeApi): FakeApi {
  return (call) => {
    const out = extra?.(call);
    if (out) return out;
    const { method, path } = call;
    if (path === '/query-types') return json(200, { data: [orderType] });
    if (path === '/queries' && method === 'GET') return json(200, { data: [q1] });
    if (path === '/queries/qry_1' && method === 'GET') return json(200, q1);
    if (path === '/queries/qry_1/events') return json(200, { data: [{ id: 'e1', kind: 'created', to: 'new', actor_type: 'assistant', created_at: '2026-10-20T00:00:00Z' }] });
    if (path === '/properties') return json(200, { data: [field('order_number', { required: true }), field('address', { sensitive: true, type: 'long_text' })] });
    return undefined;
  };
}

describe('Queries', () => {
  it('list with their reference, status and who opened them', async () => {
    await renderPage(routes, '/queries', fakeApi());
    expect(text()).toContain('Q-1001');
    expect(text()).toContain('Mug arrived cracked');
    expect(text()).toContain('Order problem · Ann');
    expect(text()).toContain('Assistant');
  });

  it('open from the address, with their form, sensitive fields hidden, and history', async () => {
    await renderPage(routes, '/queries/qry_1', fakeApi());
    await tick();
    expect(text()).toContain('Q-1001 · Order problem');
    expect((document.querySelector('input[value="4821"]') as HTMLInputElement | null)?.value).toBe('4821');
    expect(text()).toContain('Sensitive: only people who can edit this record see it.');
    expect(document.querySelector('input[value="Hidden"]')).not.toBeNull();
    expect(text()).toContain('The assistant opened it as New');
  });

  it('change status straight away, and save only changed fields', async () => {
    const { calls } = await renderPage(
      routes,
      '/queries/qry_1',
      fakeApi(({ method, path, body }) => (method === 'PATCH' && path === '/queries/qry_1' ? json(200, { ...q1, ...(body as object) }) : undefined)),
    );
    await tick();
    const status = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'resolved'));
    await choose(status, 'resolved');
    await type(document.querySelector('input[value="4821"]'), '4822');
    await click(button('Save changes'));
    const patches = calls.filter((c) => c.method === 'PATCH').map((c) => c.body);
    expect(patches).toEqual([{ status: 'resolved' }, { properties: { order_number: '4822' } }]);
  });

  it("let viewers read but not change them", async () => {
    await renderPage(routes, '/queries/qry_1', fakeApi(), ['queries.read']);
    await tick();
    expect(button('Save changes')).toBeUndefined();
    expect(button('New query')).toBeUndefined();
    expect(button('Add note')).toBeUndefined();
  });

  it('open a new one from another page, linked to its customer and ticket', async () => {
    const { calls } = await renderPage(
      routes,
      '/queries?new=1&customer=cus_ann&ticket=tkt_1',
      fakeApi(({ method, path, body }) => (method === 'POST' && path === '/queries' ? json(201, { ...q1, ...(body as object), id: 'qry_2' }) : undefined)),
    );
    await tick();
    await type(document.querySelector('[role="dialog"] input[value=""]'), 'Broken handle');
    const order = [...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input')].at(-1);
    await type(order, '99');
    await click(button('Open query'));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ type_id: 'qtp_order', subject: 'Broken handle', status: 'new', customer_id: 'cus_ann', ticket_id: 'tkt_1', properties: { order_number: '99' } });
  });
});

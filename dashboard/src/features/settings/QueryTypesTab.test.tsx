import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryType } from '@/lib/api/types';
import { button, cleanup, click, json, renderPage, text, type } from '@/test-utils';
import { QueryTypesTab } from './QueryTypesTab';
import { audience, statusesProblem } from '@/lib/queries';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

afterEach(cleanup);

const payment: QueryType = {
  id: 'qtp_pay',
  key: 'payment',
  name: 'Payment issue',
  description: '',
  statuses: [
    { key: 'new', label: 'New', category: 'open' },
    { key: 'refunded', label: 'Refunded', category: 'done' },
  ],
  default_status: 'new',
  visible_roles: ['editor'],
  bot_enabled: true,
  sort_order: 0,
  archived: false,
  open: 2,
  created_at: '',
  updated_at: '',
};

const routes = [{ path: '/settings/query-types', element: <QueryTypesTab /> }];

describe('Settings → Query types', () => {
  it('lists types with their statuses, audience and assistant, and shows the form of the first', async () => {
    await renderPage(routes, '/settings/query-types', ({ path }) => {
      if (path === '/query-types') return json(200, { data: [payment] });
      if (path === '/properties') return json(200, { data: [] });
      return undefined;
    });
    expect(text()).toContain('Payment issue');
    expect(text()).toContain('New → Refunded');
    expect(text()).toContain('Seen by owners, admins and editors');
    expect(text()).toContain('Assistant');
    expect(text()).toContain('Payment issue: form');
  });

  it('adds a type with a key from its name and the default statuses', async () => {
    const { calls } = await renderPage(routes, '/settings/query-types', ({ method, path, body }) => {
      if (path === '/query-types' && method === 'GET') return json(200, { data: [] });
      if (path === '/query-types' && method === 'POST') return json(201, { ...payment, ...(body as object), id: 'qtp_new' });
      if (path === '/properties') return json(200, { data: [] });
      return undefined;
    });
    await click(button('Add type'));
    await type(document.querySelector('[role="dialog"] input'), 'Late delivery');
    await click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Add type'));
    const post = calls.find((c) => c.method === 'POST')?.body as Record<string, unknown>;
    expect(post).toMatchObject({ key: 'late_delivery', name: 'Late delivery', default_status: 'new', visible_roles: [], bot_enabled: false });
    expect((post.statuses as unknown[]).length).toBe(5);
  });

  it('checks statuses the way the API does', () => {
    expect(statusesProblem([{ key: 'new', label: 'New', category: 'open' }])).toBeDefined();
    expect(statusesProblem([{ key: 'new', label: 'New', category: 'open' }, { key: 'wait', label: 'Wait', category: 'pending' }])).toMatch(/done/);
    expect(statusesProblem([{ key: 'new', label: 'New', category: 'open' }, { key: 'new', label: 'Again', category: 'done' }])).toMatch(/twice/);
    expect(statusesProblem([{ key: 'new', label: 'New', category: 'open' }, { key: 'done', label: 'Done', category: 'done' }])).toBeUndefined();
    expect(audience({ ...payment, visible_roles: [] })).toBe('Everyone');
  });
});

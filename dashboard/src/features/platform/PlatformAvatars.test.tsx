import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformCustomer, PlatformUser } from '@/lib/api/types';
import { cleanup, json, renderPage, tick, type FakeApi } from '@/test-utils';
import { PlatformCustomers, PlatformUsers } from './PlatformPages';

// The first test pays for loading the page's modules.
vi.setConfig({ testTimeout: 30_000 });

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

afterEach(cleanup);

const picture = 'https://img.test/avatars/users/alice.png';
const customerPicture = 'https://img.test/avatars/customers/acme/support/cus_ann/abc.png';

const alice: PlatformUser = { id: 'u_alice', email: 'alice@acme.test', name: 'Alice', avatar_url: picture, platform_admin: false, status: 'active', created_at: '2026-10-01T00:00:00Z', memberships: [] };
const bob: PlatformUser = { id: 'u_bob', email: 'bob@acme.test', name: 'Bob', platform_admin: false, status: 'active', created_at: '2026-10-01T00:00:00Z', memberships: [] };
const ann = { id: 'cus_ann', tenant_id: 'acme', tenant_name: 'Acme', bot_id: 'support', name: 'Ann Lee', contacts: [], metadata: {}, properties: {}, avatar_url: customerPicture, avatar_source: 'upload' } as unknown as PlatformCustomer;

const api: FakeApi = ({ path }) => {
  if (path === '/platform/users') return json(200, { data: [alice, bob] });
  if (path === '/platform/customers') return json(200, { data: [ann] });
  if (path === '/platform/tenants') return json(200, { data: [] });
  return undefined;
};

describe('Platform pictures', () => {
  it('show a person’s picture in the Users table, and letters for those without one', async () => {
    await renderPage([{ path: '/platform/users', element: <PlatformUsers /> }], '/platform/users', api);
    await tick();
    expect(document.querySelector(`img[src="${picture}"]`)).not.toBeNull();
    expect(document.querySelectorAll('tbody img')).toHaveLength(1);
    expect(document.body.textContent).toContain('B');
  });

  it('show a customer’s picture in the Customers table', async () => {
    await renderPage([{ path: '/platform/customers', element: <PlatformCustomers /> }], '/platform/customers', api);
    await tick();
    expect(document.querySelector(`img[src="${customerPicture}"]`)).not.toBeNull();
  });
});

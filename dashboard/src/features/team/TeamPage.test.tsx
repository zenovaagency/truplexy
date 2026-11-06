import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { button, cleanup, click, json, renderPage, text, tick, type Call } from '@/test-utils';
import TeamPage, { AssignmentTab, MembersTab } from './TeamPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

afterEach(cleanup);

const routes = [
  {
    path: '/team',
    element: <TeamPage />,
    children: [
      { index: true, element: <MembersTab /> },
      { path: 'assignment', element: <AssignmentTab /> },
    ],
  },
];

const member = (id: string, name: string, role: string, extra: object) => ({ user_id: id, email: `${id}@acme.test`, name, role, joined_at: '2026-01-01T00:00:00Z', ...extra });

/** A business whose API assigns tickets (`withAssignment`), or an older one that doesn't. */
function api(withAssignment = true) {
  const members = withAssignment
    ? [
        member('u1', 'Alex Rivera', 'owner', { support_roles: [], availability: 'available', online: true }),
        member('u2', 'Priya Shah', 'admin', { support_roles: ['billing'], availability: 'available', online: true }),
        member('u3', 'Jun Park', 'agent', { support_roles: ['orders'], availability: 'available', online: false }),
        member('u4', 'Liam Ode', 'viewer', { support_roles: [], availability: 'available', online: true }),
      ]
    : [member('u1', 'Alex Rivera', 'owner', {}), member('u2', 'Priya Shah', 'admin', {})];
  const tenant = {
    id: 'acme', name: 'Acme', business_type: 'retail', plan: 'starter', status: 'active', created_at: '2026-01-01T00:00:00Z',
    reply_target_hours: 24, auto_close_hours: 0, limits: { members: 10 }, limit_overrides: {}, usage: { bots: 1, members: 4, replies_this_month: 0, tokens_this_month: 0 }, balance: 0,
    ...(withAssignment ? { auto_assign: 'category' } : {}),
  };
  return ({ method, path, body }: Call) => {
    if (path === '/me') return json(200, { user: { id: 'u1', email: 'u1@acme.test', name: 'Alex Rivera' }, platform_admin: false, memberships: [], roles: [] });
    if (path === '/tenant' && method === 'GET') return json(200, tenant);
    if (path === '/tenant' && method === 'PATCH') return json(200, { ...tenant, ...(body as object) });
    if (path === '/members') return json(200, { data: members });
    if (path === '/invites') return json(200, { data: [] });
    if (path === '/members/me') return json(200, { ...members[0], ...(body as object) });
    if (path.startsWith('/members/') && method === 'PATCH') return json(200, { ...members.find((m) => path.endsWith(m.user_id)), ...(body as object) });
    return undefined;
  };
}

/** Opens a member's status menu (Radix opens on pointer down) and picks an option. */
async function pickStatus(name: string, option: string) {
  const trigger = document.querySelector(`[aria-label^="Status for ${name}"]`)!;
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false, pointerType: 'mouse' }));
  });
  await tick();
  const item = [...document.querySelectorAll('[role="menuitemradio"]')].find((i) => i.textContent?.startsWith(option));
  await click(item);
}

describe('Team members', () => {
  it('shows support roles and who is online, and saves a status', async () => {
    const { calls } = await renderPage(routes, '/team', api());
    expect(text()).toContain('Support roles');
    expect(text()).toContain('Billing');
    // Jun is set to available but hasn't had the dashboard open lately.
    expect(document.querySelector('[aria-label="Status for Jun Park: Inactive"]')).not.toBeNull();
    // A viewer isn't assigned tickets, so has no status to set.
    expect(text()).toContain('Not assigned tickets');
    expect(document.querySelector('[aria-label^="Status for Liam Ode"]')).toBeNull();

    await pickStatus('Priya Shah', 'Away');
    await pickStatus('Alex Rivera', 'Offline');
    const patches = calls.filter((c) => c.method === 'PATCH');
    expect(patches).toEqual([
      expect.objectContaining({ path: '/members/u2', body: { availability: 'away' } }),
      expect.objectContaining({ path: '/members/me', body: { availability: 'offline' } }),
    ]);
  });

  it('saves the support roles picked for a member', async () => {
    const { calls } = await renderPage(routes, '/team', api());
    await click(document.querySelector('[aria-label="Support roles for Jun Park"]'));
    const technical = [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Technical support'))!.querySelector('input')!;
    await click(technical);
    await click(button('Save'));
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: '/members/u3', body: { support_roles: ['technical', 'orders'] } });
  });

  it('hides roles, status and the Assignment tab on an API without them', async () => {
    await renderPage(routes, '/team', api(false));
    expect(text()).not.toContain('Support roles');
    expect(text()).not.toContain('Assignment');
  });
});

describe('Assignment tab', () => {
  it('shows who covers each category and saves the mode', async () => {
    const { calls } = await renderPage(routes, '/team/assignment', api());
    expect(text()).toContain('By issue category');
    expect(text()).toContain('2 of 3 teammates online now.');
    // Jun handles orders but is inactive, so nobody covers it right now.
    expect(text()).toContain('Nobody online. Tickets go to general support, then anyone.');
    expect(button('Save')!.disabled).toBe(true);

    await click([...document.querySelectorAll('[role="radio"]')].find((r) => r.textContent?.includes('Everyone in turn')));
    await click(button('Save'));
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: '/tenant', body: { auto_assign: 'overall' } });
  });
});

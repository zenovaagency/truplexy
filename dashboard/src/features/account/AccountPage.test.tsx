import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthUser } from '@/lib/auth/AuthProvider';
import { notifyError, notifySuccess } from '@/lib/notify';
import { button, cleanup, click, field, json, renderPage, text, type } from '@/test-utils';
import AccountPage from './AccountPage';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
  return cleanup();
});

const alex: AuthUser = { id: 'u1', email: 'alex@acme.example', name: 'Alex Rivera' };

function setup(user: AuthUser = alex) {
  const auth = {
    status: 'signedIn',
    user,
    updateProfile: vi.fn(async () => {}),
    changeEmail: vi.fn(async () => {}),
    setPassword: vi.fn(async () => {}),
    sendPasswordReset: vi.fn(async () => {}),
  };
  const routes = [
    {
      path: '/account',
      element: (
        <AuthContext.Provider value={auth as never}>
          <AccountPage />
        </AuthContext.Provider>
      ),
    },
  ];
  const api = ({ path }: { path: string }) =>
    path === '/me' ? json(200, { user: { id: 'u1', email: user.email, name: user.name }, platform_admin: false, memberships: [], roles: [] }) : undefined;
  return { auth, routes, api };
}

describe('Account page', () => {
  it('shows the current name and email', async () => {
    const { routes, api } = setup();
    await renderPage(routes, '/account', api);
    expect((field('Your name') as HTMLInputElement).value).toBe('Alex Rivera');
    expect((field('Current email') as HTMLInputElement).value).toBe('alex@acme.example');
  });

  it('offers a profile picture, showing the current one', async () => {
    const { routes } = setup();
    await renderPage(routes, '/account', ({ path }) =>
      path === '/me'
        ? json(200, { user: { id: 'u1', email: alex.email, name: alex.name, avatar_url: 'https://cdn.example/alex.png' }, platform_admin: false, memberships: [], roles: [] })
        : undefined,
    );
    expect(text()).toContain('Profile picture');
    expect(document.querySelector('img[src="https://cdn.example/alex.png"]')).not.toBeNull();
    expect(button('Remove')).toBeDefined();
  });

  it('saves a changed name, and keeps Save off until it changes', async () => {
    const { auth, routes, api } = setup();
    await renderPage(routes, '/account', api);
    expect(button('Save name')?.disabled).toBe(true);
    await type(field('Your name'), '  Alexandra Rivera ');
    await click(button('Save name'));
    expect(auth.updateProfile).toHaveBeenCalledWith({ name: 'Alexandra Rivera' });
    expect(notifySuccess).toHaveBeenCalledWith('Name updated');
  });

  it('asks for a confirmation link when the email changes', async () => {
    const { auth, routes, api } = setup();
    await renderPage(routes, '/account', api);
    await type(field('New email'), 'not-an-email');
    expect(text()).toContain('Enter a valid email address');
    expect(button('Send confirmation')?.disabled).toBe(true);
    await type(field('New email'), 'ALEX@acme.example');
    expect(text()).toContain('That is already your email');
    await type(field('New email'), 'alex@newco.example');
    await click(button('Send confirmation'));
    expect(auth.changeEmail).toHaveBeenCalledWith('alex@newco.example');
    expect(text()).toContain('Confirm your new email');
    expect(text()).toContain('alex@newco.example');
  });

  it('shows an email change that is still waiting for its link', async () => {
    const { routes, api } = setup({ ...alex, pendingEmail: 'alex@newco.example' });
    await renderPage(routes, '/account', api);
    expect(text()).toContain('Confirm your new email');
  });

  it('checks the new password before sending it', async () => {
    const { auth, routes, api } = setup();
    await renderPage(routes, '/account', api);
    await type(field('New password'), 'short');
    expect(text()).toContain('At least 8 characters');
    await type(field('New password'), 'long-enough-1');
    await type(field('Confirm new password'), 'something-else');
    expect(text()).toContain('Passwords do not match');
    expect(button('Update password')?.disabled).toBe(true);
    await type(field('Confirm new password'), 'long-enough-1');
    await click(button('Update password'));
    expect(auth.setPassword).toHaveBeenCalledWith('long-enough-1');
    expect(notifySuccess).toHaveBeenCalledWith('Password updated');
  });

  it('turns a failed password change into a message', async () => {
    const { auth, routes, api } = setup();
    auth.setPassword.mockRejectedValueOnce(new Error('New password should be different from the old password.'));
    await renderPage(routes, '/account', api);
    await type(field('New password'), 'long-enough-1');
    await type(field('Confirm new password'), 'long-enough-1');
    await click(button('Update password'));
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect((vi.mocked(notifyError).mock.calls[0][0] as Error).message).toBe('Choose a password you have not used before.');
  });

  it('can email a reset link to the signed-in address', async () => {
    const { auth, routes, api } = setup();
    await renderPage(routes, '/account', api);
    await click(button('Email me a reset link instead'));
    expect(auth.sendPasswordReset).toHaveBeenCalledWith('alex@acme.example');
  });

  it('greets someone who arrived from a reset link', async () => {
    const { routes, api } = setup();
    await renderPage(routes, '/account?recovery=1', api);
    expect(text()).toContain('Choose a new password');
  });
});

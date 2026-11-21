import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.fn();
vi.mock('@/lib/api/client', () => ({ api: (...args: unknown[]) => api(...args) }));
vi.mock('@/lib/env', () => ({ env: { useMocks: false } }));

import { adoptAttribution, clearAttribution, pendingAttribution, sendAttribution } from './attribution';

/** What the marketing site puts in the link (src/lib/attribution.ts there). */
const encode = (value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const visit = (search: string) => window.history.replaceState(null, '', `/sign-in${search}`);

beforeEach(() => {
  localStorage.clear();
  api.mockReset();
  api.mockResolvedValue(undefined);
  document.cookie = '_fbp=; Max-Age=0; path=/';
  visit('');
});

describe('adoptAttribution', () => {
  it('keeps what the link carried and removes it from the address', () => {
    visit(`?mode=signup&tpx_a=${encode({ utm_source: 'meta', utm_campaign: 'launch', evil: 'x' })}`);
    adoptAttribution();
    expect(window.location.search).toBe('?mode=signup');
    expect(pendingAttribution()).toEqual({ utm_source: 'meta', utm_campaign: 'launch', fbp: undefined, fbc: undefined });
  });

  it('does nothing without the parameter, and ignores one that is not valid', () => {
    adoptAttribution();
    visit('?tpx_a=%%%not-base64');
    adoptAttribution();
    expect(window.location.search).toBe('');
    expect(pendingAttribution()).toBeNull();
  });

  it('keeps the first visit, not a later one', () => {
    visit(`?tpx_a=${encode({ utm_source: 'meta' })}`);
    adoptAttribution();
    visit(`?tpx_a=${encode({ utm_source: 'google' })}`);
    adoptAttribution();
    expect(pendingAttribution()?.utm_source).toBe('meta');
  });

  it('keeps nothing for someone who declined here', () => {
    localStorage.setItem('tpx-consent', 'denied');
    visit(`?tpx_a=${encode({ utm_source: 'meta' })}`);
    adoptAttribution();
    expect(pendingAttribution()).toBeNull();
  });

  it('cuts long values and strips control characters', () => {
    visit(`?tpx_a=${encode({ utm_source: `a\nb${'x'.repeat(500)}` })}`);
    adoptAttribution();
    const source = pendingAttribution()?.utm_source ?? '';
    expect(source.length).toBeLessThanOrEqual(300);
    expect(source).not.toContain('\n');
  });
});

describe('pendingAttribution', () => {
  it('is empty for a direct visitor who has not accepted anything', () => {
    expect(pendingAttribution()).toBeNull();
  });

  it('is a bare sign-up for a direct visitor who accepted the banner here', () => {
    localStorage.setItem('tpx-consent', 'granted');
    expect(pendingAttribution()).toMatchObject({ landing_path: '/sign-in' });
  });

  it('adds Meta’s browser ID when the cookie exists', () => {
    localStorage.setItem('tpx-consent', 'granted');
    document.cookie = '_fbp=fb.1.123.456; path=/';
    expect(pendingAttribution()?.fbp).toBe('fb.1.123.456');
  });

  it('is emptied by clearAttribution (a decline)', () => {
    visit(`?tpx_a=${encode({ utm_source: 'meta' })}`);
    adoptAttribution();
    clearAttribution();
    expect(pendingAttribution()).toBeNull();
  });
});

describe('sendAttribution', () => {
  it('sends once per person, with consent, and forgets the details', async () => {
    visit(`?tpx_a=${encode({ utm_source: 'meta', utm_campaign: 'launch' })}`);
    adoptAttribution();
    await sendAttribution('user-1');
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/me/attribution', { method: 'PUT', body: expect.objectContaining({ utm_source: 'meta', utm_campaign: 'launch', consent: true }) });
    expect(pendingAttribution()).toBeNull();
    // A second visit by the same person sends nothing.
    localStorage.setItem('tpx-consent', 'granted');
    await sendAttribution('user-1');
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when there is nothing to send', async () => {
    await sendAttribution('user-1');
    expect(api).not.toHaveBeenCalled();
  });

  it('keeps the details when the request fails, to try next time', async () => {
    visit(`?tpx_a=${encode({ utm_source: 'meta' })}`);
    adoptAttribution();
    api.mockRejectedValueOnce(new Error('offline'));
    await sendAttribution('user-1');
    expect(pendingAttribution()?.utm_source).toBe('meta');
    await sendAttribution('user-1');
    expect(api).toHaveBeenCalledTimes(2);
  });
});

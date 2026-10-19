import { describe, expect, it, vi } from 'vitest';
import { createImageRefresher, urlExpired } from './refresh';

describe('createImageRefresher', () => {
  it('reloads once for a picture, then reports that it already had its reload', async () => {
    const reload = vi.fn(async () => {});
    const r = createImageRefresher(reload);
    expect(await r.request('att_1')).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(r.tried('att_1')).toBe(true);
    expect(await r.request('att_1')).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shares one reload between pictures that fail together', async () => {
    let finish!: () => void;
    const reload = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const r = createImageRefresher(reload);
    const all = Promise.all([r.request('att_1'), r.request('att_2'), r.request('att_3')]);
    finish();
    expect(await all).toEqual([true, true, true]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('lets a picture that loaded use its reload again when the next link runs out', async () => {
    const reload = vi.fn(async () => {});
    const r = createImageRefresher(reload);
    await r.request('att_1');
    r.loaded('att_1');
    expect(r.tried('att_1')).toBe(false);
    await r.request('att_1');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('lets the person try again by hand', async () => {
    const reload = vi.fn(async () => {});
    const r = createImageRefresher(reload);
    await r.request('att_1');
    r.reset('att_1');
    expect(await r.request('att_1')).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('survives a reload that fails', async () => {
    const r = createImageRefresher(async () => {
      throw new Error('offline');
    });
    await expect(r.request('att_1')).resolves.toBe(true);
    await expect(r.request('att_1')).resolves.toBe(false);
  });
});

describe('urlExpired', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  it('is true once the link has run out, or is about to', () => {
    expect(urlExpired('2026-10-19T11:59:00Z', now)).toBe(true);
    expect(urlExpired('2026-10-19T12:00:10Z', now)).toBe(true);
  });
  it('is false for a link with time left, and for a date it cannot read', () => {
    expect(urlExpired('2026-10-19T12:30:00Z', now)).toBe(false);
    expect(urlExpired('not a date', now)).toBe(false);
  });
});

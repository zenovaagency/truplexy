import { afterEach, describe, expect, it } from 'vitest';
import { readPref } from './theme';

const KEY = 'truplexy.theme';

afterEach(() => localStorage.clear());

describe('readPref', () => {
  it('starts someone new on light, and remembers it', () => {
    expect(readPref()).toBe('light');
    expect(localStorage.getItem(KEY)).toBe('light');
  });

  it('keeps someone already signed in from before on the system theme', () => {
    localStorage.setItem('sb-abcdefgh-auth-token', '{}');
    expect(readPref()).toBe('system');
    expect(localStorage.getItem(KEY)).toBe('system');
  });

  it('keeps a stored choice', () => {
    for (const v of ['light', 'dark', 'system'] as const) {
      localStorage.setItem(KEY, v);
      expect(readPref()).toBe(v);
    }
  });
});

import { useCallback, useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'truplexy.theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let pref = readPref();

function apply() {
  const dark = pref === 'dark' || (pref === 'system' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  listeners.forEach((l) => l());
}

media.addEventListener('change', () => pref === 'system' && apply());

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  apply();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The stored preference and the theme actually showing. */
export function useTheme() {
  const resolved = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme as 'light' | 'dark');
  const current = useSyncExternalStore(subscribe, () => pref);
  const toggle = useCallback(() => setThemePref(resolved === 'dark' ? 'light' : 'dark'), [resolved]);
  return { pref: current, resolved, setPref: setThemePref, toggle };
}

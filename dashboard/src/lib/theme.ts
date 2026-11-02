import { useCallback, useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'truplexy.theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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

/** Where on screen a change started, so the new theme can grow out of it. */
export interface ThemeOrigin {
  x: number;
  y: number;
}

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };

/**
 * Runs the change as a circle that grows from `origin` (View Transitions), or as a short cross-fade of the colours
 * where that isn't available or no origin is known. Does nothing fancy for people who ask for less motion.
 */
function animated(update: () => void, origin?: ThemeOrigin) {
  const root = document.documentElement;
  if (reduceMotion.matches) return update();
  const doc = document as ViewTransitionDoc;
  if (origin && doc.startViewTransition) {
    const vt = doc.startViewTransition(update);
    void vt.ready
      .then(() => {
        const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y));
        root.animate(
          { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
          { duration: 550, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {});
    return;
  }
  root.classList.add('theme-fade');
  update();
  window.setTimeout(() => root.classList.remove('theme-fade'), 400);
}

export function setThemePref(next: ThemePref, origin?: ThemeOrigin) {
  pref = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  animated(apply, origin);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The stored preference and the theme actually showing. */
export function useTheme() {
  const resolved = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme as 'light' | 'dark');
  const current = useSyncExternalStore(subscribe, () => pref);
  const toggle = useCallback((origin?: ThemeOrigin) => setThemePref(resolved === 'dark' ? 'light' : 'dark', origin), [resolved]);
  return { pref: current, resolved, setPref: setThemePref, toggle };
}

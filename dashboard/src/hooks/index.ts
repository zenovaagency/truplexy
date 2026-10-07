import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useBlocker } from 'react-router';
import { ScopeContext, switchesScope } from '@/lib/session/scope-context';

export function useDebounce<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Breakpoints matching the layout: full sidebar ≥ 1280, rail ≥ 768, drawer below. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1280px)');
export const useIsTablet = () => useMediaQuery('(min-width: 768px)');

export function useCopy(timeout = 1600) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard API blocked (insecure origin): fall back to a hidden textarea.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), timeout);
    },
    [timeout],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return { copied, copy };
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * Global key handler that ignores keys typed into fields. `keys` are
 * single keys ("j") or two-key sequences ("g t"), or "mod+k".
 */
export function useHotkeys(bindings: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    if (!enabled) return;
    let prefix = '';
    let prefixTimer = 0;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod) {
        const fn = ref.current[`mod+${key}`];
        if (fn) {
          e.preventDefault();
          fn(e);
        }
        return;
      }
      if (e.altKey || isTyping(e.target)) return;
      const seq = prefix ? `${prefix} ${key}` : key;
      if (ref.current[seq]) {
        e.preventDefault();
        prefix = '';
        ref.current[seq](e);
        return;
      }
      if (Object.keys(ref.current).some((k) => k.startsWith(`${key} `))) {
        prefix = key;
        clearTimeout(prefixTimer);
        prefixTimer = window.setTimeout(() => (prefix = ''), 900);
      } else prefix = '';
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(prefixTimer);
    };
  }, [enabled]);
}

/** Warns before leaving a page with unsaved edits, both in-app and on tab close. */
export function useUnsavedChanges(dirty: boolean) {
  const scope = useContext(ScopeContext)?.scope;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && (currentLocation.pathname !== nextLocation.pathname || switchesScope(nextLocation.state, scope)),
  );
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
  return blocker;
}

/** Local state remembered across visits (per browser). */
export function useStoredState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T) => {
      setV(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [v, set] as const;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '@/lib/env';

/**
 * Cloudflare Turnstile, the human check that Supabase Auth enforces on sign-up, sign-in, email links and
 * password reset. It is invisible unless Cloudflare needs the person to click. With no site key (or in demo
 * mode) nothing is loaded and `ready` is always true, so local work and tests need no setup.
 */

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not start')));
    script.onerror = () => {
      script.remove();
      reject(new Error('Turnstile could not be loaded'));
    };
    document.head.appendChild(script);
  });
  // A failed load is retried on the next mount.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export interface TurnstileHandle {
  /** Whether a human check applies here at all. */
  enabled: boolean;
  /** A fresh one-time token to send with the request, or undefined when no check applies. */
  token: string | undefined;
  /** True when the form may be submitted: no check applies, or a token is in hand. */
  ready: boolean;
  /** True when the check could not start (blocked script, network). The form cannot be submitted. */
  failed: boolean;
  /** Attach to an empty element inside the form. */
  ref: (el: HTMLElement | null) => void;
  /** Call after every request: a token works once. */
  reset: () => void;
}

export function useTurnstile(): TurnstileHandle {
  const enabled = !env.useMocks && Boolean(env.turnstileSiteKey);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [token, setToken] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !el) return;
    let cancelled = false;
    let id: string | null = null;
    setFailed(false);
    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        id = api.render(el, {
          sitekey: env.turnstileSiteKey,
          appearance: 'interaction-only',
          callback: (t: string) => {
            setFailed(false);
            setToken(t);
          },
          // The widget fetches a new token itself after expiry; until it does there is none to send.
          'expired-callback': () => setToken(undefined),
          'timeout-callback': () => setToken(undefined),
          'error-callback': () => {
            setToken(undefined);
            setFailed(true);
          },
        });
        widget.current = id;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
      widget.current = null;
      setToken(undefined);
    };
  }, [enabled, el]);

  const reset = useCallback(() => {
    if (!widget.current) return;
    setToken(undefined);
    window.turnstile?.reset(widget.current);
  }, []);

  return { enabled, token, ready: !enabled || token !== undefined, failed, ref: setEl, reset };
}

/** Said under the form when the check cannot run. */
export const TURNSTILE_FAILED_MESSAGE = "The human check didn't load. Turn off content blockers for this site or refresh the page, then try again.";

/** Supabase's CAPTCHA refusals (`captcha_failed`) in words a person can act on. */
export function isCaptchaError(e: unknown): boolean {
  return e instanceof Error && /captcha/i.test(e.message);
}

export const CAPTCHA_ERROR_MESSAGE = "We couldn't confirm you're human. Refresh the page and try again.";

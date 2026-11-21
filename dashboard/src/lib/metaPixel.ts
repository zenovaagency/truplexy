/**
 * Meta Pixel, behind consent, for the signed-out sign-in / sign-up page only.
 * Nothing runs, and facebook.net is never contacted, until the visitor accepts
 * the banner (features/auth/PixelConsent.tsx) and VITE_META_PIXEL_ID is set.
 * Never load it inside the signed-in dashboard: that holds customer data.
 * Mirrors src/lib/meta-pixel.ts on the marketing site; the choice is stored
 * per origin, so app.truplexy.com asks once on its own.
 */

const KEY = 'tpx-consent';
const SRC = 'https://connect.facebook.net/en_US/fbevents.js';

export type Consent = 'granted' | 'denied';

type Fbq = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: unknown;
  loaded: boolean;
  version: string;
};
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(value: Consent): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* storage blocked: the choice lasts until the page closes */
  }
}

/** Loads the Pixel once and records a PageView. Safe to call again. */
export function loadPixel(id: string): void {
  if (!id || window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  const script = document.createElement('script');
  script.async = true;
  script.src = SRC;
  document.head.appendChild(script);
  fbq('init', id);
  fbq('track', 'PageView');
}

/** Sends a standard event, only if the Pixel is running (consent given, ID set). */
export function track(event: string): void {
  window.fbq?.('track', event);
}

/** Withdrawn consent: stop sending and remove Meta's first-party cookies. */
export function revokePixel(): void {
  window.fbq?.('consent', 'revoke');
  const host = location.hostname.replace(/^www\./, '');
  for (const name of ['_fbp', '_fbc']) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=${location.hostname}`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=.${host}`;
  }
}

/** The footer's "Cookie settings" button asks the banner to reopen with this event. */
export const COOKIE_SETTINGS_EVENT = 'tpx:cookie-settings';

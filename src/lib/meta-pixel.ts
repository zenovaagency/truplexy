/**
 * Meta Pixel, behind consent. Nothing here runs, and facebook.net is never
 * contacted, until the visitor accepts the banner (ConsentBanner.astro) and
 * PUBLIC_META_PIXEL_ID is set. The choice lives in this browser's local
 * storage (per site: truplexy.com and app.truplexy.com each ask once).
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

/** Sends a standard event, only if the Pixel is running. */
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

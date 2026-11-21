/**
 * Where a new account came from, saved once against the account.
 *
 * The marketing site adds a `tpx_a` parameter to links to the sign-in page,
 * but only for visitors who accepted its cookie banner (src/lib/attribution.ts
 * there). Its presence therefore counts as that consent. This module keeps the
 * details across the sign-up round trips (email confirmation, Google, magic
 * link), and the first time a person is signed in sends them to
 * PUT /me/attribution, which stores them once. The visitor can still decline on
 * this site's own banner, which discards them.
 *
 * Someone who came straight to this page and accepted this site's banner is
 * sent too, with no campaign. Without consent nothing is kept or sent.
 */
import { api } from '@/lib/api/client';
import { env } from '@/lib/env';
import { getConsent } from '@/lib/metaPixel';

const KEY = 'tpx-attr';
const SENT = 'tpx-attr-sent';
/** The link parameter the marketing site adds. */
export const PARAM = 'tpx_a';

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  referrer?: string;
  landing_path?: string;
  fbp?: string;
  fbc?: string;
}

const FIELDS: (keyof Attribution)[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'referrer',
  'landing_path',
  'fbp',
  'fbc',
];

function decode(value: string): Attribution | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
    if (!parsed || typeof parsed !== 'object') return null;
    // Only known text fields, cut short: the parameter comes from a link anyone can write.
    const out: Attribution = {};
    for (const field of FIELDS) {
      const v = (parsed as Record<string, unknown>)[field];
      if (typeof v === 'string' && v.trim()) out[field] = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 300);
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function read(): Attribution | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

function cookie(name: string): string {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

/**
 * Keeps the details the link carried and removes them from the address bar.
 * The first set wins; a visitor who declined on this site is not attributed.
 */
export function adoptAttribution(): void {
  const url = new URL(window.location.href);
  const value = url.searchParams.get(PARAM);
  if (value === null) return;
  url.searchParams.delete(PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  const found = decode(value);
  if (!found || getConsent() === 'denied') return;
  try {
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    /* storage blocked: this sign-up is not attributed */
  }
}

/** Forgets what was kept, when the visitor declines. */
export function clearAttribution(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing was kept */
  }
}

/** What would be sent for this browser now, or null for nothing. */
export function pendingAttribution(): Attribution | null {
  const consent = getConsent();
  if (consent === 'denied') return null;
  const base = read() ?? (consent === 'granted' ? { landing_path: '/sign-in' } : null);
  if (!base) return null;
  // Meta's cookies are first-party here once the Pixel has run on the sign-in page.
  return { ...base, fbp: cookie('_fbp') || base.fbp, fbc: cookie('_fbc') || base.fbc };
}

/** Sends the details for a signed-in person, once per person per browser. A failure is ignored: it is tried again next time. */
export async function sendAttribution(userId: string): Promise<void> {
  if (env.useMocks || !userId) return;
  try {
    if (localStorage.getItem(SENT) === userId) return;
  } catch {
    /* without storage it is simply sent again; the server keeps the first */
  }
  const attribution = pendingAttribution();
  if (!attribution) return;
  try {
    await api('/me/attribution', { method: 'PUT', body: { ...attribution, consent: true } });
  } catch {
    return;
  }
  clearAttribution();
  try {
    localStorage.setItem(SENT, userId);
  } catch {
    /* sent again next time at worst */
  }
}

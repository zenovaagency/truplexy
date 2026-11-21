/**
 * Where a visit came from, carried to the dashboard's sign-up page.
 *
 * Only after the visitor accepts the banner (ConsentBanner.astro): the first
 * visit's UTM tags, ad click IDs, referrer host and landing path are kept in
 * this browser's local storage, and added as one `tpx_a` parameter to links to
 * the dashboard's sign-in page when they are used. The dashboard
 * (dashboard/src/lib/attribution.ts) saves them once against the new account.
 * A visitor who declines, or never answers, is not attributed and no link is
 * changed. The two sites are different origins, which is why the details travel
 * in the link rather than in storage.
 */
import { SITE } from '../data/site';
import { getConsent } from './meta-pixel';

const KEY = 'tpx-attr';
/** The link parameter. Read by dashboard/src/lib/attribution.ts. */
export const PARAM = 'tpx_a';

const TAGS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'] as const;

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  /** Host of the page that sent the visitor, never the full address. */
  referrer?: string;
  /** Path only, without the query string. */
  landing_path?: string;
  fbp?: string;
  fbc?: string;
}

const clip = (value: string | null | undefined, max = 200) => (value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

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

const hasCampaign = (a: Attribution) => TAGS.some((tag) => Boolean(a[tag]));

/**
 * Keeps this visit's details if the visitor has accepted the banner. The first
 * visit wins, unless it had no campaign details and this one has.
 */
export function captureAttribution(): void {
  if (getConsent() !== 'granted') return;
  const params = new URLSearchParams(location.search);
  const found: Attribution = {};
  for (const tag of TAGS) {
    const value = clip(params.get(tag), tag === 'fbclid' || tag === 'gclid' ? 300 : 200);
    if (value) found[tag] = value;
  }
  const existing = read();
  if (existing && (hasCampaign(existing) || !hasCampaign(found))) return;
  try {
    const referrer = document.referrer ? new URL(document.referrer).hostname : '';
    if (referrer && referrer !== location.hostname) found.referrer = clip(referrer);
  } catch {
    /* an unreadable referrer is simply left out */
  }
  found.landing_path = clip(location.pathname, 300);
  if (found.fbclid) found.fbc = `fb.1.${Date.now()}.${found.fbclid}`;
  try {
    localStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    /* storage blocked: this visit is not attributed */
  }
}

/** Standard base64url, so the value is safe inside a query string. */
export function encode(a: Attribution): string {
  const bytes = new TextEncoder().encode(JSON.stringify(a));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The link with the visitor's attribution added, or null if the link is not a dashboard sign-in or there is nothing to add. */
export function withAttribution(href: string): string | null {
  if (getConsent() !== 'granted') return null;
  let url: URL;
  try {
    url = new URL(href, location.href);
  } catch {
    return null;
  }
  if (url.origin !== SITE.dashboardUrl || !url.pathname.startsWith('/sign-in')) return null;
  const saved = read();
  if (!saved) return null;
  // Meta's own cookies are set once the Pixel runs, which may be after the first visit was kept.
  const attribution: Attribution = { ...saved, fbp: cookie('_fbp') || saved.fbp, fbc: cookie('_fbc') || saved.fbc };
  url.searchParams.set(PARAM, encode(attribution));
  return url.toString();
}

function onLink(event: MouseEvent) {
  const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return;
  const next = withAttribution(anchor.href);
  if (next) anchor.href = next;
}

let listening = false;

/** Starts keeping attribution and adding it to sign-in links. Safe to call again. */
export function initAttribution(): void {
  captureAttribution();
  if (listening) return;
  listening = true;
  // Captured before the browser follows the link, whichever way it is opened. The billing toggle on the
  // pricing page re-points its buttons, so links are changed when used, not when the page loads.
  document.addEventListener('click', onLink, true);
  document.addEventListener('auxclick', onLink, true);
}

/** Forgets what was kept, when the visitor declines. */
export function clearAttribution(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing was kept */
  }
}

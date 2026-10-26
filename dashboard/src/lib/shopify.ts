import type { Channel, Tool } from '@/lib/api/types';

/* Shopify stores (API_REFERENCE.md → "Shopify stores (2026-10-25)"). */

export const SHOPIFY = 'shopify';

/** The two built-in tools a connected store gives its bot. Neither is turned on by itself. */
export const SHOPIFY_TOOLS = ['shopify_order_status', 'shopify_product_search'] as const;

export const isShopifyChannel = (c: Pick<Channel, 'type'>) => c.type === SHOPIFY;
export const isShopifyTool = (t: Pick<Tool, 'name' | 'built_in'>) => Boolean(t.built_in) && t.name.startsWith('shopify_');

/**
 * GET /tools lists a Shopify tool as unavailable. With an active Shopify channel,
 * that means the store's access is gone (the app was uninstalled): Reconnect.
 */
export const shopifyToolsUnavailable = (tools: Tool[] | undefined) => Boolean(tools?.some((t) => isShopifyTool(t) && !t.available));

/** Query parameters the API adds on the way back from Shopify, and Shopify's own for an install started there. */
export const RETURN_PARAMS = ['connected', 'connect_error', 'channel_id', 'type', 'shopify_shop'] as const;

/**
 * The page to come back to after Shopify: this page on this origin (so previews
 * and local development come back to themselves), keeping its own query but
 * not the parameters of an earlier return.
 */
export function connectReturnTo(href: string) {
  const u = new URL(href);
  for (const k of RETURN_PARAMS) u.searchParams.delete(k);
  u.hash = '';
  return u.toString();
}

/** Light checks only: the API accepts your-store, your-store.myshopify.com and the admin URL, and says what's wrong otherwise. */
export function storeFieldError(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your store's address.";
  if (/\s/.test(v)) return "A store's address has no spaces.";
  return null;
}

/** Why Shopify sent the person back without connecting, by `connect_error`. */
export const CONNECT_ERRORS: Record<string, string> = {
  denied: "The install wasn't approved in Shopify.",
  expired: 'That link expired or was already used. Connect again.',
  invalid: "That sign-in didn't come from Shopify, or named a different store. Connect again.",
  store_connected_elsewhere: 'This store is already connected to another Truplexy business. Uninstall the app there first.',
  scopes_missing: "Some permissions weren't approved in Shopify. Connect again and approve all of them.",
  failed: 'Something went wrong connecting your store. Try again.',
};

export const connectErrorMessage = (code: string) => CONNECT_ERRORS[code] ?? CONNECT_ERRORS.failed!;

/**
 * What the return from Shopify says, or null when the query isn't one.
 * Only a Shopify return counts, so another `connected` parameter isn't taken for one.
 */
export function readConnectReturn(params: URLSearchParams): { ok: true; channelId: string | null } | { ok: false; code: string } | null {
  const type = params.get('type');
  const connected = params.get('connected');
  const code = params.get('connect_error');
  // The docs' summary leaves type off the success URL; connected=shopify names the type itself.
  if (connected === SHOPIFY && (type === SHOPIFY || type === null)) return { ok: true, channelId: params.get('channel_id') };
  if (code && type === SHOPIFY) return { ok: false, code };
  return null;
}

/** The bot's tools with both Shopify tools added, or null when that would pass the 20-tool limit. */
export function withShopifyTools(tools: string[] | undefined, max = 20): string[] | null {
  const next = [...new Set([...(tools ?? []), ...SHOPIFY_TOOLS])];
  return next.length > max ? null : next;
}

/* Remembered for this tab: the server has no Shopify app, so Connect can't work until it's set up. */
const UNAVAILABLE_KEY = 'truplexy.shopify-unavailable';

/** Kept in memory too, for when the browser blocks storage. */
let unavailableHere = false;

export function shopifyUnavailable() {
  if (unavailableHere) return true;
  try {
    return sessionStorage.getItem(UNAVAILABLE_KEY) === '1';
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

/** For useSyncExternalStore: every connect control on the page turns off together. */
export function subscribeShopifyUnavailable(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function markShopifyUnavailable() {
  unavailableHere = true;
  try {
    sessionStorage.setItem(UNAVAILABLE_KEY, '1');
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}

/** Whether a store's pages have loaded the chat window, from `last_seen_at`. */
export const widgetIsLive = (w: { last_seen_at: string } | undefined) => Boolean(w?.last_seen_at);

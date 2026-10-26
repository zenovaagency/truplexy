import type { Channel, Tool } from '@/lib/api/types';

/* WooCommerce stores (API_REFERENCE.md → POST /channels/connect, "WooCommerce"). */

export const WOOCOMMERCE = 'woocommerce';

/** The two built-in tools a connected store gives its bot. Neither is turned on by itself. */
export const WOOCOMMERCE_TOOLS = ['woocommerce_order_status', 'woocommerce_product_search'] as const;

export const isWooCommerceChannel = (c: Pick<Channel, 'type'>) => c.type === WOOCOMMERCE;
export const isWooCommerceTool = (t: Pick<Tool, 'name' | 'built_in'>) => Boolean(t.built_in) && t.name.startsWith('woocommerce_');

/** Which store platform a built-in tool belongs to, for its badge. */
export function storeToolPlatform(t: Pick<Tool, 'name' | 'built_in'>): 'Shopify' | 'WooCommerce' | null {
  if (!t.built_in) return null;
  if (t.name.startsWith('shopify_')) return 'Shopify';
  if (t.name.startsWith('woocommerce_')) return 'WooCommerce';
  return null;
}

/**
 * GET /tools lists a WooCommerce tool as unavailable. With an active WooCommerce channel,
 * that means the keys no longer work (the store revoked them): Reconnect.
 */
export const wooCommerceToolsUnavailable = (tools: Tool[] | undefined) => Boolean(tools?.some((t) => isWooCommerceTool(t) && !t.available));

/** Light checks only: the API wants an https address of a public host and says what's wrong otherwise. */
export function siteFieldError(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your store's address.";
  if (/\s/.test(v)) return "A store's address has no spaces.";
  if (/^http:\/\//i.test(v)) return 'The store must use https.';
  if (!v.includes('.')) return "Enter the full address, such as shop.example.com.";
  return null;
}

/** Why WooCommerce sent the person back without connecting, by `connect_error`. */
export const WOO_CONNECT_ERRORS: Record<string, string> = {
  denied: "Access wasn't approved on your store.",
  expired: 'That link expired or was already used. Connect again.',
  invalid: "That sign-in wasn't recognised. Connect again.",
  store_connected_elsewhere: 'This store is already connected to another Truplexy business.',
  scopes_missing: "The keys your store made can't read orders. Connect again and approve read access.",
  failed: "Truplexy couldn't use the keys your store made. Check that the store is on https and its REST API is on, then try again.",
};

export const wooConnectErrorMessage = (code: string) => WOO_CONNECT_ERRORS[code] ?? WOO_CONNECT_ERRORS.failed!;

/** What the return from a WooCommerce store says, or null when the query isn't one. */
export function readWooConnectReturn(params: URLSearchParams): { ok: true; channelId: string | null } | { ok: false; code: string } | null {
  const type = params.get('type');
  const connected = params.get('connected');
  const code = params.get('connect_error');
  if (connected === WOOCOMMERCE && (type === WOOCOMMERCE || type === null)) return { ok: true, channelId: params.get('channel_id') };
  if (code && type === WOOCOMMERCE) return { ok: false, code };
  return null;
}

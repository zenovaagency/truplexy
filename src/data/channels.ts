/**
 * The channel registry — the single source of truth for what Truplexy
 * connects to and whether it is live.
 *
 * Every badge, diagram node, status row and footer list on the site reads
 * `status` from here. When an integration ships, flip it to 'live' and the
 * whole page follows; nothing else hard-codes availability.
 *
 * Copy rule: a channel that is not 'live' must never appear on the page
 * without its "Coming soon" label, and demo conversations only ever use
 * live channels.
 */
export type ChannelStatus = 'live' | 'soon';

export type ChannelGroup = 'messaging' | 'business' | 'internal' | 'developer';

export type ChannelId =
  | 'web'
  | 'telegram'
  | 'discord'
  | 'whatsapp'
  | 'messenger'
  | 'instagram'
  | 'email'
  | 'shopify'
  | 'woocommerce'
  | 'wordpress'
  | 'hubspot'
  | 'zendesk'
  | 'slack'
  | 'teams'
  | 'api'
  | 'webhooks'
  | 'custom';

export interface Channel {
  id: ChannelId;
  name: string;
  group: ChannelGroup;
  status: ChannelStatus;
  /** Full-colour brand logo (theSVG), a file under public/brands. Absent → ChannelIcon draws a neutral glyph. */
  icon?: string;
  /** Tint for the neutral glyph when the channel is live. */
  color: string;
  /** Optional qualifier shown under the name in the ecosystem diagram. */
  note?: string;
}

export const GROUP_LABEL: Record<ChannelGroup, string> = {
  messaging: 'Customer messaging',
  business: 'Business platforms',
  internal: 'Internal collaboration',
  developer: 'Developer',
};

const INDIGO = 'var(--color-accent)';
const INK = 'var(--color-ink)';

export const CHANNELS: readonly Channel[] = [
  // Customer messaging
  { id: 'web', name: 'Website chat', group: 'messaging', status: 'live', color: INDIGO },
  { id: 'telegram', name: 'Telegram', group: 'messaging', status: 'live', icon: '/brands/telegram.svg', color: INK },
  { id: 'discord', name: 'Discord', group: 'messaging', status: 'live', icon: '/brands/discord.svg', color: INK },
  { id: 'whatsapp', name: 'WhatsApp', group: 'messaging', status: 'live', icon: '/brands/whatsapp.svg', color: INK },
  { id: 'messenger', name: 'Messenger', group: 'messaging', status: 'live', icon: '/brands/messenger.svg', color: INK },
  { id: 'instagram', name: 'Instagram', group: 'messaging', status: 'live', icon: '/brands/instagram.svg', color: INK },
  { id: 'email', name: 'Email', group: 'messaging', status: 'live', color: INK },

  // Business platforms
  { id: 'shopify', name: 'Shopify', group: 'business', status: 'live', icon: '/brands/shopify.svg', color: INK },
  { id: 'woocommerce', name: 'WooCommerce', group: 'business', status: 'live', icon: '/brands/woocommerce.svg', color: INK },
  { id: 'wordpress', name: 'WordPress', group: 'business', status: 'live', icon: '/brands/wordpress.svg', color: INK },
  { id: 'hubspot', name: 'HubSpot', group: 'business', status: 'live', icon: '/brands/hubspot.svg', color: INK },
  { id: 'zendesk', name: 'Zendesk', group: 'business', status: 'live', icon: '/brands/zendesk.svg', color: INK },

  // Internal collaboration
  { id: 'slack', name: 'Slack', group: 'internal', status: 'live', icon: '/brands/slack.svg', color: INK },
  { id: 'teams', name: 'Microsoft Teams', group: 'internal', status: 'live', icon: '/brands/microsoft-teams.svg', color: INK },

  // Developer
  { id: 'api', name: 'REST API', group: 'developer', status: 'live', color: INK },
  { id: 'custom', name: 'Custom integrations', group: 'developer', status: 'live', color: INK, note: 'Built on the REST API' },
  { id: 'webhooks', name: 'Webhooks', group: 'developer', status: 'live', color: INK },
];

const BY_ID = new Map(CHANNELS.map((c) => [c.id, c]));

export function channel(id: ChannelId): Channel {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unknown channel: ${id}`);
  return c;
}

export const isLive = (id: ChannelId) => channel(id).status === 'live';

export const LIVE_CHANNELS = CHANNELS.filter((c) => c.status === 'live');
export const SOON_CHANNELS = CHANNELS.filter((c) => c.status === 'soon');

export function channelsIn(group: ChannelGroup) {
  return CHANNELS.filter((c) => c.group === group);
}

/** "A, B & C" — for prose that lists channels. */
export function listNames(list: readonly Channel[]) {
  const names = list.map((c) => c.name);
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}

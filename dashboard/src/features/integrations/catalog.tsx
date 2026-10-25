import { Code2, Globe, Mail, Webhook, type LucideIcon } from 'lucide-react';
import type { ApiKey, Channel } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import type { Lang } from './snippets/types';

export type IntegrationGroup = 'messaging' | 'business' | 'internal' | 'developer';

export const GROUP_LABEL: Record<IntegrationGroup, string> = {
  messaging: 'Customer messaging',
  business: 'Business platforms',
  internal: 'Team collaboration',
  developer: 'Developer',
};

export interface Integration {
  id: string;
  name: string;
  group: IntegrationGroup;
  blurb: string;
  /** Full-colour brand logo (theSVG) under public/brands; otherwise `glyph`. */
  icon?: string;
  /** Tint for `glyph`. */
  color: string;
  glyph?: LucideIcon;
  /** The channel type this integration adds (see GET /channel-types). */
  channelType?: string;
  /**
   * Platforms with an app marketplace: Truplexy's own app connects them with the
   * platform's sign-in. No guide, code or chat key. Only Shopify connects today
   * (POST /channels/connect); the others are shown as coming soon.
   */
  connect?: 'shopify' | 'soon';
  /** Words in a key name that mean this integration is set up, for integrations with no channel type. */
  match?: string[];
  /** Setup on the platform's side, in order. Guides only. */
  steps?: string[];
  /** Server languages with a guide, most common first. Code is in snippets/<lang>.ts. */
  langs?: Lang[];
  /** Internal tools reply as the team instead of chatting as the customer. */
  teamSide?: boolean;
  /** Customers chat in the Truplexy widget, which picks up the team's replies itself: no webhook. */
  widget?: boolean;
}

export { PUBLIC_API } from './snippets/types';

export const INTEGRATIONS: Integration[] = [
  {
    id: 'web',
    channelType: 'website',
    name: 'Website chat',
    group: 'messaging',
    blurb: 'A ready-made chat widget for any site: React, Next.js, Vue, Svelte, Angular, plain HTML and more.',
    glyph: Globe,
    color: 'var(--color-accent)',
    match: ['web', 'website', 'site', 'widget'],
    langs: ['node', 'python', 'php', 'go'],
    widget: true,
    steps: ['Add one route to your server. It holds the chat key and keeps a signed session per visitor, with no database needed.'],
  },
  {
    id: 'whatsapp',
    channelType: 'whatsapp',
    name: 'WhatsApp',
    group: 'messaging',
    blurb: 'Answer customers on your WhatsApp Business number. Sign in with Meta and pick the number.',
    icon: '/brands/whatsapp.svg',
    color: 'var(--color-ink)',
    connect: 'soon',
  },
  {
    id: 'telegram',
    channelType: 'telegram',
    name: 'Telegram',
    group: 'messaging',
    blurb: 'A Telegram bot that answers in private chats and groups.',
    icon: '/brands/telegram.svg',
    color: 'var(--color-ink)',
    match: ['telegram', 'tg'],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'Message @BotFather, run /newbot, and keep the token it gives you as a server secret.',
      'Point Telegram at your server: open https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-server.com/telegram',
    ],
  },
  {
    id: 'discord',
    channelType: 'discord',
    name: 'Discord',
    group: 'messaging',
    blurb: 'A support bot for your community server, in channels or DMs.',
    icon: '/brands/discord.svg',
    color: 'var(--color-ink)',
    match: ['discord'],
    langs: ['node', 'python', 'go', 'csharp'],
    steps: [
      'In the Discord Developer Portal, create an application, add a bot, and turn on the Message Content intent.',
      'Invite it to your server with the "Send Messages" and "Read Message History" permissions.',
      'Run the bot below on your server; it keeps a persistent connection to Discord.',
    ],
  },
  {
    id: 'messenger',
    channelType: 'messenger',
    name: 'Messenger',
    group: 'messaging',
    blurb: 'Reply to messages sent to your Facebook Page. Sign in with Meta and pick the Page.',
    icon: '/brands/messenger.svg',
    color: 'var(--color-ink)',
    connect: 'soon',
  },
  {
    id: 'instagram',
    channelType: 'instagram',
    name: 'Instagram',
    group: 'messaging',
    blurb: 'Answer Instagram Direct messages to your professional account. Sign in with Meta.',
    icon: '/brands/instagram.svg',
    color: 'var(--color-ink)',
    connect: 'soon',
  },
  {
    id: 'email',
    channelType: 'email',
    name: 'Email',
    group: 'messaging',
    blurb: 'Draft answers to support emails from an inbound mail webhook.',
    glyph: Mail,
    color: 'var(--color-ink)',
    match: ['email', 'mail', 'inbox'],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'Route your support address to an inbound email webhook (Postmark, SendGrid, Mailgun or similar).',
      'Use the thread\'s Message-ID or the sender\'s address to keep one conversation per thread.',
    ],
  },
  {
    id: 'shopify',
    channelType: 'shopify',
    name: 'Shopify',
    group: 'business',
    blurb: 'Install the Truplexy app on your store, so the assistant can check order status and search your products.',
    icon: '/brands/shopify.svg',
    color: 'var(--color-ink)',
    connect: 'shopify',
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    group: 'business',
    blurb: 'Support chat for a WooCommerce store, with order lookups.',
    icon: '/brands/woocommerce.svg',
    color: 'var(--color-ink)',
    match: ['woocommerce', 'woo'],
    langs: ['php'],
    widget: true,
    steps: [
      'Save the plugin below as wp-content/plugins/truplexy-chat/truplexy-chat.php and activate it under Plugins.',
      "Add define('TRUPLEXY_CHAT_KEY', 'tpx_…'); to wp-config.php. The key never reaches the page.",
      'Style the chat under Settings → Truplexy Chat, and add an order-lookup tool under Tools that calls the WooCommerce REST API.',
    ],
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    group: 'business',
    blurb: 'Add the assistant to any WordPress site with a small plugin.',
    icon: '/brands/wordpress.svg',
    color: 'var(--color-ink)',
    match: ['wordpress', 'wp'],
    langs: ['php'],
    widget: true,
    steps: [
      'Save the plugin below as wp-content/plugins/truplexy-chat/truplexy-chat.php and activate it under Plugins.',
      "Add define('TRUPLEXY_CHAT_KEY', 'tpx_…'); to wp-config.php. The key never reaches the page.",
      'Style the chat under Settings → Truplexy Chat: heading, greeting, colour and position.',
    ],
  },
  {
    id: 'hubspot',
    channelType: 'hubspot',
    name: 'HubSpot',
    group: 'business',
    blurb: 'Answer HubSpot conversations inbox threads automatically.',
    icon: '/brands/hubspot.svg',
    color: 'var(--color-ink)',
    connect: 'soon',
  },
  {
    id: 'zendesk',
    channelType: 'zendesk',
    name: 'Zendesk',
    group: 'business',
    blurb: 'Suggest or send first replies on new Zendesk tickets.',
    icon: '/brands/zendesk.svg',
    color: 'var(--color-ink)',
    connect: 'soon',
  },
  {
    id: 'slack',
    channelType: 'slack',
    name: 'Slack',
    group: 'internal',
    blurb: 'Get escalations in a Slack channel and reply to customers from the thread.',
    icon: '/brands/slack.svg',
    color: 'var(--color-ink)',
    teamSide: true,
    connect: 'soon',
  },
  {
    id: 'teams',
    channelType: 'teams',
    name: 'Microsoft Teams',
    group: 'internal',
    blurb: 'Route escalations to a Teams channel and answer from there.',
    icon: '/brands/microsoft-teams.svg',
    color: 'var(--color-ink)',
    teamSide: true,
    connect: 'soon',
  },
  {
    id: 'api',
    channelType: 'custom',
    name: 'REST API',
    group: 'developer',
    blurb: 'Build any channel you like on the chat API.',
    glyph: Code2,
    color: 'var(--color-ink)',
    match: ['api', 'rest', 'server', 'backend', 'custom'],
    langs: ['node', 'python', 'php', 'go', 'java', 'csharp', 'ruby'],
    steps: [
      'Issue a chat key for your server.',
      'Identify the sender with PUT /customer, then create a conversation with customer_id for each customer thread.',
      'Render the reply according to its status (see the API keys page for the table).',
    ],
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    group: 'developer',
    blurb: 'Signed events when your team replies or a ticket changes.',
    glyph: Webhook,
    color: 'var(--color-ink)',
  },
];

/** The bot's active channels of the integration's type. */
export function channelsFor(i: Integration, channels: Channel[]) {
  return i.channelType ? channels.filter((c) => c.type === i.channelType && c.active) : [];
}

/** Active chat keys for this bot that look like they belong to an integration. */
export function keysFor(i: Integration, keys: ApiKey[], botId: string) {
  const match = i.match ?? [];
  if (!match.length) return [];
  return keys.filter((k) => k.status === 'active' && k.bot_id === botId && match.some((m) => k.name.toLowerCase().includes(m)));
}

export function IntegrationIcon({ i, size = 40, className }: { i: Integration; size?: number; className?: string }) {
  const Glyph = i.glyph;
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-[12px] border border-line bg-surface', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {i.icon && !Glyph ? (
        <img src={i.icon} alt="" draggable={false} style={{ width: size * 0.56, height: size * 0.56 }} className="object-contain" />
      ) : Glyph ? (
        <Glyph style={{ width: size * 0.48, height: size * 0.48, color: i.color }} />
      ) : null}
    </span>
  );
}

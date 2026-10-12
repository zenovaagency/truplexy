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
  /** Words in a key name that mean this integration is set up, for integrations with no channel type. */
  match: string[];
  /** Setup on the platform's side, in order. */
  steps: string[];
  /** Server languages with a guide, most common first. Code is in snippets/<lang>.ts. */
  langs: Lang[];
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
    blurb: 'Answer customers on WhatsApp Business through the Meta Cloud API.',
    icon: '/brands/whatsapp.svg',
    color: 'var(--color-ink)',
    match: ['whatsapp', 'wa '],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'In Meta for Developers, create an app with the WhatsApp product and a business phone number.',
      'Set the webhook callback URL to your server\'s /whatsapp route and subscribe to "messages".',
      'Store the permanent access token and phone number ID as server secrets.',
    ],
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
    name: 'Messenger',
    group: 'messaging',
    blurb: 'Reply to messages sent to your Facebook Page.',
    icon: '/brands/messenger.svg',
    color: 'var(--color-ink)',
    match: ['messenger', 'facebook'],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'In Meta for Developers, add the Messenger product to your app and connect your Page.',
      'Set the webhook to your /messenger route and subscribe to "messages".',
      'Keep the Page access token as a server secret.',
    ],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    group: 'messaging',
    blurb: 'Answer Instagram Direct messages to your business account.',
    icon: '/brands/instagram.svg',
    color: 'var(--color-ink)',
    match: ['instagram', 'ig'],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'Connect your Instagram professional account to a Facebook Page, then add the Instagram product in Meta for Developers.',
      'Subscribe the webhook to "messages" on your /instagram route.',
    ],
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
    name: 'Shopify',
    group: 'business',
    blurb: 'A chat on your storefront that can look up orders and returns.',
    icon: '/brands/shopify.svg',
    color: 'var(--color-ink)',
    match: ['shopify'],
    langs: ['node', 'ruby', 'php', 'python'],
    steps: [
      'Add a theme app extension (app embed block) with your chat UI to the storefront.',
      'Send messages through a Shopify App Proxy, so they reach your server signed by Shopify. Never put the chat key in the theme.',
      'Implement guestSessionId / guest_session_id with a server-issued, verified session. Guests stay anonymous; only the signed logged_in_customer_id identifies a Shopify customer.',
      'Add tools for order lookup and returns under Tools, using the Admin API on your server.',
    ],
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
    name: 'HubSpot',
    group: 'business',
    blurb: 'Answer HubSpot conversations inbox threads automatically.',
    icon: '/brands/hubspot.svg',
    color: 'var(--color-ink)',
    match: ['hubspot'],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'Create a HubSpot private app with the conversations.read and conversations.write scopes.',
      'Set HUBSPOT_ACCOUNT_ID to your account ID; sender actor IDs are stored with that account prefix.',
      'Subscribe a webhook to "conversation.newMessage" pointing at your /hubspot route.',
    ],
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    group: 'business',
    blurb: 'Suggest or send first replies on new Zendesk tickets.',
    icon: '/brands/zendesk.svg',
    color: 'var(--color-ink)',
    match: ['zendesk'],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'In Zendesk Admin Center, add a webhook to your /zendesk route and a trigger on "Ticket is created".',
      'Use an API token for an agent account the assistant replies as. Include ticket_id, description and requester_id as strings in the trigger JSON body (requester_id uses {{ticket.requester.id}}).',
    ],
  },
  {
    id: 'slack',
    channelType: 'slack',
    name: 'Slack',
    group: 'internal',
    blurb: 'Get escalations in Slack and reply to customers from a thread.',
    icon: '/brands/slack.svg',
    color: 'var(--color-ink)',
    match: ['slack'],
    langs: ['node', 'python', 'java'],
    teamSide: true,
    steps: [
      'Create a Slack app with chat:write, and Event Subscriptions for message.channels.',
      'Post each escalation (webhook ticket.updated with escalated: true) to a support channel.',
      'When a teammate replies in that thread, record it with POST /conversations/{id}/replies so the customer gets it.',
    ],
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    group: 'internal',
    blurb: 'Route escalations to a Teams channel and answer from there.',
    icon: '/brands/microsoft-teams.svg',
    color: 'var(--color-ink)',
    match: ['teams', 'microsoft'],
    langs: ['csharp', 'node', 'python'],
    teamSide: true,
    steps: [
      'Register a bot in Azure Bot Service and add it to your support team in Teams.',
      'Post escalations as cards in a channel; replies in the card\'s thread go back with /replies.',
    ],
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
    match: [],
    langs: [],
    steps: [],
  },
];

/** The bot's active channels of the integration's type. */
export function channelsFor(i: Integration, channels: Channel[]) {
  return i.channelType ? channels.filter((c) => c.type === i.channelType && c.active) : [];
}

/** Active chat keys for this bot that look like they belong to an integration. */
export function keysFor(i: Integration, keys: ApiKey[], botId: string) {
  if (!i.match.length) return [];
  return keys.filter((k) => k.status === 'active' && k.bot_id === botId && i.match.some((m) => k.name.toLowerCase().includes(m)));
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

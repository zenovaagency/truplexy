import {
  siDiscord,
  siHubspot,
  siInstagram,
  siMessenger,
  siShopify,
  siTelegram,
  siWhatsapp,
  siWoocommerce,
  siWordpress,
  siZendesk,
} from 'simple-icons';
import { Code2, Globe, Mail, MessageSquare, Users, Webhook, type LucideIcon } from 'lucide-react';
import type { ApiKey } from '@/lib/api/types';
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
  /** simple-icons path; otherwise `glyph`. */
  path?: string;
  color: string;
  glyph?: LucideIcon;
  /** Words in a key name that mean this integration is set up. */
  match: string[];
  /** Setup on the platform's side, in order. */
  steps: string[];
  /** Server languages with a guide, most common first. Code is in snippets/<lang>.ts. */
  langs: Lang[];
  /** Internal tools reply as the team instead of chatting as the customer. */
  teamSide?: boolean;
}

export { PUBLIC_API } from './snippets/types';

const brand = (hex: string) => `#${hex}`;

export const INTEGRATIONS: Integration[] = [
  {
    id: 'web',
    name: 'Website chat',
    group: 'messaging',
    blurb: 'A chat bubble on your own site or app, talking to your server.',
    glyph: Globe,
    color: 'var(--color-accent)',
    match: ['web', 'website', 'site', 'widget'],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'Add a small chat UI to your site (any framework). It talks only to your own server.',
      'On your server, add the route below. It keeps one Truplexy conversation per visitor.',
      'Show `reply` in the widget. When status is `handoff_offered`, add a "Talk to a person" button that calls your /handoff route.',
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    group: 'messaging',
    blurb: 'Answer customers on WhatsApp Business through the Meta Cloud API.',
    path: siWhatsapp.path,
    color: brand(siWhatsapp.hex),
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
    name: 'Telegram',
    group: 'messaging',
    blurb: 'A Telegram bot that answers in private chats and groups.',
    path: siTelegram.path,
    color: brand(siTelegram.hex),
    match: ['telegram', 'tg'],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'Message @BotFather, run /newbot, and keep the token it gives you as a server secret.',
      'Point Telegram at your server: open https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-server.com/telegram',
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    group: 'messaging',
    blurb: 'A support bot for your community server, in channels or DMs.',
    path: siDiscord.path,
    color: brand(siDiscord.hex),
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
    path: siMessenger.path,
    color: brand(siMessenger.hex),
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
    path: siInstagram.path,
    color: brand(siInstagram.hex),
    match: ['instagram', 'ig'],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'Connect your Instagram professional account to a Facebook Page, then add the Instagram product in Meta for Developers.',
      'Subscribe the webhook to "messages" on your /instagram route.',
    ],
  },
  {
    id: 'email',
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
    path: siShopify.path,
    color: brand(siShopify.hex),
    match: ['shopify'],
    langs: ['node', 'ruby', 'php', 'python'],
    steps: [
      'Add a theme app extension (app embed block) with your chat UI to the storefront.',
      'Send messages through a Shopify App Proxy, so they reach your server signed by Shopify. Never put the chat key in the theme.',
      'Add tools for order lookup and returns under Tools, using the Admin API on your server.',
    ],
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    group: 'business',
    blurb: 'Support chat for a WooCommerce store, with order lookups.',
    path: siWoocommerce.path,
    color: brand(siWoocommerce.hex),
    match: ['woocommerce', 'woo'],
    langs: ['php'],
    steps: [
      'Install a small plugin (or a snippet in your theme\'s functions.php) that adds the chat widget and a REST route.',
      'The REST route calls your server, or Truplexy directly from PHP. The chat key stays in wp-config.php, never in the page.',
      'Add an order-lookup tool that calls the WooCommerce REST API.',
    ],
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    group: 'business',
    blurb: 'Add the assistant to any WordPress site with a small plugin.',
    path: siWordpress.path,
    color: brand(siWordpress.hex),
    match: ['wordpress', 'wp'],
    langs: ['php'],
    steps: [
      'Create a plugin folder with the file below, and define TRUPLEXY_CHAT_KEY in wp-config.php.',
      'Enqueue your chat widget script; it posts to /wp-json/truplexy/v1/chat.',
      'Activate the plugin under Plugins.',
    ],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    group: 'business',
    blurb: 'Answer HubSpot conversations inbox threads automatically.',
    path: siHubspot.path,
    color: brand(siHubspot.hex),
    match: ['hubspot'],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'Create a HubSpot private app with the conversations.read and conversations.write scopes.',
      'Subscribe a webhook to "conversation.newMessage" pointing at your /hubspot route.',
    ],
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    group: 'business',
    blurb: 'Suggest or send first replies on new Zendesk tickets.',
    path: siZendesk.path,
    color: brand(siZendesk.hex),
    match: ['zendesk'],
    langs: ['node', 'python', 'php', 'go'],
    steps: [
      'In Zendesk Admin Center, add a webhook to your /zendesk route and a trigger on "Ticket is created".',
      'Use an API token for an agent account the assistant replies as.',
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    group: 'internal',
    blurb: 'Get escalations in Slack and reply to customers from a thread.',
    glyph: MessageSquare,
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
    glyph: Users,
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
    name: 'REST API',
    group: 'developer',
    blurb: 'Build any channel you like on the chat API.',
    glyph: Code2,
    color: 'var(--color-ink)',
    match: ['api', 'rest', 'server', 'backend', 'custom'],
    langs: ['node', 'python', 'php', 'go', 'java', 'csharp', 'ruby'],
    steps: [
      'Issue a chat key for your server.',
      'Create a conversation per customer thread, then post each message to it.',
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
      {i.path && !Glyph ? (
        <svg viewBox="0 0 24 24" style={{ width: size * 0.5, height: size * 0.5, fill: i.color }}>
          <path d={i.path} />
        </svg>
      ) : Glyph ? (
        <Glyph style={{ width: size * 0.48, height: size * 0.48, color: i.color }} />
      ) : null}
    </span>
  );
}

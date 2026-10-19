/**
 * Setup guides: the content of every /docs/<id> page. Overview copy for the
 * channel pages lives in ./channel-pages.ts; this file is only how to set a
 * channel up.
 *
 * Keep to what is true today. Provider-side steps extend the dashboard's
 * Integrations guides (dashboard/src/features/integrations/catalog.tsx), the
 * code comes from that folder's snippet packs (see ./snippets.ts), and plan
 * availability is read from COMPARISON in ./pricing.ts.
 */
import { isConnect, type ChannelId } from './channels';
import { SITE } from './site';
import { COMPARISON, PLANS, type PlanId } from './pricing';

/**
 * - customer: people chat on the platform; your server relays messages.
 * - widget: a plugin on your site; no webhook needed.
 * - developer: you build against the API.
 */
export type SetupKind = 'customer' | 'widget' | 'developer';

/**
 * Channels with a guide of their own. Website chat has the longer /docs/web-sdk.
 * Platforms with an app marketplace (WhatsApp, Slack, Shopify…) have none: they
 * connect from the dashboard in one click (`connect` in ./channels.ts).
 */
export type DocId =
  | 'telegram'
  | 'email'
  | 'wordpress'
  | 'api'
  | 'webhooks';

export interface FlowNodeText {
  label: string;
  title: string;
  text: string;
}

export interface SetupGuide {
  kind: SetupKind;
  /** The guide's name in lists and breadcrumbs. */
  name: string;
  /** One line for cards and lists. */
  blurb: string;
  /** The lede under the page title. */
  summary: string;
  /** What you need before you start, besides a Truplexy account. */
  needs: string[];
  /** The pieces you will connect. */
  flow: [FlowNodeText, FlowNodeText, FlowNodeText];
  flowLabel: string;
  /** The contact type Truplexy stores for a person on this channel. */
  contactType?: string;
  /** The Truplexy channel type to add in Integrations, where one exists. */
  channelType?: string;
  /** The platform's side of the setup, in order. */
  steps: string[];
  /** Environment variables the code reads, besides TRUPLEXY_CHAT_KEY. */
  env: [name: string, what: string][];
  troubleshooting: [problem: string, fix: string][];
  /** The label of this channel's row in the pricing comparison. */
  planLabel: string;
  /** Guides to read next. */
  next: DocId[];
}

const relayFlow = (platform: string, noun: string): SetupGuide['flow'] => [
  { label: platform, title: `Your ${noun}`, text: `A customer writes on ${platform}. ${platform} calls your server.` },
  { label: 'Your server', title: 'A small handler', text: 'Holds the chat key. Keeps one Truplexy conversation per customer thread.' },
  { label: 'Truplexy', title: 'The assistant', text: 'Answers, opens tickets, hands off to your team.' },
];

const httpsServer = 'A server reachable over https, where the chat key and the code below run.';

/** Troubleshooting rows every server-side guide shares. */
export const COMMON_TROUBLESHOOTING: [string, string][] = [
  ['`CHANNEL_DISABLED`', 'The channel the key is bound to is switched off. Turn it on under Integrations → Your channels.'],
  ['`PLAN_LIMIT_REACHED`', 'This month’s AI replies or tokens are used up. Upgrade or add tokens under Settings → Plan.'],
  ['`CUSTOMER_CONFLICT`', 'The contacts you sent belong to different customers. Correct them in Customers; nothing is changed until you do.'],
  ['`reply` is `null`', 'A person has taken over the conversation (status `escalated`), or the message only carried context. Send nothing; the team’s reply arrives through the webhook.'],
  ['Customers send photos and the assistant doesn’t see them', 'The sample handler forwards text only. To have the assistant read pictures, download the photo on your server and send it as an attachment: see “Send pictures” in the chat API guide (/docs/api).'],
  ['Nothing arrives after your team replies', 'Check the webhook under Integrations → Webhook: it must be https, answer 2xx within 2.5 seconds, and verify `X-Truplexy-Signature` against the raw body.'],
];

export const GUIDES: Record<DocId, SetupGuide> = {
  telegram: {
    kind: 'customer',
    name: 'Telegram',
    blurb: 'A bot from @BotFather and a webhook route on your server.',
    summary: 'Create a Telegram bot, point its webhook at your server, and add a small handler that asks Truplexy and replies in the chat.',
    needs: ['A Telegram account to create the bot with @BotFather.', httpsServer],
    flow: relayFlow('Telegram', 'bot'),
    flowLabel: 'A customer messages your Telegram bot. Telegram calls a handler on your server, which asks Truplexy with your chat key and sends the reply back.',
    contactType: 'telegram',
    channelType: 'telegram',
    steps: [
      'Message @BotFather in Telegram and run /newbot. Keep the token it gives you as a server secret.',
      'Point Telegram at your server by opening https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-server.com/telegram in a browser, with your token and your server’s address.',
    ],
    env: [['TELEGRAM_TOKEN', 'The bot token from @BotFather.']],
    troubleshooting: [
      ['The bot never answers', 'Check that setWebhook succeeded and that its URL is the public https address of your /telegram route. Telegram only delivers to a webhook that answers.'],
      ['It answers privately but not in a group', 'The handler ignores messages without text and messages sent as a channel. Check how the bot is added to the group.'],
    ],
    planLabel: 'Telegram',
    next: ['webhooks', 'email', 'api'],
  },





  email: {
    kind: 'customer',
    name: 'Email',
    blurb: 'An inbound mail webhook and a handler that emails the reply.',
    summary: 'Route your support address to an inbound mail webhook, and add a handler that keeps one conversation per thread and emails the reply.',
    needs: ['An inbound email service that posts parsed mail to a webhook, such as Postmark, SendGrid or Mailgun.', 'A way to send email from your server.', httpsServer],
    flow: [
      { label: 'Email', title: 'Your support address', text: 'A customer emails you. An inbound mail service posts it to your server.' },
      { label: 'Your server', title: 'A small handler', text: 'Holds the chat key. Keeps one Truplexy conversation per thread.' },
      { label: 'Truplexy', title: 'The assistant', text: 'Answers, opens tickets, hands off to your team.' },
    ],
    flowLabel: 'A customer emails your support address. An inbound mail webhook posts it to your server, which asks Truplexy with your chat key and emails the reply.',
    contactType: 'email',
    channelType: 'email',
    steps: [
      'Route your support address to an inbound email webhook (Postmark, SendGrid, Mailgun or similar) that posts to your server. The sample code uses Postmark’s field names.',
      'Use the thread’s Message-ID or the sender’s address to keep one conversation per thread.',
      'Choose how replies are sent (the code calls a sendEmail function you provide) and add it to the handler.',
    ],
    env: [],
    troubleshooting: [
      ['Replies start a new conversation each time', 'Key your conversations by the thread’s Message-ID or the sender’s address, and keep that mapping in your database rather than in memory.'],
      ['The handler is called twice for one email', 'Inbound mail services retry on slow answers. Answer 200 first, then call Truplexy.'],
    ],
    planLabel: 'Email',
    next: ['webhooks', 'telegram', 'api'],
  },


  wordpress: {
    kind: 'widget',
    name: 'WordPress & WooCommerce',
    blurb: 'One plugin file for any WordPress site or WooCommerce store.',
    summary: 'Install the Truplexy Chat plugin on any WordPress site or WooCommerce store. One file is both the route and the chat widget, and the chat key stays in wp-config.php.',
    needs: ['A WordPress site where you can install plugins and edit wp-config.php.'],
    flow: [
      { label: 'Your site', title: 'The chat button', text: 'Added to every page by the plugin. No keys in the page.' },
      { label: 'Your WordPress', title: 'The plugin route', text: 'Holds the chat key from wp-config.php. Signs each visitor’s session.' },
      { label: 'Truplexy', title: 'The assistant', text: 'Answers, tickets, handoff to your team.' },
    ],
    flowLabel: 'The chat on your WordPress site talks to a route added by the plugin, which calls Truplexy with the chat key from wp-config.php.',
    channelType: 'website',
    steps: [
      'Save the plugin below as wp-content/plugins/truplexy-chat/truplexy-chat.php and activate it under Plugins.',
      'Add define(\'TRUPLEXY_CHAT_KEY\', \'tpx_…\'); to wp-config.php. The key never reaches the page.',
      'Style the chat under Settings → Truplexy Chat: heading, greeting, colour and position.',
    ],
    env: [],
    troubleshooting: [
      ['The chat button doesn’t appear', 'Check that the plugin is active and that TRUPLEXY_CHAT_KEY is defined in wp-config.php.'],
      ['The chat says it can’t connect', 'The plugin adds /wp-json/truplexy/v1/chat. Make sure the REST API isn’t blocked by a security plugin or firewall rule.'],
    ],
    planLabel: 'Website chat',
    next: ['api', 'webhooks'],
  },





  api: {
    kind: 'developer',
    name: 'REST API',
    blurb: 'Identify customers, start conversations and send messages from your server. Also the base for custom channels.',
    summary: 'Build any channel you like on the chat API: identify the customer, start a conversation and send messages from your own server.',
    needs: [httpsServer],
    flow: [
      { label: 'Your product', title: 'Any surface', text: 'An app, a kiosk, a messaging platform: anywhere your customer is.' },
      { label: 'Your server', title: 'Chat API calls', text: 'Holds the chat key. Sends the customer’s message, shows the reply.' },
      { label: 'Truplexy', title: 'The assistant', text: 'Answers, opens tickets, hands off to your team.' },
    ],
    flowLabel: 'Your product sends the customer’s message to your server, which calls the Truplexy chat API with your chat key and shows the reply.',
    contactType: 'app',
    channelType: 'custom',
    steps: [
      'Identify the sender with PUT /customer, then create a conversation with customer_id for each customer thread.',
      'Send the customer’s message to the conversation.',
      'Render the reply according to its status.',
    ],
    env: [],
    troubleshooting: COMMON_TROUBLESHOOTING,
    planLabel: 'REST API',
    next: ['webhooks', 'telegram'],
  },

  webhooks: {
    kind: 'developer',
    name: 'Webhooks',
    blurb: 'Signed events when your team replies or a ticket changes.',
    summary: 'Signed events sent to your server when your team replies to a ticket or a ticket changes, so your integration can deliver the reply or post the escalation.',
    needs: [httpsServer],
    flow: [
      { label: 'Truplexy', title: 'Your team acts', text: 'A teammate replies to a ticket or escalates it.' },
      { label: 'Signed webhook', title: 'One POST', text: 'JSON body, event and delivery headers, and an HMAC signature.' },
      { label: 'Your server', title: 'Your receiver', text: 'Verifies the signature, answers 2xx fast, then delivers or posts.' },
    ],
    flowLabel: 'When your team acts in Truplexy, a signed webhook is sent to your server, which verifies it and delivers the reply or posts the escalation.',
    steps: [
      'In the dashboard, open Integrations → Webhook and save an https URL. The first save creates the signing secret and shows it once; keep it as TRUPLEXY_WEBHOOK_SECRET.',
      'Handle the events in your receiver: verify the signature over the raw body, answer 2xx within 2.5 seconds, then do the work.',
      'Use “Send test” to deliver a ping, even while deliveries are paused.',
    ],
    env: [['TRUPLEXY_WEBHOOK_SECRET', 'The webhook’s signing secret (whsec_…).']],
    troubleshooting: [
      ['401 from your own receiver', 'Verify the HMAC over the raw request body, not the parsed JSON, and use the current secret. Rotating it replaces the old one.'],
      ['Deliveries show as failed', 'Your receiver must answer 2xx within 2.5 seconds. After no answer, a 429 or a 5xx, the event is sent once more with the same delivery ID.'],
      ['Duplicate events', 'A retry reuses `X-Truplexy-Delivery`. Deduplicate on it.'],
      ['No events for something your integration did', 'By design: notes, playground conversations and anything the integration did itself are not delivered.'],
    ],
    planLabel: 'Webhooks',
    next: ['api', 'email'],
  },
};

export const DOC_IDS = Object.keys(GUIDES) as DocId[];

/** The /docs home, grouped by where each guide is used. */
export const DOC_GROUPS: { id: string; label: string; ids: (DocId | 'web')[] }[] = [
  { id: 'website', label: 'Website & stores', ids: ['web', 'wordpress'] },
  { id: 'messaging', label: 'Messaging', ids: ['telegram', 'email'] },
  { id: 'build', label: 'Build your own', ids: ['api', 'webhooks'] },
];

/** Channels that have setup docs: everything except the one-click Connect platforms. */
export type DocChannelId = Exclude<ChannelId, 'discord' | 'whatsapp' | 'messenger' | 'instagram' | 'shopify' | 'hubspot' | 'zendesk' | 'slack' | 'teams'>;

/** Where the setup for a channel is documented. */
export function docsHref(id: DocChannelId): string {
  if (id === 'web') return '/docs/web-sdk';
  if (id === 'woocommerce') return '/docs/wordpress#woocommerce';
  if (id === 'custom') return '/docs/api#custom-channel';
  return `/docs/${id}`;
}

/** Where to set a channel up: its docs, or for a Connect platform, the dashboard's Connect button. */
export function setupHref(id: ChannelId): string {
  return isConnect(id) ? `${SITE.dashboardUrl}/integrations/guides` : docsHref(id as DocChannelId);
}

/** Where a channel links to: its overview page, or for developer tools (which aren't channels customers use), their docs. */
export function channelHref(id: ChannelId): string {
  return id === 'api' || id === 'webhooks' || id === 'custom' ? docsHref(id) : `/channels/${id}`;
}

const PLAN_NAME = Object.fromEntries(PLANS.map((p) => [p.id, p.name])) as Record<PlanId, string>;

/** "Starter and Pro" style summary of where a channel is available, from the pricing table. */
export function availability(label: string): { text: string; detail?: string } {
  const row = COMPARISON.flatMap((g) => g.rows).find((r) => r.label === label);
  if (!row) return { text: 'See pricing' };
  const ids = PLANS.map((p) => p.id).filter((p) => row.values[p]);
  const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);
  const detail = ids.map((p) => row.values[p]).find((v) => typeof v === 'string');
  if (ids.length === PLANS.length && !detail) return { text: 'Every plan' };
  if (detail) {
    const parts = ids.map((p) => `${typeof row.values[p] === 'string' ? row.values[p] : 'Included'} on ${PLAN_NAME[p]}`);
    return { text: list(ids.map((p) => PLAN_NAME[p])), detail: parts.join(', ') };
  }
  return { text: list(ids.map((p) => PLAN_NAME[p])) };
}

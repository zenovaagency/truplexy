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
import type { ChannelId } from './channels';
import { COMPARISON, PLANS, type PlanId } from './pricing';

/**
 * - customer: people chat on the platform; your server relays messages.
 * - team: your team works there; escalations go in, replies come out.
 * - widget: a plugin on your site; no webhook needed.
 * - developer: you build against the API.
 */
export type SetupKind = 'customer' | 'team' | 'widget' | 'developer';

/** Channels with a guide of their own. Website chat has the longer /docs/web-sdk. */
export type DocId =
  | 'telegram'
  | 'discord'
  | 'whatsapp'
  | 'messenger'
  | 'instagram'
  | 'email'
  | 'shopify'
  | 'wordpress'
  | 'hubspot'
  | 'zendesk'
  | 'slack'
  | 'teams'
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
    next: ['webhooks', 'discord', 'whatsapp'],
  },

  discord: {
    kind: 'customer',
    name: 'Discord',
    blurb: 'A bot application and a long-running process on your server.',
    summary: 'Create a Discord bot, invite it to your server, and run a small process that asks Truplexy and replies in channels or DMs.',
    needs: ['Access to the Discord Developer Portal and a server where you can invite bots.', 'A host that keeps a process running: the bot holds a connection open to Discord.'],
    flow: [
      { label: 'Discord', title: 'Your bot', text: 'A member writes in a channel or DM. The bot keeps a connection open to Discord.' },
      { label: 'Your server', title: 'The bot process', text: 'Holds the chat key. Keeps one Truplexy conversation per channel and member.' },
      { label: 'Truplexy', title: 'The assistant', text: 'Answers, opens tickets, hands off to your team.' },
    ],
    flowLabel: 'A member writes to your Discord bot. The bot, running on your server, asks Truplexy with your chat key and replies in Discord.',
    contactType: 'discord',
    channelType: 'discord',
    steps: [
      'In the Discord Developer Portal, create an application, add a bot, and turn on the Message Content intent.',
      'Invite the bot to your server with the “Send Messages” and “Read Message History” permissions.',
      'Run the bot from the code below on your server, as a long-lived process.',
    ],
    env: [['DISCORD_TOKEN', 'The bot token from the Developer Portal.']],
    troubleshooting: [
      ['The bot is online but ignores messages', 'The Message Content intent is off. Turn it on in the Developer Portal and restart the bot.'],
      ['The bot goes offline', 'Unlike the webhook channels, this bot keeps a connection open. Run it as a long-lived process, not a serverless function.'],
    ],
    planLabel: 'Discord',
    next: ['webhooks', 'telegram', 'slack'],
  },

  whatsapp: {
    kind: 'customer',
    name: 'WhatsApp',
    blurb: 'A Meta app with WhatsApp, a verified webhook and a handler.',
    summary: 'Connect your WhatsApp Business number through the Meta Cloud API: verify a webhook on your server and reply through the API.',
    needs: ['A Meta for Developers app with the WhatsApp product and a business phone number.', httpsServer],
    flow: relayFlow('WhatsApp', 'business number'),
    flowLabel: 'A customer messages your WhatsApp business number. Meta calls your server, which asks Truplexy with your chat key and sends the reply back through the Cloud API.',
    contactType: 'whatsapp',
    channelType: 'whatsapp',
    steps: [
      'In Meta for Developers, create an app with the WhatsApp product and a business phone number.',
      'Set the webhook callback URL to your server’s /whatsapp route and subscribe to “messages”. Meta checks it with a verification handshake, which the code below answers.',
      'Store the permanent access token, the phone number ID and your verify token as server secrets.',
    ],
    env: [
      ['WA_VERIFY_TOKEN', 'A string you choose; Meta sends it back during the webhook handshake.'],
      ['WA_TOKEN', 'The permanent access token.'],
      ['WA_PHONE_ID', 'The ID of your business phone number.'],
    ],
    troubleshooting: [
      ['Meta can’t verify the webhook', 'The verify token you typed in Meta must equal WA_VERIFY_TOKEN, and the GET /whatsapp route must be deployed and reachable over https.'],
      ['Messages arrive but no reply is sent', 'Check WA_TOKEN and WA_PHONE_ID. The handler only answers text messages.'],
    ],
    planLabel: 'WhatsApp',
    next: ['webhooks', 'messenger', 'instagram'],
  },

  messenger: {
    kind: 'customer',
    name: 'Messenger',
    blurb: 'Your Facebook Page, a Meta webhook and a handler.',
    summary: 'Connect your Facebook Page: subscribe a Meta webhook to its messages and reply through the Send API from your server.',
    needs: ['A Facebook Page and a Meta for Developers app.', httpsServer],
    flow: relayFlow('Messenger', 'Facebook Page'),
    flowLabel: 'A customer messages your Facebook Page. Meta calls your server, which asks Truplexy with your chat key and sends the reply back.',
    contactType: 'messenger',
    steps: [
      'In Meta for Developers, add the Messenger product to your app and connect your Page.',
      'Set the webhook to your /messenger route and subscribe to “messages”.',
      'Keep the Page access token as a server secret.',
    ],
    env: [['FB_PAGE_TOKEN', 'The Page access token.']],
    troubleshooting: [
      ['No messages reach your server', 'Check that the webhook is subscribed to “messages” for your Page and that the /messenger route is public over https.'],
      ['Replies fail to send', 'Check FB_PAGE_TOKEN: it must be the access token for the Page that received the message.'],
    ],
    planLabel: 'Facebook Messenger',
    next: ['webhooks', 'instagram', 'whatsapp'],
  },

  instagram: {
    kind: 'customer',
    name: 'Instagram',
    blurb: 'A professional account, a Meta webhook and a handler.',
    summary: 'Connect your Instagram professional account: subscribe a Meta webhook to Direct messages and reply from your server.',
    needs: ['An Instagram professional account connected to a Facebook Page, and a Meta for Developers app.', httpsServer],
    flow: relayFlow('Instagram', 'business account'),
    flowLabel: 'A customer sends your Instagram account a Direct message. Meta calls your server, which asks Truplexy with your chat key and sends the reply back.',
    contactType: 'instagram',
    steps: [
      'Connect your Instagram professional account to a Facebook Page, then add the Instagram product in Meta for Developers.',
      'Subscribe the webhook to “messages” on your /instagram route.',
    ],
    env: [['IG_PAGE_TOKEN', 'The access token for the Page connected to the account.']],
    troubleshooting: [
      ['No messages reach your server', 'The account must be a professional account connected to a Facebook Page, and the webhook subscribed to “messages” on your public /instagram route.'],
      ['The assistant answers itself', 'The handler skips echoes of your own messages (`is_echo`). Keep that check if you change the code.'],
    ],
    planLabel: 'Instagram',
    next: ['webhooks', 'messenger', 'whatsapp'],
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
    next: ['webhooks', 'hubspot', 'zendesk'],
  },

  shopify: {
    kind: 'customer',
    name: 'Shopify',
    blurb: 'A theme app extension, an App Proxy and order-lookup tools.',
    summary: 'Add a chat to your Shopify storefront with a theme app extension, route it through an App Proxy to your server, and add order-lookup tools.',
    needs: ['A Shopify app for your store, with a theme app extension and an App Proxy.', httpsServer],
    flow: [
      { label: 'Shopify', title: 'Your storefront', text: 'A shopper chats in your theme. Shopify’s App Proxy signs and forwards the message.' },
      { label: 'Your server', title: 'The proxy handler', text: 'Verifies Shopify’s signature. Holds the chat key and the Admin API token.' },
      { label: 'Truplexy', title: 'The assistant', text: 'Answers, calls your order tools, hands off to your team.' },
    ],
    flowLabel: 'A shopper chats on your storefront. Shopify’s App Proxy forwards the signed message to your server, which asks Truplexy with your chat key.',
    contactType: 'shopify',
    steps: [
      'Add a theme app extension (an app embed block) with your chat UI to the storefront.',
      'Send messages through a Shopify App Proxy, so they reach your server signed by Shopify. Never put the chat key in the theme.',
      'Implement guestSessionId / guest_session_id with a server-issued, verified session. Guests stay anonymous; only the signed logged_in_customer_id identifies a Shopify customer.',
      'Add tools for order lookup and returns under Tools in the dashboard, calling the Shopify Admin API from your server.',
    ],
    env: [['SHOPIFY_SECRET', 'Your app’s secret, used to verify the App Proxy signature.']],
    troubleshooting: [
      ['Requests are rejected as unsigned', 'Verify the App Proxy signature with your app secret on every request, and only trust `logged_in_customer_id` after it passes.'],
      ['Every shopper looks like the same person', 'Issue a verified guest session per visitor; do not reuse one identifier for guests.'],
    ],
    planLabel: 'Shopify',
    next: ['webhooks', 'wordpress', 'api'],
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
    next: ['shopify', 'api', 'webhooks'],
  },

  hubspot: {
    kind: 'customer',
    name: 'HubSpot',
    blurb: 'A private app, a conversations webhook and a handler.',
    summary: 'Answer threads in your HubSpot conversations inbox: a private app with the conversations scopes, a webhook on new messages, and a handler on your server.',
    needs: ['A HubSpot account where you can create private apps and webhooks.', httpsServer],
    flow: relayFlow('HubSpot', 'conversations inbox'),
    flowLabel: 'A new message arrives in your HubSpot conversations inbox. HubSpot calls your server, which asks Truplexy with your chat key and posts the reply to the thread.',
    contactType: 'hubspot',
    steps: [
      'Create a HubSpot private app with the conversations.read and conversations.write scopes.',
      'Set HUBSPOT_ACCOUNT_ID to your account ID; sender actor IDs are stored with that account prefix.',
      'Subscribe a webhook to “conversation.newMessage” pointing at your /hubspot route.',
    ],
    env: [
      ['HUBSPOT_TOKEN', 'The private app’s access token.'],
      ['HUBSPOT_ACCOUNT_ID', 'Your HubSpot account ID.'],
      ['HS_ACTOR', 'The actor the replies are posted as.'],
    ],
    troubleshooting: [
      ['Webhook events arrive but nothing is posted', 'Check that the private app has both conversations.read and conversations.write, and that HUBSPOT_TOKEN belongs to it.'],
      ['Customers are duplicated', 'Set HUBSPOT_ACCOUNT_ID: actor IDs are stored with the account prefix so they stay unique.'],
    ],
    planLabel: 'HubSpot',
    next: ['webhooks', 'zendesk', 'email'],
  },

  zendesk: {
    kind: 'customer',
    name: 'Zendesk',
    blurb: 'A trigger, a webhook and an agent account to reply as.',
    summary: 'Answer new Zendesk tickets: a trigger calls your server, which asks Truplexy and posts the reply as a comment from an agent account.',
    needs: ['Zendesk admin access, and an agent account the assistant replies as.', httpsServer],
    flow: relayFlow('Zendesk', 'ticket queue'),
    flowLabel: 'A new Zendesk ticket triggers a webhook to your server, which asks Truplexy with your chat key and posts the reply as a comment on the ticket.',
    contactType: 'zendesk',
    steps: [
      'In Zendesk Admin Center, add a webhook to your /zendesk route and a trigger on “Ticket is created”.',
      'Use an API token for an agent account the assistant replies as.',
      'Include ticket_id, description and requester_id as strings in the trigger’s JSON body (requester_id uses {{ticket.requester.id}}).',
    ],
    env: [
      ['ZENDESK_SUBDOMAIN', 'Your Zendesk subdomain.'],
      ['ZENDESK_EMAIL', 'The agent account the assistant replies as.'],
      ['ZENDESK_TOKEN', 'An API token for that account.'],
    ],
    troubleshooting: [
      ['The trigger fires but nothing is posted', 'Make sure ticket_id, description and requester_id are strings in the trigger body, and that the API token belongs to an agent account.'],
      ['Replies are posted as the wrong person', 'The assistant replies as the account in ZENDESK_EMAIL. Use a dedicated agent for it.'],
    ],
    planLabel: 'Zendesk',
    next: ['webhooks', 'hubspot', 'email'],
  },

  slack: {
    kind: 'team',
    name: 'Slack',
    blurb: 'A Slack app and a bridge that posts escalations and returns replies.',
    summary: 'Post escalated conversations to a Slack channel and send your team’s thread replies back to the customer: a Slack app, the Truplexy webhook and a small bridge.',
    needs: ['A Slack workspace where you can create apps.', httpsServer, 'The Truplexy webhook, set up from the webhooks guide.'],
    flow: [
      { label: 'Truplexy', title: 'An escalation', text: 'A conversation needs a person. Truplexy signs a webhook to your server.' },
      { label: 'Your server', title: 'A small bridge', text: 'Verifies the webhook, posts to Slack and maps each thread to its conversation.' },
      { label: 'Slack', title: 'Your support channel', text: 'A teammate replies in the thread; the bridge sends it back to Truplexy.' },
    ],
    flowLabel: 'Truplexy sends an escalation webhook to your server, which posts it to Slack. A teammate’s reply in the thread goes back to Truplexy and on to the customer.',
    steps: [
      'Create a Slack app with chat:write, and Event Subscriptions for message.channels.',
      'Post each escalation (the ticket.updated webhook with escalated: true) to a support channel.',
      'When a teammate replies in that thread, record it with POST /conversations/{id}/replies so the customer gets it.',
    ],
    env: [
      ['SLACK_BOT_TOKEN', 'The Slack app’s bot token.'],
      ['SLACK_SIGNING_SECRET', 'The Slack app’s signing secret.'],
    ],
    troubleshooting: [
      ['Escalations never appear in Slack', 'Check that the webhook under Integrations → Webhook points at your server and that your receiver handles `ticket.updated` with `escalated: true`.'],
      ['Thread replies aren’t delivered', 'The app needs Event Subscriptions for message.channels, and the bridge must map the Slack thread back to its conversation ID.'],
    ],
    planLabel: 'Slack',
    next: ['webhooks', 'teams', 'api'],
  },

  teams: {
    kind: 'team',
    name: 'Microsoft Teams',
    blurb: 'An Azure bot and a bridge that posts escalation cards.',
    summary: 'Post escalated conversations as cards in a Microsoft Teams channel and send thread replies back to the customer: an Azure bot, the Truplexy webhook and a small bridge.',
    needs: ['An Azure subscription for Azure Bot Service, and a team you can add the bot to.', httpsServer, 'The Truplexy webhook, set up from the webhooks guide.'],
    flow: [
      { label: 'Truplexy', title: 'An escalation', text: 'A conversation needs a person. Truplexy signs a webhook to your server.' },
      { label: 'Your server', title: 'A bot', text: 'Verifies the webhook, posts a card and maps each thread to its conversation.' },
      { label: 'Teams', title: 'Your support channel', text: 'A teammate replies in the thread; the bot sends it back to Truplexy.' },
    ],
    flowLabel: 'Truplexy sends an escalation webhook to your server, which posts a card to Teams. A teammate’s reply in the thread goes back to Truplexy and on to the customer.',
    steps: [
      'Register a bot in Azure Bot Service and add it to your support team in Teams.',
      'Post escalations as cards in a channel; replies in the card’s thread go back with POST /conversations/{id}/replies.',
    ],
    env: [],
    troubleshooting: [
      ['Escalations never appear in Teams', 'Check that the webhook under Integrations → Webhook points at your server and that your receiver handles `ticket.updated` with `escalated: true`.'],
      ['Thread replies aren’t delivered', 'The bot must be added to the team, and must map the Teams thread back to its conversation ID before calling /replies.'],
    ],
    planLabel: 'Microsoft Teams',
    next: ['webhooks', 'slack', 'api'],
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
    next: ['webhooks', 'slack'],
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
    next: ['api', 'slack', 'teams'],
  },
};

export const DOC_IDS = Object.keys(GUIDES) as DocId[];

/** The /docs home, grouped by where each guide is used. */
export const DOC_GROUPS: { id: string; label: string; ids: (DocId | 'web')[] }[] = [
  { id: 'website', label: 'Website & stores', ids: ['web', 'wordpress', 'shopify'] },
  { id: 'messaging', label: 'Messaging apps', ids: ['whatsapp', 'messenger', 'instagram', 'telegram', 'discord', 'email'] },
  { id: 'helpdesk', label: 'Help desks & CRM', ids: ['hubspot', 'zendesk'] },
  { id: 'team', label: 'Team tools', ids: ['slack', 'teams'] },
  { id: 'build', label: 'Build your own', ids: ['api', 'webhooks'] },
];

/** Where the setup for a channel is documented. */
export function docsHref(id: ChannelId): string {
  if (id === 'web') return '/docs/web-sdk';
  if (id === 'woocommerce') return '/docs/wordpress#woocommerce';
  if (id === 'custom') return '/docs/api#custom-channel';
  return `/docs/${id}`;
}

/** Where a channel links to: its overview page, or for developer tools (which aren't channels customers use), their docs. */
export function channelHref(id: ChannelId): string {
  return id === 'api' || id === 'webhooks' || id === 'custom' ? docsHref(id) : `/channels/${id}`;
}

const PLAN_NAME = Object.fromEntries(PLANS.map((p) => [p.id, p.name])) as Record<PlanId, string>;

/** "Free, Starter and Pro" style summary of where a channel is available, from the pricing table. */
export function availability(label: string): { text: string; detail?: string } {
  const row = COMPARISON.flatMap((g) => g.rows).find((r) => r.label === label);
  if (!row) return { text: 'See pricing' };
  const ids = (['free', 'starter', 'pro'] as PlanId[]).filter((p) => row.values[p]);
  const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);
  const detail = ids.map((p) => row.values[p]).find((v) => typeof v === 'string');
  if (ids.length === 3 && !detail) return { text: 'Every plan' };
  if (detail) {
    const parts = ids.map((p) => `${typeof row.values[p] === 'string' ? row.values[p] : 'Included'} on ${PLAN_NAME[p]}`);
    return { text: list(ids.map((p) => PLAN_NAME[p])), detail: parts.join(', ') };
  }
  return { text: list(ids.map((p) => PLAN_NAME[p])) };
}

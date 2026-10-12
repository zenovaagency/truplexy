/**
 * Page content for every channel: its overview page (/channels/<id>) and its
 * setup guide (/docs/<id>). Which channels exist, and whether they are live,
 * comes from the registry in ./channels.ts; this file only adds the words.
 *
 * Keep to what is true today. Provider-side steps extend the dashboard's
 * Integrations guides (dashboard/src/features/integrations/catalog.tsx), the
 * code comes from that folder's snippet packs (see ./snippets.ts), and plan
 * availability is read from COMPARISON in ./pricing.ts, so none of it is
 * restated by hand.
 */
import type { ChannelId } from './channels';
import { COMPARISON, PLANS, type PlanId } from './pricing';

/**
 * - customer: people chat on the platform; your server relays messages.
 * - team: your team works there; escalations go in, replies come out.
 * - widget: a plugin or widget on your site; no webhook needed.
 * - developer: you build against the API.
 */
export type GuideKind = 'customer' | 'team' | 'widget' | 'developer';

export interface FlowNodeText {
  label: string;
  title: string;
  text: string;
}

export interface Guide {
  kind: GuideKind;
  /** One line for cards and lists. */
  blurb: string;
  /** The lede under the page title, shared by the overview and the guide. */
  summary: string;
  /** What Truplexy does on this channel. */
  capabilities: string[];
  flow: [FlowNodeText, FlowNodeText, FlowNodeText];
  flowLabel: string;
  /** The contact type Truplexy stores for a person on this channel. */
  contactType?: string;
  /** The Truplexy channel type to add in Integrations, where one exists. */
  channelType?: string;
  /** The platform's side of the setup, in order. */
  steps: string[];
  /** Environment variables the code samples read, besides TRUPLEXY_CHAT_KEY. */
  env: [name: string, what: string][];
  troubleshooting: [problem: string, fix: string][];
  faq: [question: string, answer: string][];
  /** The label of this channel's row in the pricing comparison. */
  planLabel: string;
  related: ChannelId[];
}

const customerFlow = (platform: string, noun: string): Guide['flow'] => [
  { label: platform, title: `Your ${noun}`, text: `A customer writes on ${platform}. ${platform} calls your server.` },
  { label: 'Your server', title: 'A small handler', text: 'Holds the chat key. Keeps one Truplexy conversation per customer thread.' },
  { label: 'Truplexy', title: 'The assistant', text: 'Answers, opens tickets, hands off to your team.' },
];

/** Troubleshooting rows every server-side guide shares. */
export const COMMON_TROUBLESHOOTING: [string, string][] = [
  ['`CHANNEL_DISABLED`', 'The channel the key is bound to is switched off. Turn it on under Integrations → Your channels.'],
  ['`PLAN_LIMIT_REACHED`', 'This month’s AI replies or tokens are used up. Upgrade or add tokens under Settings → Plan.'],
  ['`CUSTOMER_CONFLICT`', 'The contacts you sent belong to different customers. Correct them in Customers; nothing is changed until you do.'],
  ['`reply` is `null`', 'A person has taken over the conversation (status `escalated`), or the message only carried context. Send nothing; the team’s reply arrives through the webhook.'],
  ['Nothing arrives after your team replies', 'Check the webhook under Integrations → Webhook: it must be https, answer 2xx within 2.5 seconds, and verify `X-Truplexy-Signature` against the raw body.'],
];

const handoffFaq: [string, string] = [
  'Can a person take over?',
  'Yes. Ask for a person and the conversation appears under Tickets → Handoffs. Take it over and reply from the ticket; Truplexy sends your reply back to the customer through your webhook.',
];

const memoryFaq: [string, string] = [
  'Does the customer have to start over on another channel?',
  'No. People are matched by their contacts (an email address, a phone number, an ID), so a customer who writes from two channels is one customer with one history.',
];

export const GUIDES: Record<ChannelId, Guide> = {
  web: {
    kind: 'widget',
    blurb: 'A ready-made chat widget for any site: React, Next.js, Vue, Svelte, Angular, plain HTML and more.',
    summary:
      'A chat widget on your website, with one small route on your server. It works with React, Next.js, Vue, Nuxt, Svelte, Angular, Astro, WordPress and plain HTML, and your chat key never reaches the browser.',
    capabilities: [
      'A floating or inline chat widget, themed with CSS variables and translatable through labels.',
      'Visitors keep their conversation when they reload or come back, through a signed session, with no accounts or database.',
      'Handoff to your team: when someone replies from Tickets, the reply appears in the widget live.',
      'Optional name and email form, or trusted identity from your own signed-in users.',
      'A JavaScript API and events, or your own UI on the same client.',
    ],
    flow: [
      { label: 'Your site', title: 'The widget', text: 'Chat button, messages, handoff. No keys.' },
      { label: 'Your server', title: 'One route', text: 'Holds the chat key. Signs each visitor’s session.' },
      { label: 'Truplexy', title: 'The assistant', text: 'Answers, tickets, handoff to your team.' },
    ],
    flowLabel: 'The widget on your site talks to a route on your server, which calls Truplexy with your chat key. Team replies come back to the widget live.',
    contactType: 'email',
    channelType: 'website',
    steps: [],
    env: [],
    troubleshooting: [],
    faq: [
      ['Does it work with my framework?', 'The guide has install recipes for Next.js, Nuxt, SvelteKit, Remix, Astro, Express, Hono and Cloudflare Workers on the server, and plain HTML, React, Vue, Svelte, Angular, Astro and Solid on the page. For Python, PHP or Go the route is one POST endpoint.'],
      ['Is the chat key safe?', 'The key lives only on your server. The browser sees your route and its own signed session.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'Website chat',
    related: ['wordpress', 'woocommerce', 'shopify'],
  },

  telegram: {
    kind: 'customer',
    blurb: 'A Telegram bot that answers in private chats and groups.',
    summary: 'A Telegram bot that answers your customers in private chats and groups, with the same memory and handoff as every other channel.',
    capabilities: [
      'Answers customers in private chats and groups.',
      'Recognises each person by their Telegram ID, so their history follows them.',
      'Hands the conversation to your team on request, and sends the team’s replies back in the chat.',
      'Opens a ticket with the customer and channel attached.',
    ],
    flow: customerFlow('Telegram', 'bot'),
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
    faq: [
      ['Which plan do I need?', 'Telegram is on every plan; the Free plan includes one active channel connection.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'Telegram',
    related: ['discord', 'whatsapp', 'messenger'],
  },

  discord: {
    kind: 'customer',
    blurb: 'A support bot for your community server, in channels or DMs.',
    summary: 'A support bot for your community server that answers in channels or direct messages, with the conversation kept in Truplexy.',
    capabilities: [
      'Answers in server channels and in direct messages.',
      'Recognises each member by their Discord ID.',
      'Hands over to your team, whose replies are posted back by the bot.',
      'Shows a typing indicator while the assistant works.',
    ],
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
      'Run the bot from the code below on your server. It keeps a persistent connection to Discord, so it needs a host that stays running.',
    ],
    env: [['DISCORD_TOKEN', 'The bot token from the Developer Portal.']],
    troubleshooting: [
      ['The bot is online but ignores messages', 'The Message Content intent is off. Turn it on in the Developer Portal and restart the bot.'],
      ['The bot goes offline', 'Unlike the webhook channels, this bot keeps a connection open. Run it as a long-lived process, not a serverless function.'],
    ],
    faq: [
      ['Which plan do I need?', 'Discord is on every plan; the Free plan includes one active channel connection.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'Discord',
    related: ['telegram', 'slack', 'whatsapp'],
  },

  whatsapp: {
    kind: 'customer',
    blurb: 'Answer customers on WhatsApp Business through the Meta Cloud API.',
    summary: 'Answer customers on WhatsApp Business through the Meta Cloud API, with their history shared across your other channels.',
    capabilities: [
      'Answers text messages sent to your WhatsApp business number.',
      'Recognises each customer by their phone number, so one person on WhatsApp and email is one customer.',
      'Hands over to your team, and sends the team’s replies back on WhatsApp.',
      'Opens a ticket with the customer and channel attached.',
    ],
    flow: customerFlow('WhatsApp', 'business number'),
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
    faq: [
      ['Which plan do I need?', 'WhatsApp is on Starter and Pro.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'WhatsApp',
    related: ['messenger', 'instagram', 'telegram'],
  },

  messenger: {
    kind: 'customer',
    blurb: 'Reply to messages sent to your Facebook Page.',
    summary: 'Reply to messages sent to your Facebook Page, with the conversation shared across your other channels.',
    capabilities: [
      'Answers messages sent to your Facebook Page.',
      'Recognises each person by their Messenger ID.',
      'Hands over to your team, and sends the team’s replies back in Messenger.',
      'Opens a ticket with the customer and channel attached.',
    ],
    flow: customerFlow('Messenger', 'Facebook Page'),
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
    faq: [
      ['Which plan do I need?', 'Messenger is on Starter and Pro.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'Facebook Messenger',
    related: ['instagram', 'whatsapp', 'telegram'],
  },

  instagram: {
    kind: 'customer',
    blurb: 'Answer Instagram Direct messages to your business account.',
    summary: 'Answer Instagram Direct messages sent to your business account, with the conversation shared across your other channels.',
    capabilities: [
      'Answers Direct messages sent to your Instagram professional account.',
      'Recognises each person by their Instagram ID.',
      'Hands over to your team, and sends the team’s replies back in Direct.',
      'Opens a ticket with the customer and channel attached.',
    ],
    flow: customerFlow('Instagram', 'business account'),
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
    faq: [
      ['Which plan do I need?', 'Instagram is on Starter and Pro.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'Instagram',
    related: ['messenger', 'whatsapp', 'telegram'],
  },

  email: {
    kind: 'customer',
    blurb: 'Draft answers to support emails from an inbound mail webhook.',
    summary: 'Answer support emails from an inbound mail webhook, one conversation per sender, shared with your other channels.',
    capabilities: [
      'Answers emails forwarded by an inbound mail service.',
      'Recognises each sender by their email address, so a customer who also chats on your site is one customer.',
      'Keeps one conversation per thread, using the thread’s Message-ID or the sender’s address.',
      'Hands over to your team, and sends the team’s replies by email.',
    ],
    flow: [
      { label: 'Email', title: 'Your support address', text: 'A customer emails you. An inbound mail service posts it to your server.' },
      { label: 'Your server', title: 'A small handler', text: 'Holds the chat key. Keeps one Truplexy conversation per thread.' },
      { label: 'Truplexy', title: 'The assistant', text: 'Answers, opens tickets, hands off to your team.' },
    ],
    flowLabel: 'A customer emails your support address. An inbound mail webhook posts it to your server, which asks Truplexy with your chat key and emails the reply.',
    contactType: 'email',
    channelType: 'email',
    steps: [
      'Route your support address to an inbound email webhook (Postmark, SendGrid, Mailgun or similar) that posts to your server.',
      'Use the thread’s Message-ID or the sender’s address to keep one conversation per thread.',
      'Choose how replies are sent (the code calls a sendEmail function you provide) and add it to the handler.',
    ],
    env: [],
    troubleshooting: [
      ['Replies start a new conversation each time', 'Key your conversations by the thread’s Message-ID or the sender’s address, and keep that mapping in your database rather than in memory.'],
      ['The handler is called twice for one email', 'Inbound mail services retry on slow answers. Answer 200 first, then call Truplexy.'],
    ],
    faq: [
      ['Which plan do I need?', 'Email is on Starter and Pro.'],
      ['Which inbound mail services work?', 'Any that posts parsed email to a webhook, such as Postmark, SendGrid or Mailgun. The sample code uses Postmark’s field names.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'Email',
    related: ['hubspot', 'zendesk', 'whatsapp'],
  },

  shopify: {
    kind: 'customer',
    blurb: 'A chat on your storefront that can look up orders and returns.',
    summary: 'A chat on your Shopify storefront that can look up orders and returns, with guests kept anonymous and signed-in customers identified.',
    capabilities: [
      'A chat on your storefront through a theme app extension.',
      'Messages reach your server through a Shopify App Proxy, signed by Shopify.',
      'Guests stay anonymous; only the signed `logged_in_customer_id` identifies a Shopify customer.',
      'Order lookup and returns through tools that call the Admin API from your server.',
    ],
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
      'Add tools for order lookup and returns under Tools, using the Admin API on your server.',
    ],
    env: [['SHOPIFY_SECRET', 'Your app’s secret, used to verify the App Proxy signature.']],
    troubleshooting: [
      ['Requests are rejected as unsigned', 'Verify the App Proxy signature with your app secret on every request, and only trust `logged_in_customer_id` after it passes.'],
      ['Every shopper looks like the same person', 'Issue a verified guest session per visitor; do not reuse one identifier for guests.'],
    ],
    faq: [
      ['Which plan do I need?', 'Shopify is on Starter and Pro.'],
      ['Can it look up orders?', 'Yes, through tools you add under Tools that call the Shopify Admin API from your server.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'Shopify',
    related: ['woocommerce', 'web', 'wordpress'],
  },

  woocommerce: {
    kind: 'widget',
    blurb: 'Support chat for a WooCommerce store, with order lookups.',
    summary: 'Support chat for a WooCommerce store from the Truplexy Chat plugin, with order lookups through a tool that calls the WooCommerce REST API.',
    capabilities: [
      'The plugin is the route and the widget: it adds the chat button to every page of your store.',
      'The chat key stays in wp-config.php and never reaches the page.',
      'Style the chat under Settings → Truplexy Chat: heading, greeting, colour and position.',
      'Order lookups through a tool under Tools that calls the WooCommerce REST API.',
    ],
    flow: [
      { label: 'Your store', title: 'The chat button', text: 'Added to every page by the plugin. No keys in the page.' },
      { label: 'Your WordPress', title: 'The plugin route', text: 'Holds the chat key from wp-config.php. Signs each visitor’s session.' },
      { label: 'Truplexy', title: 'The assistant', text: 'Answers, looks up orders, hands off to your team.' },
    ],
    flowLabel: 'The chat on your WooCommerce store talks to a route added by the plugin, which calls Truplexy with the chat key from wp-config.php.',
    contactType: 'email',
    steps: [
      'Save the plugin below as wp-content/plugins/truplexy-chat/truplexy-chat.php and activate it under Plugins.',
      'Add define(\'TRUPLEXY_CHAT_KEY\', \'tpx_…\'); to wp-config.php. The key never reaches the page.',
      'Style the chat under Settings → Truplexy Chat, and add an order-lookup tool under Tools that calls the WooCommerce REST API.',
    ],
    env: [['TRUPLEXY_CHAT_KEY', 'Defined in wp-config.php; the plugin reads it.']],
    troubleshooting: [
      ['The chat button doesn’t appear', 'Check that the plugin is active and that TRUPLEXY_CHAT_KEY is defined in wp-config.php.'],
      ['The chat says it can’t connect', 'The plugin adds /wp-json/truplexy/v1/chat. Make sure the REST API isn’t blocked by a security plugin or firewall rule.'],
    ],
    faq: [
      ['Which plan do I need?', 'WooCommerce is on Starter and Pro.'],
      ['Is it the same plugin as the WordPress one?', 'Yes. The Truplexy Chat plugin works on any WordPress site and on WooCommerce stores; the order-lookup tool is what you add for a store.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'WooCommerce',
    related: ['wordpress', 'shopify', 'web'],
  },

  wordpress: {
    kind: 'widget',
    blurb: 'Add the assistant to any WordPress site with a small plugin.',
    summary: 'Add the Truplexy assistant to any WordPress site with a small plugin that is both the route and the chat widget.',
    capabilities: [
      'One plugin file adds the route and the chat button to every page.',
      'The chat key stays in wp-config.php and never reaches the page.',
      'Style the chat under Settings → Truplexy Chat: heading, greeting, colour and position.',
      'Works for WooCommerce stores too.',
    ],
    flow: [
      { label: 'Your site', title: 'The chat button', text: 'Added to every page by the plugin. No keys in the page.' },
      { label: 'Your WordPress', title: 'The plugin route', text: 'Holds the chat key from wp-config.php. Signs each visitor’s session.' },
      { label: 'Truplexy', title: 'The assistant', text: 'Answers, tickets, handoff to your team.' },
    ],
    flowLabel: 'The chat on your WordPress site talks to a route added by the plugin, which calls Truplexy with the chat key from wp-config.php.',
    contactType: 'email',
    channelType: 'website',
    steps: [
      'Save the plugin below as wp-content/plugins/truplexy-chat/truplexy-chat.php and activate it under Plugins.',
      'Add define(\'TRUPLEXY_CHAT_KEY\', \'tpx_…\'); to wp-config.php. The key never reaches the page.',
      'Style the chat under Settings → Truplexy Chat: heading, greeting, colour and position.',
    ],
    env: [['TRUPLEXY_CHAT_KEY', 'Defined in wp-config.php; the plugin reads it.']],
    troubleshooting: [
      ['The chat button doesn’t appear', 'Check that the plugin is active and that TRUPLEXY_CHAT_KEY is defined in wp-config.php.'],
      ['The chat says it can’t connect', 'The plugin adds /wp-json/truplexy/v1/chat. Make sure the REST API isn’t blocked by a security plugin or firewall rule.'],
    ],
    faq: [
      ['Which plan do I need?', 'The plugin is the website chat, which is on every plan.'],
      ['Can I customise the chat?', 'Yes, under Settings → Truplexy Chat, and with the widget’s attributes and CSS variables described in the Website chat guide.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'Website chat',
    related: ['woocommerce', 'web', 'shopify'],
  },

  hubspot: {
    kind: 'customer',
    blurb: 'Answer HubSpot conversations inbox threads automatically.',
    summary: 'Answer threads in the HubSpot conversations inbox automatically, with the customer matched to the rest of their history.',
    capabilities: [
      'Answers new messages in your HubSpot conversations inbox.',
      'Recognises senders by their HubSpot actor ID, or by email when there is one.',
      'Hands over to your team, whose replies reach the thread.',
      'Opens a ticket with the customer and channel attached.',
    ],
    flow: customerFlow('HubSpot', 'conversations inbox'),
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
    faq: [
      ['Which plan do I need?', 'HubSpot is on Pro.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'HubSpot',
    related: ['zendesk', 'email', 'slack'],
  },

  zendesk: {
    kind: 'customer',
    blurb: 'Suggest or send first replies on new Zendesk tickets.',
    summary: 'Suggest or send first replies on new Zendesk tickets, answered as an agent account you choose.',
    capabilities: [
      'Answers new tickets from a Zendesk trigger.',
      'Recognises requesters by their Zendesk ID within your subdomain.',
      'Posts the reply as a public comment, from an agent account.',
      'Hands over to your team when the assistant can’t help.',
    ],
    flow: customerFlow('Zendesk', 'ticket queue'),
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
    faq: [
      ['Which plan do I need?', 'Zendesk is on Pro.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'Zendesk',
    related: ['hubspot', 'email', 'slack'],
  },

  slack: {
    kind: 'team',
    blurb: 'Get escalations in Slack and reply to customers from a thread.',
    summary: 'Get escalated conversations in a Slack channel and answer customers from the thread. Slack is where your team works, not where customers write.',
    capabilities: [
      'Posts each escalation to a support channel.',
      'A teammate’s reply in the thread is recorded as a staff reply and delivered to the customer on the channel they came from.',
      'Replies are deduplicated by their external ID, so retries are safe.',
    ],
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
    faq: [
      ['Which plan do I need?', 'Slack is on Pro.'],
      ['Do customers need Slack?', 'No. Customers stay on their own channel; Slack is only where your team sees escalations and answers them.'],
    ],
    planLabel: 'Slack',
    related: ['teams', 'zendesk', 'webhooks'],
  },

  teams: {
    kind: 'team',
    blurb: 'Route escalations to a Teams channel and answer from there.',
    summary: 'Route escalated conversations to a Microsoft Teams channel and answer customers from the thread. Teams is where your team works, not where customers write.',
    capabilities: [
      'Posts each escalation as a card in a support channel.',
      'A reply in the card’s thread is recorded as a staff reply and delivered to the customer on the channel they came from.',
      'Replies are deduplicated by their external ID, so retries are safe.',
    ],
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
    faq: [
      ['Which plan do I need?', 'Microsoft Teams is on Pro.'],
      ['Do customers need Teams?', 'No. Customers stay on their own channel; Teams is only where your team sees escalations and answers them.'],
    ],
    planLabel: 'Microsoft Teams',
    related: ['slack', 'zendesk', 'webhooks'],
  },

  api: {
    kind: 'developer',
    blurb: 'Build any channel you like on the chat API.',
    summary: 'Build any channel you like on the chat API: identify the customer, start a conversation and send messages from your own server.',
    capabilities: [
      'Identify customers by contacts with `PUT /customer`, then start a conversation for each thread.',
      'Send a message and render the reply according to its status.',
      'Hand off or escalate to your team, open and close tickets, and record staff replies.',
      'A typed server client for Node, plus helpers for Python, PHP, Go, Java, C# and Ruby.',
    ],
    flow: [
      { label: 'Your product', title: 'Any surface', text: 'An app, a kiosk, a messaging platform: anywhere your customer is.' },
      { label: 'Your server', title: 'Chat API calls', text: 'Holds the chat key. Sends the customer’s message, shows the reply.' },
      { label: 'Truplexy', title: 'The assistant', text: 'Answers, opens tickets, hands off to your team.' },
    ],
    flowLabel: 'Your product sends the customer’s message to your server, which calls the Truplexy chat API with your chat key and shows the reply.',
    contactType: 'app',
    channelType: 'custom',
    steps: [
      'Issue a chat key for your server.',
      'Identify the sender with PUT /customer, then create a conversation with customer_id for each customer thread.',
      'Render the reply according to its status.',
    ],
    env: [],
    troubleshooting: COMMON_TROUBLESHOOTING.slice(0, 4),
    faq: [
      ['Can I call the API from a browser or app?', 'No. The chat key must stay on your server. Your front end talks to your server, and your server talks to Truplexy.'],
      ['Which plan do I need?', 'The REST API is limited on Starter and full on Pro.'],
      memoryFaq,
    ],
    planLabel: 'REST API',
    related: ['webhooks', 'custom', 'web'],
  },

  custom: {
    kind: 'developer',
    blurb: 'Connect any other platform or product, built on the REST API.',
    summary: 'Connect a platform or product we don’t have a ready-made channel for. Custom integrations are built on the REST API and the webhook.',
    capabilities: [
      'Use any chat surface as a channel: you relay messages in, and replies out.',
      'Pick your own contact type (an app user ID, a phone number, an email) so customers match across channels.',
      'Deliver your team’s replies through a signed webhook.',
      'Same ticketing, handoff and memory as the built-in channels.',
    ],
    flow: [
      { label: 'Your platform', title: 'Any messages', text: 'A messaging app, a game, an in-product chat: whatever your customers use.' },
      { label: 'Your server', title: 'A bridge', text: 'Holds the chat key. Maps each thread to a Truplexy conversation.' },
      { label: 'Truplexy', title: 'The assistant', text: 'Answers, opens tickets, hands off to your team.' },
    ],
    flowLabel: 'Messages from your platform go to a bridge on your server, which calls the Truplexy chat API with your chat key and relays replies back, including your team’s through a webhook.',
    contactType: 'app',
    channelType: 'custom',
    steps: [
      'Issue a chat key for your server, and add a Custom channel so tickets show where they came from.',
      'Identify the sender with PUT /customer, then create a conversation with customer_id for each thread on your platform.',
      'Send the customer’s message, render the reply, and deliver your team’s replies from the webhook.',
    ],
    env: [['TRUPLEXY_WEBHOOK_SECRET', 'The webhook’s signing secret (whsec_…).']],
    troubleshooting: COMMON_TROUBLESHOOTING,
    faq: [
      ['Which plan do I need?', 'Custom API integrations are on Pro.'],
      ['How is this different from the REST API?', 'The REST API is the toolkit. A custom integration is what you build with it, and appears as its own channel in your dashboard.'],
      handoffFaq,
      memoryFaq,
    ],
    planLabel: 'Custom API integrations',
    related: ['api', 'webhooks', 'web'],
  },

  webhooks: {
    kind: 'developer',
    blurb: 'Signed events when your team replies or a ticket changes.',
    summary: 'Signed events sent to your server when your team replies to a ticket or a ticket changes, so your integration can act on what your team did.',
    capabilities: [
      '`message.created`: a person replied to a ticket of a chat API conversation.',
      '`ticket.updated`: such a ticket was opened, or its status or escalation changed.',
      'Each delivery is signed with HMAC-SHA256 and carries a delivery ID for deduplication.',
      'One webhook per bot, with a signing secret you can rotate and a test button that sends a ping.',
    ],
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
    faq: [
      ['Which plan do I need?', 'Webhooks are on Pro.'],
      ['Can I have several webhooks?', 'Each bot has one webhook.'],
    ],
    planLabel: 'Webhooks',
    related: ['api', 'custom', 'slack'],
  },
};

/** Where the setup guide for a channel lives. Website chat has its own, longer guide. */
export const docsHref = (id: ChannelId) => (id === 'web' ? '/docs/web-sdk' : `/docs/${id}`);

/** Channels that get a /docs/<id> page from the dynamic route. */
export const DOC_CHANNEL_IDS = (Object.keys(GUIDES) as ChannelId[]).filter((id) => id !== 'web');

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

/** One row per plan for a channel, from the pricing comparison: "Included", "Not included", or its own wording. */
export function planRows(label: string): [plan: string, value: string][] {
  const row = COMPARISON.flatMap((g) => g.rows).find((r) => r.label === label);
  if (!row) return [];
  return PLANS.map((p) => {
    const v = row.values[p.id];
    return [p.name, v === true ? 'Included' : v === false ? 'Not included' : v];
  });
}

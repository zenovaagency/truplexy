/**
 * Overview content for the channel pages (/channels/<id>): what Truplexy does
 * on a channel, how a conversation runs, and a sample conversation. No setup
 * detail and no code here; that is ./setup-guides.ts and the /docs pages.
 *
 * Which channels exist, and whether they are live, comes from ./channels.ts.
 * Developer tools (REST API, webhooks, custom integrations) aren't channels
 * customers use, so they have docs but no overview page.
 *
 * Sample conversations use the fictional store and cast of ./demo.ts.
 */
import type { ChannelId } from './channels';
import type { FlowNodeText } from './setup-guides';

export type OverviewId = Exclude<ChannelId, 'api' | 'webhooks' | 'custom'>;

export interface DemoLine {
  /** customer / ai / agent are chat bubbles; event is a status line between them. */
  from: 'customer' | 'ai' | 'agent' | 'event';
  text: string;
  author?: string;
}

export interface ChannelPage {
  /** One line for cards and lists. */
  blurb: string;
  /** The lede under the page title. */
  summary: string;
  /** What Truplexy does on this channel, in plain words. */
  capabilities: string[];
  /** How a conversation runs, from the customer's side. */
  journey: [FlowNodeText, FlowNodeText, FlowNodeText];
  journeyLabel: string;
  demo: {
    /** Shown in the frame's header, e.g. "Loom & Lane · WhatsApp". */
    context: string;
    lines: DemoLine[];
  };
  /** How Truplexy recognises a person here. */
  recognisedBy: string;
  /** Where your team answers from. */
  teamRepliesFrom: string;
  /** What setting it up involves, in one line. */
  setup: string;
  /** Questions specific to this channel. */
  faq: [question: string, answer: string][];
  /** The label of this channel's row in the pricing comparison. */
  planLabel: string;
  related: OverviewId[];
}

const STORE = 'Loom & Lane';
const fromTickets = 'Tickets in the Truplexy dashboard. The reply goes out on this channel.';

/** The usual three steps of a conversation on a channel customers write on. */
const journey = (name: string, team = 'Your team takes over from Tickets with the whole conversation in front of them. Their reply goes back on ' + name + '.'): ChannelPage['journey'] => [
  { label: 'Customer', title: `Writes on ${name}`, text: `Your customer uses ${name} as they always do. Nothing to install, no new account.` },
  { label: 'Truplexy', title: 'Answers right away', text: 'From your knowledge base and tools, day or night, and remembers the customer for next time.' },
  { label: 'Your team', title: 'Steps in when needed', text: team },
];

export const PAGES: Record<OverviewId, ChannelPage> = {
  web: {
    blurb: 'A chat widget for any website, in every popular framework.',
    summary: 'A chat on your website that answers visitors right away, keeps their conversation when they come back, and brings in your team when a person should help.',
    capabilities: [
      'A chat button or an inline chat that matches your brand’s colours and wording.',
      'Visitors keep their conversation when they reload the page or come back another day.',
      'Your team’s replies appear in the chat live, so a handoff feels like one conversation.',
      'Ask for a name and email when you want them, or recognise your own signed-in customers.',
    ],
    journey: journey('your website', 'Your team takes over from Tickets with the whole conversation in front of them. Their reply appears in the chat live.'),
    journeyLabel: 'A visitor asks a question in the chat on your website, Truplexy answers right away, and your team steps in from Tickets when a person should help.',
    demo: {
      context: `${STORE} · Website chat`,
      lines: [
        { from: 'customer', text: 'I was charged twice for September.' },
        { from: 'ai', text: 'Sorry about that — I can see both charges. I’m bringing in billing to review the refund.' },
        { from: 'event', text: 'Handed to Priya · Billing, with the full history' },
        { from: 'agent', author: 'Priya · Billing', text: 'Hi Daniel — I can see the duplicate charge. I’ve started your refund; it’ll be back on your card in 3–5 business days.' },
      ],
    },
    recognisedBy: 'A signed session per visitor, plus an email address when they share one or you sign them in.',
    teamRepliesFrom: 'Tickets in the Truplexy dashboard. Replies show up in the chat live.',
    setup: 'Add the widget to your pages and one small route on your server.',
    faq: [
      ['Does it work with my website builder or framework?', 'Yes. There are recipes for React, Next.js, Vue, Nuxt, Svelte, Angular, Astro, plain HTML and more, and a plugin for WordPress.'],
      ['Can it look like the rest of my site?', 'Yes. Colours, fonts, position, heading and greeting are all yours to set.'],
    ],
    planLabel: 'Website chat',
    related: ['wordpress', 'shopify', 'telegram'],
  },

  telegram: {
    blurb: 'A Telegram bot that answers in private chats and groups.',
    summary: 'A Telegram bot that answers your customers in private chats and groups, with the same memory and handoff as every other channel.',
    capabilities: [
      'Answers customers in private chats and in groups.',
      'Recognises each person, so a customer who wrote last week doesn’t start over.',
      'Hands the conversation to your team when a person should help, and delivers their reply in the same chat.',
      'Every conversation that needs follow-up becomes a ticket, with the customer attached.',
    ],
    journey: journey('Telegram'),
    journeyLabel: 'A customer messages your Telegram bot, Truplexy answers right away, and your team steps in from Tickets when needed.',
    demo: {
      context: `${STORE} bot · Telegram`,
      lines: [
        { from: 'customer', text: 'Can I swap my shirt for a Large?' },
        { from: 'ai', text: 'Yes. I’ve set up the exchange — the courier brings the Large on Friday and collects the Medium.' },
        { from: 'customer', text: 'Perfect, thanks.' },
      ],
    },
    recognisedBy: 'Their Telegram account.',
    teamRepliesFrom: fromTickets,
    setup: 'Create a bot with @BotFather and add a small handler on your server.',
    faq: [['Does it work in groups?', 'Yes. Add the bot to a group and it answers text messages there, as well as in private chats.']],
    planLabel: 'Telegram',
    related: ['discord', 'whatsapp', 'web'],
  },

  discord: {
    blurb: 'A support bot for your community server, in channels or DMs.',
    summary: 'A support bot for your Discord community that answers in server channels or direct messages, so members get help without waiting for a moderator.',
    capabilities: [
      'Answers in the server channels you choose and in direct messages.',
      'Recognises each member, with their history from other channels too.',
      'Shows that it’s typing while it works on an answer.',
      'Hands over to your team, whose reply the bot posts back in Discord.',
    ],
    journey: journey('Discord'),
    journeyLabel: 'A member writes to your Discord bot, Truplexy answers right away, and your team steps in from Tickets when needed.',
    demo: {
      context: `#help · ${STORE} community`,
      lines: [
        { from: 'customer', text: 'What was the black one you showed me earlier?' },
        { from: 'event', text: 'Remembered from the website chat this morning' },
        { from: 'ai', text: 'The one we looked at earlier was the Atlas Jacket in Black. Want me to send you the product link again?' },
      ],
    },
    recognisedBy: 'Their Discord account.',
    teamRepliesFrom: fromTickets,
    setup: 'Create a bot in the Discord Developer Portal and run it on your server.',
    faq: [['Will it answer every message in my server?', 'It answers in the channels it can read and in direct messages. Choose its channels with Discord’s own permissions.']],
    planLabel: 'Discord',
    related: ['telegram', 'slack', 'web'],
  },

  whatsapp: {
    blurb: 'Answer customers on your WhatsApp Business number.',
    summary: 'Answer customers on your WhatsApp Business number, at any hour, with their history shared across every other channel they use.',
    capabilities: [
      'Answers messages to your WhatsApp business number within seconds, day or night.',
      'Recognises customers by phone number, so someone who also emails you is one customer with one history.',
      'Passes questions it shouldn’t answer, like bulk pricing, to your team with everything said so far.',
      'Your team’s reply arrives in the same WhatsApp chat.',
    ],
    journey: journey('WhatsApp'),
    journeyLabel: 'A customer messages your WhatsApp number, Truplexy answers right away, and your team steps in from Tickets when needed.',
    demo: {
      context: `${STORE} · WhatsApp`,
      lines: [
        { from: 'customer', text: 'Do you deliver to Chattogram? And is there a discount on 20 jackets?' },
        { from: 'ai', text: 'Yes — Chattogram takes 2–3 days. Bulk pricing is our team’s call, so I’ve passed it on for 9 AM.' },
        { from: 'event', text: 'Next morning · picked up by Arif · Sales' },
        { from: 'agent', author: 'Arif · Sales', text: 'Morning Imran! For 20 jackets we can do 15% off, delivered to Chattogram by Thursday. Shall I send the invoice?' },
      ],
    },
    recognisedBy: 'Their phone number.',
    teamRepliesFrom: fromTickets,
    setup: 'Connect your number through a Meta app and add a small handler on your server.',
    faq: [['Do I need the WhatsApp Business app?', 'You need a business phone number on the WhatsApp Business Platform (the Cloud API), set up through Meta for Developers.']],
    planLabel: 'WhatsApp',
    related: ['messenger', 'instagram', 'email'],
  },

  messenger: {
    blurb: 'Reply to messages sent to your Facebook Page.',
    summary: 'Reply to messages sent to your Facebook Page right away, with the conversation shared across your other channels.',
    capabilities: [
      'Answers messages to your Facebook Page as they arrive.',
      'Recognises each person, so their history follows them.',
      'Hands over to your team, whose reply arrives in Messenger.',
      'Every conversation that needs follow-up becomes a ticket.',
    ],
    journey: journey('Messenger'),
    journeyLabel: 'A customer messages your Facebook Page, Truplexy answers right away, and your team steps in from Tickets when needed.',
    demo: {
      context: `${STORE} · Messenger`,
      lines: [
        { from: 'customer', text: 'Hi from Berlin — do you ship to Germany?' },
        { from: 'ai', text: 'We do. International orders arrive in 7–10 business days, tracked all the way.' },
        { from: 'customer', text: 'Great, ordering now.' },
      ],
    },
    recognisedBy: 'Their Messenger account.',
    teamRepliesFrom: fromTickets,
    setup: 'Connect your Page through a Meta app and add a small handler on your server.',
    faq: [],
    planLabel: 'Facebook Messenger',
    related: ['instagram', 'whatsapp', 'web'],
  },

  instagram: {
    blurb: 'Answer Instagram Direct messages to your business account.',
    summary: 'Answer Instagram Direct messages to your business account, so questions from your posts and stories never wait.',
    capabilities: [
      'Answers Direct messages to your Instagram professional account.',
      'Recognises each person, with their history from your other channels.',
      'Hands over to your team, whose reply arrives in Direct.',
      'Every conversation that needs follow-up becomes a ticket.',
    ],
    journey: journey('Instagram'),
    journeyLabel: 'A customer sends your Instagram account a Direct message, Truplexy answers right away, and your team steps in from Tickets when needed.',
    demo: {
      context: `@loomandlane · Instagram Direct`,
      lines: [
        { from: 'customer', text: 'Is the Atlas Jacket back in Medium?' },
        { from: 'ai', text: 'It is — Medium came back in this morning, in Black and Olive. Want me to hold one for you?' },
        { from: 'customer', text: 'Black, please!' },
        { from: 'ai', text: 'Done. A Black Medium is on hold for you until tomorrow evening.' },
      ],
    },
    recognisedBy: 'Their Instagram account.',
    teamRepliesFrom: fromTickets,
    setup: 'Connect your professional account through a Meta app and add a small handler on your server.',
    faq: [['Does it work with a personal Instagram account?', 'No. Instagram only offers messaging to professional accounts connected to a Facebook Page.']],
    planLabel: 'Instagram',
    related: ['messenger', 'whatsapp', 'web'],
  },

  email: {
    blurb: 'Answer support emails, one conversation per thread.',
    summary: 'Answer support emails as they arrive, one conversation per thread, with the sender matched to everything else they’ve told you.',
    capabilities: [
      'Answers emails to your support address within minutes.',
      'Keeps each email thread as one conversation, however long it gets.',
      'Recognises the sender by email address, so a customer who also chats on your site is one customer.',
      'Hands over to your team, whose reply goes out by email.',
    ],
    journey: journey('email', 'Your team takes over from Tickets with the whole thread in front of them. Their reply goes out by email.'),
    journeyLabel: 'A customer emails your support address, Truplexy answers right away, and your team steps in from Tickets when needed.',
    demo: {
      context: `support@loomandlane.example · Email`,
      lines: [
        { from: 'customer', text: 'Subject: Order #4821\n\nHi, can I still change the delivery address on my order?' },
        { from: 'ai', text: 'Hi Sarah — yes, #4821 hasn’t been dispatched yet. Reply with the new address and I’ll update it.' },
        { from: 'customer', text: 'Gulshan 2, please.' },
        { from: 'ai', text: 'Done — #4821 will now be delivered to Gulshan 2.' },
      ],
    },
    recognisedBy: 'Their email address.',
    teamRepliesFrom: 'Tickets in the Truplexy dashboard. The reply goes out by email.',
    setup: 'Route your support address to an inbound mail service and add a small handler on your server.',
    faq: [['Which email providers work?', 'Any inbound mail service that posts emails to a webhook, such as Postmark, SendGrid or Mailgun.']],
    planLabel: 'Email',
    related: ['web', 'hubspot', 'zendesk'],
  },

  shopify: {
    blurb: 'A chat on your storefront that can look up orders and returns.',
    summary: 'A chat on your Shopify storefront that answers shoppers, looks up their orders and starts returns, and brings in your team when a person should help.',
    capabilities: [
      'A chat on every page of your storefront, styled to match your theme.',
      'Looks up orders, delivery status and returns for signed-in customers.',
      'Keeps guests anonymous, and recognises customers who are signed in to your store.',
      'Hands over to your team with the order and the conversation attached.',
    ],
    journey: journey('your Shopify store', 'Your team takes over from Tickets with the order and conversation in front of them. Their reply appears in the chat.'),
    journeyLabel: 'A shopper asks a question in the chat on your Shopify store, Truplexy answers and looks up their order, and your team steps in from Tickets when needed.',
    demo: {
      context: `${STORE} storefront · Shopify`,
      lines: [
        { from: 'customer', text: 'Where is my order?' },
        { from: 'event', text: 'Looked up order #4821' },
        { from: 'ai', text: 'Order #4821 left the warehouse this morning and should reach you on Thursday. Want the tracking link?' },
        { from: 'customer', text: 'Yes please.' },
      ],
    },
    recognisedBy: 'Their Shopify customer account when signed in; guests stay anonymous.',
    teamRepliesFrom: 'Tickets in the Truplexy dashboard. The reply appears in the storefront chat.',
    setup: 'A Shopify app with a theme extension, plus order tools on your server.',
    faq: [['Can it look up orders?', 'Yes, for signed-in customers, through order and returns tools you connect to your store.']],
    planLabel: 'Shopify',
    related: ['woocommerce', 'web', 'instagram'],
  },

  woocommerce: {
    blurb: 'Support chat for a WooCommerce store, with order lookups.',
    summary: 'Support chat for your WooCommerce store that answers shoppers and looks up their orders, added with one WordPress plugin.',
    capabilities: [
      'A chat button on every page of your store, from one plugin.',
      'Looks up orders for your customers.',
      'Choose the heading, greeting, colour and position from your WordPress settings.',
      'Hands over to your team with the conversation attached.',
    ],
    journey: journey('your store', 'Your team takes over from Tickets with the whole conversation in front of them. Their reply appears in the chat.'),
    journeyLabel: 'A shopper asks a question in the chat on your WooCommerce store, Truplexy answers and looks up their order, and your team steps in from Tickets when needed.',
    demo: {
      context: `${STORE} store · WooCommerce`,
      lines: [
        { from: 'customer', text: 'Has my order shipped yet? It’s #4821.' },
        { from: 'event', text: 'Looked up order #4821' },
        { from: 'ai', text: 'Not yet — #4821 is packed and leaves the warehouse today. You’ll get the tracking link by email.' },
      ],
    },
    recognisedBy: 'An email address, when the shopper shares one.',
    teamRepliesFrom: 'Tickets in the Truplexy dashboard. Replies show up in the chat live.',
    setup: 'Install the Truplexy Chat plugin and add an order-lookup tool.',
    faq: [['Is it the same plugin as for WordPress?', 'Yes. The Truplexy Chat plugin works on any WordPress site; for a store you also connect order lookups.']],
    planLabel: 'WooCommerce',
    related: ['wordpress', 'shopify', 'web'],
  },

  wordpress: {
    blurb: 'Add the assistant to any WordPress site with a small plugin.',
    summary: 'Add the Truplexy chat to any WordPress site with one plugin: no theme edits, and your settings live in WordPress.',
    capabilities: [
      'One plugin adds the chat button to every page.',
      'Choose the heading, greeting, colour and position from your WordPress settings.',
      'Visitors keep their conversation when they come back.',
      'Your team’s replies appear in the chat live.',
    ],
    journey: journey('your WordPress site', 'Your team takes over from Tickets with the whole conversation in front of them. Their reply appears in the chat live.'),
    journeyLabel: 'A visitor asks a question in the chat on your WordPress site, Truplexy answers right away, and your team steps in from Tickets when needed.',
    demo: {
      context: `${STORE} blog · WordPress`,
      lines: [
        { from: 'customer', text: 'How do I wash the linen shirts?' },
        { from: 'ai', text: 'Cold, gentle cycle, and hang to dry. Linen softens with every wash, so skip the fabric softener.' },
      ],
    },
    recognisedBy: 'A session per visitor, plus an email address when they share one.',
    teamRepliesFrom: 'Tickets in the Truplexy dashboard. Replies show up in the chat live.',
    setup: 'Install the Truplexy Chat plugin and add your chat key to wp-config.php.',
    faq: [['Do I need to edit my theme?', 'No. The plugin adds the chat to every page by itself.']],
    planLabel: 'Website chat',
    related: ['woocommerce', 'web', 'shopify'],
  },

  hubspot: {
    blurb: 'Answer HubSpot conversations inbox threads automatically.',
    summary: 'Answer threads in your HubSpot conversations inbox automatically, with each customer matched to the rest of their history.',
    capabilities: [
      'Answers new messages in your HubSpot conversations inbox.',
      'Matches the sender to their history on your other channels.',
      'Leaves the thread to your team when a person should help.',
      'Every conversation that needs follow-up becomes a ticket.',
    ],
    journey: journey('HubSpot', 'Your team takes over from Tickets with the whole conversation in front of them. Their reply reaches the HubSpot thread.'),
    journeyLabel: 'A new message arrives in your HubSpot inbox, Truplexy answers right away, and your team steps in from Tickets when needed.',
    demo: {
      context: `HubSpot inbox · ${STORE}`,
      lines: [
        { from: 'customer', text: 'Can I move my renewal date to the 15th?' },
        { from: 'ai', text: 'Yes. Your renewal moves to the 15th from next month, and nothing changes on this cycle. Want a reminder a few days before?' },
      ],
    },
    recognisedBy: 'Their HubSpot contact, or their email address.',
    teamRepliesFrom: 'Tickets in the Truplexy dashboard. The reply reaches the HubSpot thread.',
    setup: 'A HubSpot private app and a small handler on your server.',
    faq: [],
    planLabel: 'HubSpot',
    related: ['zendesk', 'email', 'slack'],
  },

  zendesk: {
    blurb: 'Send first replies on new Zendesk tickets.',
    summary: 'Send a first reply on every new Zendesk ticket within seconds, from an agent account you choose, so customers aren’t left waiting in the queue.',
    capabilities: [
      'Answers each new ticket with a public reply within seconds.',
      'Replies as an agent account you choose.',
      'Recognises the requester and their history on your other channels.',
      'Leaves the ticket to your team when a person should help.',
    ],
    journey: [
      { label: 'Customer', title: 'Opens a ticket', text: 'By email, form or widget, as they do today in Zendesk.' },
      { label: 'Truplexy', title: 'Replies first', text: 'Posts a public reply from your knowledge base within seconds.' },
      { label: 'Your team', title: 'Takes it from there', text: 'Picks up anything the assistant couldn’t solve from Tickets; the reply is posted on the Zendesk ticket.' },
    ],
    journeyLabel: 'A customer opens a Zendesk ticket, Truplexy posts the first reply within seconds, and your team takes it from there when needed.',
    demo: {
      context: `Ticket #3107 · Zendesk`,
      lines: [
        { from: 'customer', text: 'My discount code SPRING10 isn’t working at checkout.' },
        { from: 'ai', author: 'Loom & Lane Support', text: 'Thanks for writing in! SPRING10 ended on Sunday, but WELCOME5 still gives you 5% off. If you’d like, our team can look at matching the spring discount.' },
        { from: 'customer', text: 'Yes please, I started the order last week.' },
        { from: 'event', text: 'Assigned to Priya · Billing' },
      ],
    },
    recognisedBy: 'Their Zendesk requester.',
    teamRepliesFrom: 'Tickets in the Truplexy dashboard. The reply is posted on the Zendesk ticket.',
    setup: 'A Zendesk trigger and webhook, and a small handler on your server.',
    faq: [['Will customers know it’s an assistant?', 'The reply is posted by the agent account you choose, so name and sign it the way you want.']],
    planLabel: 'Zendesk',
    related: ['hubspot', 'email', 'slack'],
  },

  slack: {
    blurb: 'Get escalations in Slack and reply to customers from a thread.',
    summary: 'Get escalated conversations in a Slack channel and answer customers from the thread. Slack is where your team works; customers stay on their own channel.',
    capabilities: [
      'Posts each escalation to your support channel, so the right teammate can pick it up.',
      'A teammate replies in the thread, and the customer gets it on the channel they wrote from.',
      'Every reply is recorded on the ticket, so nothing is lost outside Slack.',
    ],
    journey: [
      { label: 'Customer', title: 'Needs a person', text: 'On WhatsApp, your website or any channel, the assistant hands the conversation over.' },
      { label: 'Slack', title: 'Your team sees it', text: 'The escalation appears in your support channel.' },
      { label: 'Customer', title: 'Gets the reply', text: 'A teammate answers in the thread; the customer receives it where they wrote.' },
    ],
    journeyLabel: 'When a conversation needs a person it is posted to your Slack support channel, and a teammate’s thread reply goes back to the customer on their own channel.',
    demo: {
      context: '#support · Slack',
      lines: [
        { from: 'ai', author: 'Truplexy', text: 'Escalated from WhatsApp · Imran Kabir\nBulk discount on 20 jackets, delivered to Chattogram' },
        { from: 'agent', author: 'Arif · Sales', text: 'For 20 jackets we can do 15% off, delivered by Thursday. Shall I send the invoice?' },
        { from: 'event', text: 'Delivered to Imran on WhatsApp' },
      ],
    },
    recognisedBy: 'Customers aren’t on Slack. Your teammates are, and their replies are recorded under their names.',
    teamRepliesFrom: 'A Slack thread. Replies are recorded on the ticket too.',
    setup: 'A Slack app and a small bridge on your server.',
    faq: [['Do customers need Slack?', 'No. Customers stay on their own channel; Slack is only where your team sees escalations and answers them.']],
    planLabel: 'Slack',
    related: ['teams', 'zendesk', 'whatsapp'],
  },

  teams: {
    blurb: 'Route escalations to a Teams channel and answer from there.',
    summary: 'Route escalated conversations to a Microsoft Teams channel and answer customers from the thread. Teams is where your team works; customers stay on their own channel.',
    capabilities: [
      'Posts each escalation as a card in your support channel.',
      'A teammate replies in the card’s thread, and the customer gets it on the channel they wrote from.',
      'Every reply is recorded on the ticket, so nothing is lost outside Teams.',
    ],
    journey: [
      { label: 'Customer', title: 'Needs a person', text: 'On your website, Telegram or any channel, the assistant hands the conversation over.' },
      { label: 'Teams', title: 'Your team sees it', text: 'A card for the escalation appears in your support channel.' },
      { label: 'Customer', title: 'Gets the reply', text: 'A teammate answers in the thread; the customer receives it where they wrote.' },
    ],
    journeyLabel: 'When a conversation needs a person it is posted as a card to your Teams channel, and a teammate’s thread reply goes back to the customer on their own channel.',
    demo: {
      context: 'Support › Escalations · Microsoft Teams',
      lines: [
        { from: 'ai', author: 'Truplexy', text: 'Escalated from Website chat · Daniel Park\nCharged twice for September' },
        { from: 'agent', author: 'Priya · Billing', text: 'Hi Daniel — I can see the duplicate charge. I’ve started your refund.' },
        { from: 'event', text: 'Delivered to Daniel in the website chat' },
      ],
    },
    recognisedBy: 'Customers aren’t on Teams. Your teammates are, and their replies are recorded under their names.',
    teamRepliesFrom: 'A Teams thread. Replies are recorded on the ticket too.',
    setup: 'An Azure bot and a small bridge on your server.',
    faq: [['Do customers need Teams?', 'No. Customers stay on their own channel; Teams is only where your team sees escalations and answers them.']],
    planLabel: 'Microsoft Teams',
    related: ['slack', 'zendesk', 'web'],
  },
};

export const OVERVIEW_IDS = Object.keys(PAGES) as OverviewId[];


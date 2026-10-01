import { isLive, type ChannelId } from './channels';

/**
 * Every sample conversation on the page, from one fictional cast, so the
 * stories link up across sections: Sarah's address change in the hero is her
 * row in the inbox, Daniel's billing issue in the timeline is the handoff
 * example, Nabila's jacket in the journey is her inbox thread.
 *
 * All people, orders and businesses here are fictional. Mock UIs that render
 * this data label it as sample data.
 */

export type Speaker = 'customer' | 'ai' | 'agent';

export interface Msg {
  from: Speaker;
  channel: ChannelId;
  text: string;
  time?: string;
  /** Display name for human agents. */
  author?: string;
}

/* ------------------------------------------------------------------ *
 * Hero — one order, two channels, twenty minutes apart.
 * ------------------------------------------------------------------ */
export const HERO = {
  customer: 'Sarah Ahmed',
  first: {
    channel: 'web' as const,
    label: 'Website chat',
    messages: [
      { from: 'customer', channel: 'web', time: '1:02 PM', text: "Hey, I'm trying to change my delivery address." },
      { from: 'ai', channel: 'web', time: '1:02 PM', text: 'Sure. I can help with that. Has the order already been dispatched?' },
      { from: 'customer', channel: 'web', time: '1:03 PM', text: 'Not yet.' },
      { from: 'ai', channel: 'web', time: '1:03 PM', text: "Good — order #4821 is still at the warehouse, so there's time. What's the new address?" },
    ] satisfies Msg[],
  },
  gap: '20 minutes later',
  second: {
    channel: 'telegram' as const,
    label: 'Telegram',
    messages: [
      { from: 'customer', channel: 'telegram', time: '1:23 PM', text: "I'm back. The new address is Gulshan 2." },
      { from: 'ai', channel: 'telegram', time: '1:23 PM', text: "Got it — we're continuing with the same order. I've updated the delivery address for #4821 to Gulshan 2." },
    ] satisfies Msg[],
  },
  memory: ['Order #4821', 'Address change', 'Not dispatched'],
};

/* ------------------------------------------------------------------ *
 * Journey — Website → Discord → Telegram → a person.
 * ------------------------------------------------------------------ */
export interface JourneyStep {
  time: string;
  channel: ChannelId | 'human';
  label: string;
  messages: Msg[];
  /** Context the panel lights up when this step is in view. */
  learns: { key: string; value: string }[];
}

export const JOURNEY: JourneyStep[] = [
  {
    time: '10:14 AM',
    channel: 'web',
    label: 'Website',
    messages: [
      { from: 'customer', channel: 'web', text: 'Do you have this jacket in black?' },
      { from: 'ai', channel: 'web', text: 'We do — the Atlas Jacket comes in Black, sizes S to XL. Want me to help you pick a size?' },
    ],
    learns: [
      { key: 'Customer', value: 'Nabila Islam' },
      { key: 'Product', value: 'Atlas Jacket · Black' },
    ],
  },
  {
    time: '2:36 PM',
    channel: 'discord',
    label: 'Discord',
    messages: [
      { from: 'customer', channel: 'discord', text: 'What was the black one you showed me earlier?' },
      { from: 'ai', channel: 'discord', text: 'The one we looked at earlier was the Atlas Jacket in Black. Want me to send you the product link again?' },
    ],
    learns: [
      { key: 'Identity', value: 'Linked: Website + Discord' },
      { key: 'Intent', value: 'Purchase' },
    ],
  },
  {
    time: '5:02 PM',
    channel: 'telegram',
    label: 'Telegram',
    messages: [
      { from: 'customer', channel: 'telegram', text: 'Yes. Also, does Medium fit true to size?' },
      { from: 'ai', channel: 'telegram', text: "Here's the Atlas Jacket in Black. Medium fits true to size — if you like layering underneath, most people go one size up." },
    ],
    learns: [
      { key: 'Identity', value: 'Linked: 3 channels' },
      { key: 'Preference', value: 'Size Medium' },
    ],
  },
  {
    time: '5:09 PM',
    channel: 'human',
    label: 'Human support',
    messages: [
      { from: 'customer', channel: 'telegram', text: 'Could the sleeves be shortened a little?' },
      { from: 'ai', channel: 'telegram', text: "That's one for our tailoring team. I've passed them everything we've discussed, so you won't need to repeat it." },
      { from: 'agent', channel: 'telegram', author: 'Maya · Tailoring', text: 'Hi Nabila! Atlas Jacket in Black, size Medium — got it. How much shorter would you like the sleeves?' },
    ],
    learns: [
      { key: 'Handoff', value: 'Maya · Tailoring, full thread attached' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Continuous support — one day, team online and offline.
 * ------------------------------------------------------------------ */
export interface TimelineEvent {
  time: string;
  /** Position on the 24h rail, in hours from midnight. */
  hour: number;
  state: 'ai' | 'team' | 'handoff' | 'offline';
  title: string;
  body: string;
  packet?: { label: string; value: string }[];
}

export const BUSINESS_HOURS = { start: 9, end: 18 } as const;

export const DAY: TimelineEvent[] = [
  {
    time: '9:42 AM',
    hour: 9.7,
    state: 'ai',
    title: 'AI handling conversation',
    body: 'A customer asks whether the Atlas Jacket is back in Medium. Truplexy checks and answers in one reply. Resolved without anyone on the team stopping what they’re doing.',
  },
  {
    time: '1:18 PM',
    hour: 13.3,
    state: 'team',
    title: 'Support team online',
    body: 'Daniel reports a duplicate charge on his September invoice. Truplexy recognises a billing dispute that needs a person’s judgement.',
  },
  {
    time: '1:19 PM',
    hour: 13.32,
    state: 'handoff',
    title: 'Human handoff',
    body: 'Priya on billing picks it up. Everything she needs arrives with the conversation:',
    packet: [
      { label: 'Customer', value: 'Daniel Park · Pro subscription' },
      { label: 'History', value: 'Website → Telegram, 6 messages' },
      { label: 'Intent', value: 'Refund a duplicate charge' },
      { label: 'Previous actions', value: 'Account verified · both charges located' },
      { label: 'Suggested next step', value: 'Approve refund of the second charge' },
    ],
  },
  {
    time: '7:45 PM',
    hour: 19.75,
    state: 'offline',
    title: 'Team offline',
    body: 'A new customer asks if you deliver to Chattogram. Truplexy answers right away. Anything that needs a person waits in the inbox with a summary, ready for the morning.',
  },
];

export const TEAM_STATES = [
  {
    id: 'online',
    label: 'Online',
    body: 'Truplexy takes the routine questions and routes anything sensitive to whoever is available — with the whole thread attached.',
  },
  {
    id: 'offline',
    label: 'Offline',
    body: 'The whole team is away. Truplexy keeps helping customers and is honest about when a person will follow up.',
  },
  {
    id: 'busy',
    label: 'Busy',
    body: 'Every agent is occupied. Instead of a silent queue, customers keep getting answers, and the cases that need a person are lined up next.',
  },
  {
    id: 'another',
    label: 'With another customer',
    body: 'Your agent stays focused. Truplexy picks up new conversations and only hands over when a person adds something.',
  },
  {
    id: 'after',
    label: 'Outside business hours',
    body: 'Customers still get real answers at 11 PM. Whatever needs your team is summarised and waiting when they log in.',
  },
] as const;

/* ------------------------------------------------------------------ *
 * Persistent context — a plan comparison, picked up a day later.
 * ------------------------------------------------------------------ */
export const CONTEXT = {
  before: {
    channel: 'web' as const,
    label: 'Website · Tuesday',
    messages: [
      { from: 'customer', channel: 'web', text: 'I think the Pro plan might be too much for us.' },
      { from: 'ai', channel: 'web', text: 'That’s fair for a team of three. Starter covers the core support features — Pro mainly adds advanced automation.' },
    ] satisfies Msg[],
  },
  after: {
    channel: 'telegram' as const,
    label: 'Telegram · Wednesday',
    messages: [
      { from: 'customer', channel: 'telegram', text: 'What was the cheaper one you mentioned?' },
      { from: 'ai', channel: 'telegram', text: 'The plan we discussed earlier was Starter. It includes the core support features without the advanced automation in Pro.' },
    ] satisfies Msg[],
  },
};

/* ------------------------------------------------------------------ *
 * Unified inbox.
 * ------------------------------------------------------------------ */
export type InboxStatus = 'ai' | 'qualified' | 'resolved' | 'human';

export const STATUS_LABEL: Record<InboxStatus, string> = {
  ai: 'AI handling',
  qualified: 'Qualified',
  resolved: 'Resolved',
  human: 'Human handoff',
};

export interface InboxThread {
  id: string;
  name: string;
  initials: string;
  /** Channels used in this conversation, oldest first. The last is the source of the latest message. */
  channels: ChannelId[];
  topic: string;
  status: InboxStatus;
  updated: string;
  preview: string;
  customer: { label: string; value: string }[];
  previous: { when: string; channel: ChannelId; text: string }[];
  summary: string;
  intent: string;
  handoff: string;
  messages: Msg[];
}

export const INBOX: InboxThread[] = [
  {
    id: 'sarah',
    name: 'Sarah Ahmed',
    initials: 'SA',
    channels: ['web', 'telegram'],
    topic: 'Order change',
    status: 'ai',
    updated: '2m',
    preview: "Updated the delivery address for #4821 to Gulshan 2.",
    customer: [
      { label: 'Order', value: '#4821 · not dispatched' },
      { label: 'Location', value: 'Dhaka' },
      { label: 'Linked channels', value: 'Website, Telegram' },
    ],
    previous: [
      { when: 'Last month', channel: 'web', text: 'Asked about return windows. Resolved by AI.' },
    ],
    summary: 'Sarah asked to change the delivery address on order #4821 via website chat, then returned on Telegram 20 minutes later with the new address. Address updated before dispatch.',
    intent: 'Change delivery address',
    handoff: 'Not needed — resolved by AI',
    messages: [
      ...HERO.first.messages.map((m, i) => ({ ...m, time: ['3:02 PM', '3:02 PM', '3:03 PM', '3:03 PM'][i] })),
      ...HERO.second.messages.map((m, i) => ({ ...m, time: ['3:23 PM', '3:23 PM'][i] })),
    ],
  },
  {
    id: 'james',
    name: 'James Wong',
    initials: 'JW',
    channels: ['web', 'telegram'],
    topic: 'Pricing',
    status: 'qualified',
    updated: '14m',
    preview: 'The plan we discussed earlier was Starter.',
    customer: [
      { label: 'Company', value: 'Team of 3' },
      { label: 'Interest', value: 'Starter plan' },
      { label: 'Linked channels', value: 'Website, Telegram' },
    ],
    previous: [
      { when: 'Yesterday', channel: 'web', text: 'Compared Pro and Starter. Leaning Starter.' },
    ],
    summary: 'Small team comparing plans. Felt Pro was more than they need; came back on Telegram to confirm the cheaper option. Good fit for Starter.',
    intent: 'Choose a plan',
    handoff: 'Sales notified · lead qualified',
    messages: [
      ...CONTEXT.before.messages.map((m) => ({ ...m, time: 'Tue 4:40 PM' })),
      ...CONTEXT.after.messages.map((m) => ({ ...m, time: 'Wed 10:12 AM' })),
    ],
  },
  {
    id: 'nabila',
    name: 'Nabila Islam',
    initials: 'NI',
    channels: ['web', 'discord', 'telegram'],
    topic: 'Product question',
    status: 'resolved',
    updated: '1h',
    preview: 'How much shorter would you like the sleeves?',
    customer: [
      { label: 'Interested in', value: 'Atlas Jacket · Black · M' },
      { label: 'Linked channels', value: 'Website, Discord, Telegram' },
    ],
    previous: [
      { when: 'Today 10:14 AM', channel: 'web', text: 'Asked about the Atlas Jacket in black.' },
      { when: 'Today 2:36 PM', channel: 'discord', text: 'Asked to see the black jacket again.' },
    ],
    summary: 'Browsing the Atlas Jacket in Black across three channels. Confirmed Medium fits true to size. Asked about a sleeve alteration — handed to tailoring, who confirmed it.',
    intent: 'Purchase · alteration',
    handoff: 'Completed by Maya · Tailoring',
    messages: JOURNEY.flatMap((s) => s.messages.map((m) => ({ ...m, time: s.time }))),
  },
  {
    id: 'daniel',
    name: 'Daniel Park',
    initials: 'DP',
    channels: ['web', 'telegram'],
    topic: 'Billing',
    status: 'human',
    updated: '3h',
    preview: "I've started the refund for the duplicate charge.",
    customer: [
      { label: 'Plan', value: 'Pro subscription' },
      { label: 'Issue', value: 'Duplicate September charge' },
      { label: 'Linked channels', value: 'Website, Telegram' },
    ],
    previous: [
      { when: 'In March', channel: 'telegram', text: 'Updated the card on file. Resolved by AI.' },
    ],
    summary: 'Charged twice for September. Truplexy verified the account, found both charges and handed over to billing with the full thread.',
    intent: 'Refund a duplicate charge',
    handoff: 'Assigned to Priya · Billing',
    messages: [
      { from: 'customer', channel: 'web', time: '1:16 PM', text: 'I was charged twice for September.' },
      { from: 'ai', channel: 'web', time: '1:16 PM', text: "Sorry about that. I can see two identical charges on 1 September. Refunds need a quick review from our billing team — I'm bringing them in now with everything we've covered." },
      { from: 'agent', channel: 'web', time: '1:19 PM', author: 'Priya · Billing', text: "Hi Daniel — I can see the duplicate September charge. I've started the refund; it should be back on your card in 3–5 business days." },
      { from: 'customer', channel: 'telegram', time: '4:05 PM', text: 'Thanks. Will I get a confirmation?' },
      { from: 'agent', channel: 'telegram', time: '4:07 PM', author: 'Priya · Billing', text: "Yes — I'll message you here the moment it's processed." },
    ],
  },
  {
    id: 'rafi',
    name: 'Rafi Hasan',
    initials: 'RH',
    channels: ['api'],
    topic: 'Subscription',
    status: 'ai',
    updated: '5h',
    preview: 'Your renewal moves to the 15th from next month.',
    customer: [
      { label: 'Source', value: 'In-app chat, via REST API' },
      { label: 'Plan', value: 'Annual · renews soon' },
    ],
    previous: [],
    summary: 'Asked to move the renewal date to match payroll. Change confirmed in the same conversation.',
    intent: 'Change renewal date',
    handoff: 'Not needed',
    messages: [
      { from: 'customer', channel: 'api', time: '10:31 AM', text: 'Can I move my renewal date to the 15th?' },
      { from: 'ai', channel: 'api', time: '10:31 AM', text: 'Yes. Your renewal moves to the 15th from next month, and nothing changes on this cycle. Want a reminder a few days before?' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Honesty guard. A demo conversation that uses a channel which is not
 * live would imply an integration that does not exist; fail the build.
 * ------------------------------------------------------------------ */
const used: ChannelId[] = [
  HERO.first.channel,
  HERO.second.channel,
  ...JOURNEY.flatMap((s) => s.messages.map((m) => m.channel)),
  ...INBOX.flatMap((t) => [...t.channels, ...t.messages.map((m) => m.channel), ...t.previous.map((p) => p.channel)]),
  ...CONTEXT.before.messages.map((m) => m.channel),
  ...CONTEXT.after.messages.map((m) => m.channel),
];
for (const id of used) {
  if (!isLive(id)) throw new Error(`Demo data uses "${id}", which is not live. Use a live channel or mark it live in channels.ts.`);
}

import { isLive, type ChannelId } from './channels';

/**
 * Every sample conversation on the page, from one fictional cast, so the
 * stories link up across sections: Sarah's address change in the hero is her
 * row in the inbox, Daniel's billing issue in the day-cycle is the handoff
 * example, and Nabila's jacket is her inbox thread.
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
 * Journey — Website → Discord → Telegram → a person. Nabila's inbox thread.
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
 * Continuous support — one day, played as a loop. The day runs from
 * 6 AM to 6 AM, so the moments are in playback order and the overnight
 * one comes last.
 * ------------------------------------------------------------------ */
export type TeamState = 'online' | 'busy' | 'offline';

export interface DayMoment {
  id: 'morning' | 'handoff' | 'busy' | 'evening' | 'overnight';
  time: string;
  /** Hour of the day it happens, 0–24. */
  hour: number;
  team: TeamState;
  /** What Truplexy did with the conversation. */
  state: 'resolved' | 'handoff' | 'queued';
  channel: ChannelId;
  customer: string;
  title: string;
  outcome: string;
  messages: Msg[];
  /** What travels with the conversation when a person takes over. */
  packet?: { label: string; value: string }[];
  /** A closing line under the conversation, e.g. a follow-up waiting for the team. */
  note?: string;
}

export const BUSINESS_HOURS = { start: 9, end: 18 } as const;

export const DAY: DayMoment[] = [
  {
    id: 'morning',
    time: '9:42 AM',
    hour: 9.7,
    team: 'online',
    state: 'resolved',
    channel: 'instagram',
    customer: 'Rumana Akter',
    title: 'A routine question, answered at once',
    outcome: 'Resolved by Truplexy. Nobody on the team had to stop what they were doing.',
    messages: [
      { from: 'customer', channel: 'instagram', text: 'Is the Atlas Jacket back in Medium?' },
      { from: 'ai', channel: 'instagram', text: 'It is — Medium came back in this morning, in Black and Olive. Want me to hold one for you?' },
      { from: 'customer', channel: 'instagram', text: 'Black, please!' },
      { from: 'ai', channel: 'instagram', text: 'Done. A Black Medium is on hold for you until tomorrow evening.' },
    ],
  },
  {
    id: 'handoff',
    time: '1:18 PM',
    hour: 13.3,
    team: 'online',
    state: 'handoff',
    channel: 'web',
    customer: 'Daniel Park',
    title: 'A billing dispute needs a person',
    outcome: 'Handed to Priya on billing, with everything she needs attached.',
    messages: [
      { from: 'customer', channel: 'web', time: '1:16 PM', text: 'I was charged twice for September.' },
      { from: 'ai', channel: 'web', time: '1:16 PM', text: 'Sorry about that — I can see both charges. I’m bringing in billing to review the refund.' },
      { from: 'agent', channel: 'web', time: '1:19 PM', author: 'Priya · Billing', text: 'Hi Daniel — I can see the duplicate charge. I’ve started your refund.' },
    ],
    packet: [
      { label: 'Customer', value: 'Daniel Park · Pro subscription' },
      { label: 'History', value: 'Website → Telegram, 6 messages' },
      { label: 'Intent', value: 'Refund a duplicate charge' },
      { label: 'Previous actions', value: 'Account verified · both charges located' },
      { label: 'Suggested next step', value: 'Approve refund of the second charge' },
    ],
  },
  {
    id: 'busy',
    time: '3:50 PM',
    hour: 15.83,
    team: 'busy',
    state: 'resolved',
    channel: 'telegram',
    customer: 'Farhan Ali',
    title: 'Every agent busy, no queue',
    outcome: 'Handled while the whole team was with other customers.',
    messages: [
      { from: 'customer', channel: 'telegram', text: 'Can I swap my shirt for a Large?' },
      { from: 'ai', channel: 'telegram', text: 'Yes. I’ve set up the exchange — the courier brings the Large on Friday and collects the Medium.' },
      { from: 'customer', channel: 'telegram', text: 'Perfect, thanks.' },
    ],
  },
  {
    id: 'evening',
    time: '7:45 PM',
    hour: 19.75,
    team: 'offline',
    state: 'queued',
    channel: 'whatsapp',
    customer: 'Imran Kabir',
    title: 'Team offline, customer still answered',
    outcome: 'Answered straight away. The bulk quote waits for the team, with a summary.',
    messages: [
      { from: 'customer', channel: 'whatsapp', time: '7:45 PM', text: 'Do you deliver to Chattogram? And is there a discount on 20 jackets?' },
      { from: 'ai', channel: 'whatsapp', time: '7:45 PM', text: 'Yes — Chattogram takes 2–3 days. Bulk pricing is our team’s call, so I’ve passed it on for 9 AM.' },
    ],
    note: 'Waiting for the team at 9 AM · summary attached',
  },
  {
    id: 'overnight',
    time: '2:30 AM',
    hour: 2.5,
    team: 'offline',
    state: 'resolved',
    channel: 'messenger',
    customer: 'Leo Fischer',
    title: 'Overnight, from another time zone',
    outcome: 'Resolved by Truplexy while your team was asleep.',
    messages: [
      { from: 'customer', channel: 'messenger', text: 'Hi from Berlin — do you ship to Germany?' },
      { from: 'ai', channel: 'messenger', text: 'We do. International orders arrive in 7–10 business days, tracked all the way.' },
      { from: 'customer', channel: 'messenger', text: 'Great, ordering now.' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Try it — a scripted chat with the sample store. The visitor taps a
 * question; each answer can light up what Truplexy now knows.
 * ------------------------------------------------------------------ */
export type ChatLine =
  | { from: 'ai' | 'agent'; text: string; author?: string }
  | { from: 'event'; text: string };

export interface ChatNode {
  /** The button label, and what the customer says. */
  ask: string;
  replies: ChatLine[];
  learns: { key: string; value: string }[];
  /** Follow-up questions offered after this one. */
  next: string[];
  /** A person joins; the scripted conversation ends here. */
  handoff?: boolean;
}

export interface StoreChat {
  store: string;
  channel: ChannelId;
  greeting: string;
  starters: string[];
  /** Offered at every step until someone from the team has joined. */
  person: string;
  nodes: Record<string, ChatNode>;
}

export const STORE_CHAT: StoreChat = {
  store: 'Loom & Lane',
  channel: 'web',
  greeting: 'Hi! I’m the Loom & Lane assistant. Ask me about an order, a product or a return — and I can bring in our team at any point.',
  starters: ['order', 'jacket', 'returns', 'charged'],
  person: 'person',
  nodes: {
    order: {
      ask: 'Where’s my order?',
      replies: [{ from: 'ai', text: 'Order #5107 — two linen shirts — is packed and leaves our warehouse this afternoon. It should reach you on Thursday.' }],
      learns: [
        { key: 'Order', value: '#5107 · packed, not dispatched' },
        { key: 'Intent', value: 'Track an order' },
      ],
      next: ['address', 'updates'],
    },
    address: {
      ask: 'Can I change the delivery address?',
      replies: [{ from: 'ai', text: 'Good timing — #5107 hasn’t left yet, so I can still change it. What’s the new address?' }],
      learns: [{ key: 'Intent', value: 'Change delivery address' }],
      next: ['newAddress'],
    },
    newAddress: {
      ask: 'House 12, Road 5, Dhanmondi.',
      replies: [{ from: 'ai', text: 'Done. #5107 will go to House 12, Road 5, Dhanmondi, and it’s still on track for Thursday.' }],
      learns: [
        { key: 'Address', value: 'Updated · Dhanmondi' },
        { key: 'Order', value: '#5107 · address changed before dispatch' },
      ],
      next: ['updates'],
    },
    updates: {
      ask: 'Can you message me when it ships?',
      replies: [{ from: 'ai', text: 'Of course. I’ll message you right here when it ships, and again on delivery day.' }],
      learns: [{ key: 'Updates', value: 'On · this chat' }],
      next: [],
    },
    jacket: {
      ask: 'Do you have the Atlas Jacket in black?',
      replies: [{ from: 'ai', text: 'We do — the Atlas Jacket comes in Black, sizes S to XL. Want help picking a size?' }],
      learns: [
        { key: 'Product', value: 'Atlas Jacket · Black' },
        { key: 'Intent', value: 'Purchase' },
      ],
      next: ['fit', 'sleeves'],
    },
    fit: {
      ask: 'Does Medium fit true to size?',
      replies: [{ from: 'ai', text: 'Medium fits true to size. If you like layering underneath, most people go one size up.' }],
      learns: [{ key: 'Preference', value: 'Size Medium' }],
      next: ['sleeves'],
    },
    sleeves: {
      ask: 'Could the sleeves be shortened?',
      replies: [
        { from: 'ai', text: 'That’s one for our tailoring team. I’ve passed them everything we’ve discussed, so you won’t need to repeat it.' },
        { from: 'event', text: 'Maya · Tailoring joined · full thread attached' },
        { from: 'agent', author: 'Maya · Tailoring', text: 'Hi! Atlas Jacket in Black — got it. How much shorter would you like the sleeves?' },
      ],
      learns: [
        { key: 'Intent', value: 'Purchase · alteration' },
        { key: 'Handoff', value: 'Maya · Tailoring' },
      ],
      next: [],
      handoff: true,
    },
    returns: {
      ask: 'What’s your return policy?',
      replies: [{ from: 'ai', text: 'You have 30 days from delivery to return anything unworn with the tags on. Returns are free within Dhaka.' }],
      learns: [{ key: 'Intent', value: 'Return an item' }],
      next: ['startReturn'],
    },
    startReturn: {
      ask: 'I’d like to return my last order.',
      replies: [{ from: 'ai', text: 'No problem. That’s order #4977, the Harbor Tee in M. I’ve emailed you a free return label — drop it at any courier point.' }],
      learns: [
        { key: 'Order', value: '#4977 · return started' },
        { key: 'Return', value: 'Label sent by email' },
      ],
      next: [],
    },
    charged: {
      ask: 'I was charged twice.',
      replies: [
        { from: 'ai', text: 'Sorry about that. I can see two identical charges on your last order. Refunds need a quick review, so I’m bringing in billing now.' },
        { from: 'event', text: 'Priya · Billing joined · full thread attached' },
        { from: 'agent', author: 'Priya · Billing', text: 'Hi! I can see the duplicate charge. I’ve started the refund — it’ll be back on your card in 3–5 business days.' },
      ],
      learns: [
        { key: 'Intent', value: 'Refund a duplicate charge' },
        { key: 'Handoff', value: 'Priya · Billing' },
      ],
      next: [],
      handoff: true,
    },
    person: {
      ask: 'Can I talk to a person?',
      replies: [
        { from: 'ai', text: 'Of course. I’m bringing in someone from our team now. They’ll see this whole conversation, so you won’t need to repeat anything.' },
        { from: 'event', text: 'Arif · Support joined · full thread attached' },
        { from: 'agent', author: 'Arif · Support', text: 'Hi, I’m Arif. I’ve read through everything so far — how can I help?' },
      ],
      learns: [{ key: 'Handoff', value: 'Arif · Support' }],
      next: [],
      handoff: true,
    },
  },
};

/* ------------------------------------------------------------------ *
 * Persistent context — a plan comparison, picked up a day later. James's
 * inbox thread.
 * ------------------------------------------------------------------ */
export const CONTEXT = {
  before: {
    channel: 'web' as const,
    label: 'Website · Tuesday',
    messages: [
      { from: 'customer', channel: 'web', text: 'I think the Pro plan might be too much for us.' },
      { from: 'ai', channel: 'web', text: 'That’s fair for a team of three. Premium covers the core support features — Pro mainly adds advanced automation.' },
    ] satisfies Msg[],
  },
  after: {
    channel: 'telegram' as const,
    label: 'Telegram · Wednesday',
    messages: [
      { from: 'customer', channel: 'telegram', text: 'What was the cheaper one you mentioned?' },
      { from: 'ai', channel: 'telegram', text: 'The plan we discussed earlier was Premium. It includes the core support features without the advanced automation in Pro.' },
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
    preview: 'The plan we discussed earlier was Premium.',
    customer: [
      { label: 'Company', value: 'Team of 3' },
      { label: 'Interest', value: 'Premium plan' },
      { label: 'Linked channels', value: 'Website, Telegram' },
    ],
    previous: [
      { when: 'Yesterday', channel: 'web', text: 'Compared Pro and Premium. Leaning Premium.' },
    ],
    summary: 'Small team comparing plans. Felt Pro was more than they need; came back on Telegram to confirm the cheaper option. Good fit for Premium.',
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
  ...DAY.flatMap((d) => [d.channel, ...d.messages.map((m) => m.channel)]),
  STORE_CHAT.channel,
];
for (const id of used) {
  if (!isLive(id)) throw new Error(`Demo data uses "${id}", which is not live. Use a live channel or mark it live in channels.ts.`);
}

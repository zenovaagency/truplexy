import { isLive, type ChannelId } from './channels';

/* ------------------------------------------------------------------ *
 * Hero stage: questions from different channels reach the assistant,
 * and each lands in the team's inbox, answered or handed to a person.
 * Independent conversations: Truplexy does not link one customer across
 * channels. The store is the demos' sample store.
 * ------------------------------------------------------------------ */
export interface StageItem {
  channel: ChannelId;
  customer: string;
  ask: string;
  reply: string;
  /** Resolved by the AI, or handed to a named teammate. */
  outcome: 'resolved' | 'human';
  agent?: string;
}

export const STAGE_STORE = 'Loom & Lane';

const ITEMS: StageItem[] = [
  {
    channel: 'whatsapp',
    customer: 'Maya',
    ask: 'Where’s my order #4821?',
    reply: 'It shipped yesterday and arrives Thursday. Here’s your tracking link.',
    outcome: 'resolved',
  },
  {
    channel: 'instagram',
    customer: 'Jonas',
    ask: 'Is the Atlas Jacket in black, size M?',
    reply: 'Yes, black in M is in stock. Want the link?',
    outcome: 'resolved',
  },
  {
    channel: 'email',
    customer: 'Daniel',
    ask: 'I was charged twice for September.',
    reply: 'Sorry about that. I’ve passed it to Priya in billing, with the details.',
    outcome: 'human',
    agent: 'Priya',
  },
  {
    channel: 'web',
    customer: 'Sarah',
    ask: 'Can I still change my delivery address?',
    reply: 'Yes, it hasn’t shipped yet. What’s the new address?',
    outcome: 'resolved',
  },
  {
    channel: 'telegram',
    customer: 'Lea',
    ask: 'How do returns work?',
    reply: 'Free within 30 days. I can start one for you now.',
    outcome: 'resolved',
  },
];

/** Only channels that are live today appear. */
export const STAGE_ITEMS = ITEMS.filter((i) => isLive(i.channel));

export const outcomeLabel = (i: StageItem) => (i.outcome === 'human' ? `Handed to ${i.agent ?? 'the team'}` : 'Resolved by AI');

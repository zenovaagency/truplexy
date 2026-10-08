import type { BillingAddon, BusinessType, LedgerEntry, Plan, TicketMessage, TicketPriority, TicketReply, TicketStatus } from '@/lib/api/types';
import { DB_VERSION, hex, type MockChannel, type MockConversation, type MockDb, type MockDoc, type MockTicket, type MockTool } from './db';

/* ------------------------------------------------------------------ */
/* Deterministic randomness, so every seed tells the same story.        */
/* ------------------------------------------------------------------ */

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const id = (prefix: string, r: () => number) =>
  `${prefix}_${Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16)).join('')}`;

/* ------------------------------------------------------------------ */
/* Catalogs                                                            */
/* ------------------------------------------------------------------ */

/** Extra tokens start at $8 per million, less the plan's discount, less 10% from the 10th million and 20% from the 50th. */
const addon = (discount: number, max: number): Plan['token_addon'] => {
  const at = (volume: number) => +(8 * (1 - discount) * (1 - volume)).toFixed(2);
  return {
    price_per_million: at(0),
    min_millions: 1,
    max_millions: max,
    step_millions: 1,
    currency: 'USD',
    tiers: [
      { from_millions: 1, price_per_million: at(0) },
      { from_millions: 10, price_per_million: at(0.1) },
      { from_millions: 50, price_per_million: at(0.2) },
    ].filter((t) => t.from_millions <= max),
  };
};

export const PLANS: Plan[] = [
  { id: 'free', name: 'Free', limits: { bots: 1, documents_per_bot: 50, members: 3, replies_per_month: 500, tokens_per_month: 1_000_000 }, token_addon: addon(0, 20) },
  { id: 'starter', name: 'Starter', limits: { bots: 2, documents_per_bot: 250, members: 6, replies_per_month: 5000, tokens_per_month: 10_000_000 }, token_addon: addon(0.1, 100) },
  { id: 'pro', name: 'Pro', limits: { bots: 5, documents_per_bot: 1000, members: 15, replies_per_month: 25000, tokens_per_month: 50_000_000 }, token_addon: addon(0.2, 500) },
  { id: 'enterprise', name: 'Enterprise', limits: { bots: 0, documents_per_bot: 0, members: 0, replies_per_month: 0, tokens_per_month: 0 }, token_addon: null },
];

export const BUSINESS_TYPES: BusinessType[] = [
  {
    id: 'ecommerce',
    label: 'Online store',
    description: 'Orders, shipping, returns and product questions.',
    assistant_name: 'Store assistant',
    knowledge_topics: ['Shipping policy', 'Returns and refunds', 'Product care', 'Sizing guides'],
    tool_ideas: ['Look up an order', 'Start a return', 'Check stock'],
  },
  {
    id: 'saas',
    label: 'Software / SaaS',
    description: 'Onboarding, how-to questions, billing and bug reports.',
    assistant_name: 'Product specialist',
    knowledge_topics: ['Getting started', 'Feature guides', 'Billing FAQ', 'API docs'],
    tool_ideas: ['Look up an account', 'Check service status', 'Reset a password'],
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    description: 'Appointments, opening hours and practical patient questions.',
    assistant_name: 'Clinic assistant',
    knowledge_topics: ['Services', 'Opening hours', 'Insurance', 'Preparing for a visit'],
    tool_ideas: ['Book an appointment', 'Check availability'],
  },
  {
    id: 'real_estate',
    label: 'Real estate',
    description: 'Listings, viewings and application questions.',
    assistant_name: 'Property assistant',
    knowledge_topics: ['Listings', 'Viewing process', 'Application requirements'],
    tool_ideas: ['Search listings', 'Book a viewing'],
  },
  {
    id: 'hospitality',
    label: 'Hospitality',
    description: 'Bookings, amenities and guest requests.',
    assistant_name: 'Guest assistant',
    knowledge_topics: ['Rooms and rates', 'Amenities', 'Check-in and check-out', 'Local area'],
    tool_ideas: ['Check a reservation', 'Request late check-out'],
  },
  {
    id: 'education',
    label: 'Education',
    description: 'Courses, enrolment, schedules and student support.',
    assistant_name: 'Student assistant',
    knowledge_topics: ['Course catalog', 'Enrolment', 'Fees', 'Academic calendar'],
    tool_ideas: ['Look up a timetable', 'Check enrolment status'],
  },
  {
    id: 'professional_services',
    label: 'Professional services',
    description: 'Services, quotes, scheduling and client questions.',
    assistant_name: 'Client assistant',
    knowledge_topics: ['Services', 'Pricing', 'How we work'],
    tool_ideas: ['Request a quote', 'Book a consultation'],
  },
  {
    id: 'other',
    label: 'Something else',
    description: 'A general-purpose support assistant to shape yourself.',
    assistant_name: 'Support assistant',
    knowledge_topics: ['About us', 'FAQ', 'Contact and hours'],
    tool_ideas: ['Look up a customer record'],
  },
];

/* ------------------------------------------------------------------ */
/* Conversation scripts. [author, text]; c = customer, a = assistant,   */
/* h = a person on the team.                                           */
/* ------------------------------------------------------------------ */

type Turn = ['c' | 'a' | 'h', string];
interface Script {
  subject: string;
  turns: Turn[];
  priority?: TicketPriority;
}

const STORE_SCRIPTS: Script[] = [
  {
    subject: 'Where is order #A-10482?',
    priority: 'high',
    turns: [
      ['c', "Hi, I ordered a cast iron skillet last Tuesday and the tracking hasn't moved since Friday."],
      ['a', "Sorry for the wait! Order #A-10482 left our Ohio warehouse on Friday and the carrier shows it in transit to your local depot. Deliveries in your area are running about a day behind — the new estimate is Thursday."],
      ['c', "It's a birthday gift for Saturday. Can you make sure it arrives in time?"],
      ['a', "I can't change the carrier's route myself, but I've flagged this for our shipping team so they can request priority handling. Someone from the team will follow up right here."],
    ],
  },
  {
    subject: 'Blender arrived with a cracked jar',
    priority: 'high',
    turns: [
      ['c', 'My new Pro 900 blender arrived today and the jar is cracked down one side. Photos attached.'],
      ['a', "I'm sorry it arrived damaged. Items damaged in transit are covered: we can send a replacement jar at no cost, or a full replacement blender. Which would you prefer?"],
      ['c', 'A whole new blender please, I don’t trust the base either.'],
      ['h', "Hi, this is Jun from the Acme team. I've arranged a full replacement — it ships tomorrow with a prepaid label for the damaged one. You'll get tracking by email tonight."],
    ],
  },
  {
    subject: "Discount code SPRING20 isn't working",
    turns: [
      ['c', 'Checkout says SPRING20 is invalid but I got it in your newsletter this morning.'],
      ['a', 'SPRING20 applies to full-price items over $50 and excludes the clearance section. Your cart has two clearance items — removing them should let the code apply. Want me to list which ones?'],
      ['c', 'Ah, that worked. Thanks!'],
      ['a', "Glad it's sorted! Enjoy the 20% off."],
    ],
  },
  {
    subject: 'Change the delivery address on my order',
    priority: 'urgent',
    turns: [
      ['c', 'I just placed order #A-10511 but used my old address. It needs to go to 48 Maple Ave instead.'],
      ['a', "I can't edit an address after checkout, but your order hasn't shipped yet so the team can. I've passed it to them — please don't place a second order."],
    ],
  },
  {
    subject: 'Wholesale pricing for a café',
    priority: 'normal',
    turns: [
      ['c', 'We run two cafés and want 40 of your stoneware mugs. Do you do trade pricing?'],
      ['a', 'We do! Orders of 24+ units of one item qualify for our trade program. I’ll hand you to the team so they can send a quote — could you share your business name?'],
      ['c', 'Northside Coffee Co.'],
    ],
  },
  {
    subject: 'Charged twice for one order',
    priority: 'urgent',
    turns: [
      ['c', 'My card shows two charges of $129.00 from Acme today but I only have one order confirmation.'],
      ['a', "That's usually a pending authorisation that drops off within 3–5 business days, but I don't want to guess with your money. I'm handing this to our billing team now."],
      ['h', "Hi, Priya from billing here. I can see one captured payment and one voided authorisation — the second charge will disappear from your statement within 3 business days. Nothing more to do on your side."],
      ['c', 'Great, thank you for checking.'],
    ],
  },
  {
    subject: 'Missing lid for 5 qt Dutch oven',
    turns: [
      ['c', 'The Dutch oven came without its lid.'],
      ['a', "That shouldn't happen — sorry! I've noted it on your order. Our team will ship the lid separately; you'll get an email when it's on its way."],
    ],
  },
  {
    subject: 'Is the stand mixer bowl dishwasher-safe?',
    priority: 'low',
    turns: [
      ['c', 'Can the steel bowl from the Artisan stand mixer go in the dishwasher?'],
      ['a', 'Yes — the stainless steel bowl and the flat beater are dishwasher-safe on the top rack. Hand-wash the dough hook and whisk to keep their coating.'],
    ],
  },
  {
    subject: 'Cancel my monthly coffee box',
    turns: [
      ['c', 'How do I cancel the coffee subscription?'],
      ['a', 'You can cancel any time from Account → Subscriptions → Manage. If you cancel before the 25th, next month’s box won’t ship. Want me to walk you through it?'],
      ['c', 'I tried, the button does nothing.'],
      ['a', "Sorry about that — I'll get a person to cancel it for you and look at the button."],
    ],
  },
  {
    subject: 'Exchange linen sheets for a king size',
    turns: [
      ['c', 'I ordered queen linen sheets but need king. Can I swap?'],
      ['a', 'Of course. Unopened bedding can be exchanged within 30 days. I can start an exchange — you’ll pay the $20 difference and get a prepaid return label.'],
      ['c', 'Yes please.'],
    ],
  },
  {
    subject: 'Coffee grinder stopped working (warranty)',
    priority: 'high',
    turns: [
      ['c', 'My burr grinder from March just stopped turning on.'],
      ['a', "That's covered by the 2-year warranty. I'll open a warranty claim — could you confirm the serial number on the base?"],
      ['c', 'SN 44-18820-B'],
    ],
  },
  {
    subject: 'Do you ship to Canada?',
    priority: 'low',
    turns: [
      ['c', 'Do you ship to Toronto?'],
      ['a', "Yes — we ship to Canada with duties included at checkout. Standard delivery to Toronto takes 5–8 business days, and it's free over CA$150."],
    ],
  },
];

const SAAS_SCRIPTS: Script[] = [
  {
    subject: 'SSO login loops back to Okta',
    priority: 'urgent',
    turns: [
      ['c', 'Since this morning our whole team gets redirected back to Okta in a loop when signing in to Northwind.'],
      ['a', 'A loop right after Okta usually means the SAML certificate changed. Did your IT team rotate the Okta signing certificate recently?'],
      ['c', 'Possibly, I’ll ask. But 40 people are locked out right now.'],
      ['a', "Understood — I'm escalating this to our engineers now. A person will take it from here."],
    ],
  },
  {
    subject: 'Export boards to CSV',
    priority: 'low',
    turns: [
      ['c', 'How do I export a board to CSV?'],
      ['a', 'Open the board, click ••• in the top right, then Export → CSV. Archived cards are included if you tick "Include archived".'],
    ],
  },
  {
    subject: 'Invoice needs our VAT number',
    turns: [
      ['c', 'Our last invoice is missing our VAT ID, finance needs it reissued.'],
      ['a', 'You can add a VAT ID under Settings → Billing → Tax details; future invoices will include it. For the past invoice, the billing team can reissue it — I’ve passed it on.'],
    ],
  },
  {
    subject: 'Getting 429s from the API',
    priority: 'high',
    turns: [
      ['c', 'Our sync job is getting HTTP 429 since we added more boards.'],
      ['a', "The API allows 600 requests per minute per workspace. The Retry-After header tells you how long to wait. Batching card updates with the /bulk endpoint usually cuts requests by 10x."],
      ['c', 'Can you raise our limit instead? We’re on Pro.'],
    ],
  },
  {
    subject: 'Downgrade from Pro to Starter',
    turns: [
      ['c', 'We want to move to Starter at renewal.'],
      ['a', 'You can schedule the change under Settings → Billing → Change plan; it takes effect at renewal on the 14th. Note Starter has 10 boards, and you have 14 active.'],
    ],
  },
  {
    subject: 'Webhook not firing when a card moves',
    priority: 'high',
    turns: [
      ['c', 'Our webhook stopped getting card.moved events yesterday.'],
      ['a', 'I can see the last 20 deliveries to your endpoint failed with a TLS error. Did the certificate on hooks.example.com change?'],
      ['h', "Hi, Sam from engineering. Your endpoint's new certificate is missing an intermediate. Once it's fixed, click Redeliver in Settings → Webhooks."],
    ],
  },
  {
    subject: 'Adding seats in the middle of a billing cycle',
    priority: 'low',
    turns: [
      ['c', 'If I add 5 seats today, am I charged for the full month?'],
      ['a', 'No — new seats are prorated to the day for the rest of the cycle, then billed normally at renewal.'],
    ],
  },
  {
    subject: 'Can our data stay in the EU?',
    turns: [
      ['c', 'Do you offer EU data residency? Our legal team requires it.'],
      ['a', 'Yes, Enterprise workspaces can be hosted in Frankfurt. I’ll connect you with the team for the details and a DPA.'],
    ],
  },
];

const GENERIC_SCRIPTS: Script[] = [
  { subject: 'Question about opening hours', turns: [['c', 'Are you open on public holidays?'], ['a', 'We’re open 10am–4pm on most public holidays. Let me get someone to confirm the next one for you.']] },
  { subject: 'Rescheduling my appointment', priority: 'high', turns: [['c', 'I need to move Thursday’s appointment.'], ['a', 'I’ll pass this to the team so they can offer you new times.']] },
  { subject: 'Payment link not working', priority: 'urgent', turns: [['c', 'The payment link from your email gives an error.'], ['a', 'Sorry about that — I’ve flagged it for the team.']] },
  { subject: 'Request for documents', turns: [['c', 'Can you send me a copy of last month’s statement?'], ['a', 'Of course — someone from the team will email it to you shortly.']] },
  { subject: 'Feedback on last visit', priority: 'low', turns: [['c', 'Just wanted to say the staff were great.'], ['a', 'Thank you! I’ll share that with the team.']] },
];

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

const STATUSES: TicketStatus[] = ['open', 'open', 'open', 'open', 'open', 'closed', 'closed', 'closed'];

function buildTickets(
  r: () => number,
  tenant: string,
  bot: string,
  scripts: Script[],
  count: number,
  agents: { id: string; name: string }[],
  conversations: MockConversation[],
): MockTicket[] {
  const out: MockTicket[] = [];
  for (let i = 0; i < count; i++) {
    const s = scripts[i % scripts.length]!;
    const age = Math.floor(r() * (i < scripts.length ? 3 : 28) * DAY) + 20 * MIN;
    const created = Date.now() - age;
    const status: TicketStatus = i < 4 ? 'open' : pick(r, STATUSES);
    const assignee = r() < 0.65 ? pick(r, agents) : undefined;
    const convId = id('conv', r);
    const channel = r() < 0.85 ? 'api' : 'playground';

    let t = created;
    const messages: TicketMessage[] = s.turns.map(([who, text]) => {
      t += Math.floor(r() * 6 * MIN) + 40_000;
      return {
        id: id('msg', r),
        role: who === 'c' ? 'user' : 'assistant',
        content: text,
        author: who === 'c' ? 'customer' : who === 'a' ? 'assistant' : 'agent',
        agent: who === 'h' ? (assignee?.name ?? agents[0]!.name) : undefined,
        model: who === 'a' ? 'google/gemini-3.1-flash-lite' : undefined,
        usage:
          who === 'a'
            ? { input_tokens: 1800 + Math.floor(r() * 900), output_tokens: 90 + Math.floor(r() * 120), total_tokens: 0, cost: 0 }
            : undefined,
        created_at: new Date(Math.min(t, Date.now() - MIN)).toISOString(),
      };
    });
    for (const m of messages) {
      if (m.usage) {
        m.usage.total_tokens = m.usage.input_tokens + m.usage.output_tokens;
        m.usage.cost = +(m.usage.input_tokens * 0.0000001 + m.usage.output_tokens * 0.0000004).toFixed(6);
      }
    }

    const last = messages.at(-1)!;
    const lastCustomer = [...messages].reverse().find((m) => m.author === 'customer');
    const lastAgent = [...messages].reverse().find((m) => m.author === 'agent');
    const done = status === 'closed';
    const escalated = !done && (s.priority === 'urgent' || r() < 0.2);

    conversations.push({
      id: convId,
      tenant_id: tenant,
      bot_id: bot,
      channel,
      title: s.subject,
      status: 'open',
      created_at: new Date(created).toISOString(),
      updated_at: last.created_at,
      messages,
    });

    out.push({
      id: id('tkt', r),
      tenant_id: tenant,
      bot_id: bot,
      conversation_id: convId,
      channel,
      subject: s.subject,
      status,
      priority: s.priority ?? pick(r, ['low', 'normal', 'normal', 'high'] as TicketPriority[]),
      assignee_user_id: assignee?.id,
      assignee_name: assignee?.name,
      escalated,
      escalated_at: escalated ? messages[1]?.created_at : undefined,
      source: r() < 0.8 ? 'customer' : 'dashboard',
      handed_off: !escalated && !done && r() < 0.25,
      last_customer_at: lastCustomer?.created_at,
      last_agent_at: lastAgent?.created_at,
      first_response_at: lastAgent?.created_at,
      closed_at: done ? new Date(Math.min(t + 2 * HOUR, Date.now())).toISOString() : undefined,
      reopen_count: r() < 0.08 ? 1 : 0,
      created_at: new Date(created).toISOString(),
      updated_at: last.created_at,
    });
  }
  return out;
}

const STORE_DOCS: { title: string; content: string; source_url?: string }[] = [
  {
    title: 'Shipping policy',
    source_url: 'https://acme.example/help/shipping',
    content: `# Shipping policy

## Processing times
Orders placed before 2pm ET on a business day ship the same day. Orders placed later ship the next business day.

## Delivery times
- Standard (US): 3–5 business days. Free on orders over $50.
- Express (US): 1–2 business days, $14.
- Canada: 5–8 business days, duties included at checkout. Free over CA$150.

## Tracking
You get a tracking link by email as soon as your order leaves the warehouse. Tracking can take up to 24 hours to update after the label is created.

## Changing an address
We can change the delivery address only before the order ships. Contact support as soon as possible.`,
  },
  {
    title: 'Returns and refunds',
    source_url: 'https://acme.example/help/returns',
    content: `# Returns and refunds

You can return unused items within 30 days of delivery for a full refund. Bedding and textiles must be unopened.

## Damaged or faulty items
Items damaged in transit are replaced at no cost. Send a photo of the damage and we'll ship a replacement with a prepaid return label.

## Exchanges
Exchanges for a different size or colour are free within 30 days; you pay any price difference.

## Refund timing
Refunds go back to the original payment method within 5 business days of the return arriving.`,
  },
  {
    title: 'Warranty',
    content: `# Warranty

Small appliances (blenders, grinders, mixers) carry a 2-year warranty against manufacturing defects. Cookware carries a lifetime warranty.

To make a claim, give us the order number and the serial number on the base of the appliance. We repair or replace the item at our choice.`,
  },
  {
    title: 'Discount codes',
    content: `# Discount codes

Only one code applies per order. Seasonal codes like SPRING20 apply to full-price items over $50 and exclude clearance. Codes can't be applied after checkout.`,
  },
  {
    title: 'Caring for cast iron',
    content: `# Caring for cast iron

Wash by hand with hot water and a brush; a little mild soap is fine. Dry immediately and rub with a thin layer of oil. Never put cast iron in the dishwasher.

## Stand mixer parts
The stainless steel bowl and the flat beater are dishwasher-safe (top rack). Hand-wash the dough hook and wire whisk.`,
  },
  {
    title: 'Coffee subscription',
    content: `# Coffee subscription

Boxes ship on the 1st of each month. Cancel or pause any time from Account → Subscriptions → Manage. Changes made before the 25th apply to the next box.`,
  },
  {
    title: 'Trade and wholesale',
    content: `# Trade and wholesale

Businesses ordering 24 or more units of a single item qualify for trade pricing. Ask support for a quote with your business name and the items you need.`,
  },
];

const SAAS_DOCS: { title: string; content: string; source_url?: string }[] = [
  { title: 'Single sign-on (SAML)', source_url: 'https://northwind.example/docs/sso', content: '# Single sign-on\n\nNorthwind supports SAML 2.0 with Okta, Azure AD and Google Workspace. If you rotate your identity provider certificate, upload the new one under Settings → Security → SSO or sign-in will loop.' },
  { title: 'Exporting data', content: '# Exporting data\n\nAny board can be exported to CSV or JSON from ••• → Export. Workspace admins can export everything from Settings → Data.' },
  { title: 'Billing FAQ', content: '# Billing FAQ\n\nNew seats are prorated daily. Plan changes take effect at renewal. Add a VAT ID under Settings → Billing → Tax details.' },
  { title: 'API rate limits', content: '# API rate limits\n\nThe API allows 600 requests per minute per workspace. Responses over the limit return 429 with a Retry-After header. Use /bulk endpoints to batch card updates.' },
  { title: 'Webhooks', content: '# Webhooks\n\nWebhooks deliver card and board events. Failed deliveries are retried 5 times with backoff. Endpoints must present a full TLS certificate chain.' },
];

function buildDocs(r: () => number, tenant: string, bot: string, list: typeof STORE_DOCS): MockDoc[] {
  return list.map((d, i) => {
    const bytes = new TextEncoder().encode(d.content).length;
    const chunks = Math.max(1, Math.ceil(bytes / 600));
    const created = ago((i + 2) * 3 * DAY + Math.floor(r() * DAY));
    return {
      id: id('doc', r),
      tenant_id: tenant,
      bot_id: bot,
      title: d.title,
      source_type: 'manual',
      byte_size: bytes,
      status: 'indexed',
      chunk_count: chunks,
      embedded_count: chunks,
      token_count: Math.round(bytes / 4),
      source_url: d.source_url,
      locale: 'en',
      created_at: created,
      updated_at: created,
      indexed_at: created,
      content: d.content,
    };
  });
}

function fileDoc(
  r: () => number,
  tenant: string,
  bot: string,
  name: string,
  mime: string,
  size: number,
  status: MockDoc['status'],
  extra: Partial<MockDoc> = {},
): MockDoc {
  const chunks = status === 'pending_upload' ? 0 : Math.ceil(size / 2400);
  const created = ago(Math.floor(r() * 5 * DAY) + HOUR);
  return {
    id: id('doc', r),
    tenant_id: tenant,
    bot_id: bot,
    title: name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
    source_type: 'file',
    source_name: name,
    mime_type: mime,
    byte_size: size,
    status,
    chunk_count: chunks,
    embedded_count: status === 'indexed' ? chunks : status === 'processing' ? Math.floor(chunks * 0.4) : 0,
    token_count: status === 'indexed' ? Math.round(size / 5) : 0,
    created_at: created,
    updated_at: created,
    indexed_at: status === 'indexed' ? created : undefined,
    content: status === 'indexed' ? `# ${name}\n\n(Extracted text of the uploaded file.)` : '',
    ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* Billing history                                                     */
/* ------------------------------------------------------------------ */

type BillingEvent =
  | { days: number; kind: 'credit' | 'debit'; amount: number; actor: string; note: string }
  | { days: number; kind: 'token_addon'; millions: number; price: number; actor: string };

/** A balance, its ledger and extra-token purchases, from events oldest first. */
function billingHistory(r: () => number, events: BillingEvent[]) {
  let balance = 0;
  const ledger: LedgerEntry[] = [];
  const addons: BillingAddon[] = [];
  for (const e of events) {
    const at = ago(e.days * DAY);
    if (e.kind === 'token_addon') {
      const a: BillingAddon = { id: id('add', r), tokens: e.millions * 1_000_000, price: e.price, month: at.slice(0, 7), actor: e.actor, created_at: at };
      addons.unshift(a);
      balance = +(balance - e.price).toFixed(6);
      ledger.unshift({ id: id('led', r), amount: -e.price, balance_after: balance, kind: 'token_addon', note: `${e.millions}M extra tokens`, actor: e.actor, addon_id: a.id, created_at: at });
    } else {
      balance = +(balance + e.amount).toFixed(6);
      ledger.unshift({ id: id('led', r), amount: e.amount, balance_after: balance, kind: e.kind, note: e.note, actor: e.actor, created_at: at });
    }
  }
  return { balance, ledger, addons };
}

/* ------------------------------------------------------------------ */
/* Deletions: one pending request, one restorable business, one purged */
/* ------------------------------------------------------------------ */

type Person = { id: string; email: string };

function deletionHistory(dana: Person, owen: Person, ops: Person): Pick<MockDb, 'deletionRequests' | 'deletions'> {
  const bakeryRequest = 'dlr_' + hex(32);
  return {
    deletionRequests: [
      { id: 'dlr_' + hex(32), tenant_id: 'northwind', tenant_name: 'Northwind Boards', requested_by: dana.id, requested_by_email: dana.email, reason: 'We are moving support to another tool.', status: 'pending', created_at: ago(2 * DAY) },
      { id: bakeryRequest, tenant_id: 'old-bakery', tenant_name: 'Old Town Bakery', requested_by: owen.id, requested_by_email: owen.email, reason: 'The bakery has closed.', status: 'approved', reviewed_by: ops.id, reviewed_at: ago(6 * DAY), created_at: ago(8 * DAY) },
    ],
    deletions: [
      { id: 'del_' + hex(32), tenant_id: 'old-bakery', tenant_name: 'Old Town Bakery', owner_email: owen.email, reason: 'The bakery has closed.', request_id: bakeryRequest, deleted_by: ops.id, deleted_by_email: ops.email, deleted_at: ago(6 * DAY), restore_until: ago(-24 * DAY), state: 'deleted' },
      { id: 'del_' + hex(32), tenant_id: 'pinecrest', tenant_name: 'Pinecrest Outfitters', owner_email: 'jo@pinecrest.example', reason: 'Duplicate business made by mistake.', deleted_by: ops.id, deleted_by_email: ops.email, deleted_at: ago(45 * DAY), restore_until: ago(15 * DAY), purged_at: ago(14 * DAY), state: 'purged' },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Channels                                                            */
/* ------------------------------------------------------------------ */

/** The catalog the API starts with. */
function channelTypes(): MockDb['channelTypes'] {
  return (
    [
      ['website', 'Website', "A chat widget on the business's own site or app."],
      ['discord', 'Discord', 'A bot in a Discord server, in channels or DMs.'],
      ['slack', 'Slack', 'A Slack app answering in a workspace.'],
      ['telegram', 'Telegram', 'A Telegram bot in private chats and groups.'],
      ['whatsapp', 'WhatsApp', 'A WhatsApp Business number through the Meta Cloud API.'],
      ['email', 'Email', 'A support address, through an inbound mail webhook.'],
      ['custom', 'Custom', 'Anything else built on the chat API.'],
    ] as const
  ).map(([id, label, description], i) => ({ id, label, description, icon: id, status: 'active', sort_order: (i + 1) * 10, created_at: ago(120 * DAY), updated_at: ago(120 * DAY) }));
}

/**
 * Sample channels, with the seeded keys bound to them and chat API
 * conversations (and their tickets) spread across them. Uses its own
 * sequence, so the rest of the sample data stays as it was.
 */
function seedChannels(apiKeys: MockDb['apiKeys'], conversations: MockConversation[], tickets: MockTicket[]): MockChannel[] {
  const r = rng(7311);
  const ch = (tenant_id: string, type: string, name: string, days: number, more: Partial<MockChannel> = {}): MockChannel => ({
    id: id('chn', r),
    tenant_id,
    bot_id: 'support',
    type,
    name,
    description: '',
    external_id: '',
    enabled: true,
    disabled_by_platform: false,
    created_at: ago(days * DAY),
    updated_at: ago(days * DAY),
    ...more,
  });
  const site = ch('acme', 'website', 'Storefront chat', 100, { description: 'The chat bubble on acme.example.', external_id: 'acme.example' });
  const telegram = ch('acme', 'telegram', 'Acme Telegram', 60, { external_id: '@acmestore_bot' });
  const whatsapp = ch('acme', 'whatsapp', 'WhatsApp support line', 70, { external_id: '+1 415 555 0134', enabled: false, description: 'Paused while the number moves to the new Meta account.' });
  const nwDiscord = ch('northwind', 'discord', 'Northwind community', 30, { external_id: '1187340912665214976' });
  const bloomSite = ch('bloom-clinic', 'website', 'Clinic website', 25, { disabled_by_platform: true, description: 'Booking page chat.' });
  const channels = [site, telegram, whatsapp, nwDiscord, bloomSite];

  // Bind the keys that are clearly for one of these.
  const bind = (name: string, c: MockChannel) => {
    const k = apiKeys.find((x) => x.name.startsWith(name));
    if (k) k.channel_id = c.id;
  };
  bind('Website chat', site);
  bind('Telegram', telegram);
  bind('WhatsApp', whatsapp);
  bind('Discord', nwDiscord);

  const spread: Record<string, MockChannel[]> = { acme: [site, site, site, telegram, telegram, whatsapp], northwind: [nwDiscord], 'bloom-clinic': [bloomSite] };
  for (const conv of conversations) {
    const pool = conv.bot_id === 'support' && conv.channel === 'api' ? spread[conv.tenant_id] : undefined;
    if (pool && r() < 0.85) conv.channel_id = pick(r, pool).id;
  }
  for (const t of tickets) t.channel_id = conversations.find((c) => c.id === t.conversation_id)?.channel_id;
  return channels;
}

/* ------------------------------------------------------------------ */
/* The seed                                                            */
/* ------------------------------------------------------------------ */

export function seedDb(): MockDb {
  const r = rng(20261006);

  const users = [
    { id: '7b1e2c4a-0001-4c1a-9f00-000000000001', email: 'alex@acme.example', name: 'Alex Rivera', platform_admin: false },
    { id: '7b1e2c4a-0002-4c1a-9f00-000000000002', email: 'priya@acme.example', name: 'Priya Nair', platform_admin: false },
    { id: '7b1e2c4a-0003-4c1a-9f00-000000000003', email: 'marco@acme.example', name: 'Marco Ruiz', platform_admin: false },
    { id: '7b1e2c4a-0004-4c1a-9f00-000000000004', email: 'jun@acme.example', name: 'Jun Park', platform_admin: false },
    { id: '7b1e2c4a-0005-4c1a-9f00-000000000005', email: 'sofia@acme.example', name: 'Sofia Alvarez', platform_admin: false },
    { id: '7b1e2c4a-0006-4c1a-9f00-000000000006', email: 'liam@acme.example', name: "Liam O'Connor", platform_admin: false },
    { id: '7b1e2c4a-0007-4c1a-9f00-000000000007', email: 'dana@northwind.example', name: 'Dana Whitfield', platform_admin: false },
    { id: '7b1e2c4a-0008-4c1a-9f00-000000000008', email: 'sam@northwind.example', name: 'Sam Okafor', platform_admin: false },
    { id: '7b1e2c4a-0009-4c1a-9f00-000000000009', email: 'ops@truplexy.dev', name: 'Truplexy Ops', platform_admin: true },
    { id: '7b1e2c4a-0010-4c1a-9f00-000000000010', email: 'mia@bloomclinic.example', name: 'Mia Chen', platform_admin: false },
    { id: '7b1e2c4a-0011-4c1a-9f00-000000000011', email: 'owen@harbor.example', name: 'Owen Hart', platform_admin: false },
  ].map((u, i) => ({ ...u, created_at: ago((120 - i * 7) * DAY), last_seen_at: ago(Math.floor(r() * 3 * DAY)) }));
  const [alex, priya, marco, jun, sofia, liam, dana, sam, ops, mia, owen] = users as [typeof users[0], ...typeof users];

  // Its own sequence, so the rest of the sample data stays as it was.
  const br = rng(4242);
  const tenants: MockDb['tenants'] = [
    { id: 'acme', name: 'Acme Store', business_type: 'ecommerce', plan: 'pro', status: 'active', created_at: ago(118 * DAY), reply_target_hours: 4, limit_overrides: {}, replies_this_month: 3412, tokens_this_month: 7_120_000,
      ...billingHistory(br, [
        { days: 40, kind: 'credit', amount: 150, actor: ops!.email, note: 'Bank transfer INV-1042' },
        { days: 2, kind: 'token_addon', millions: 5, price: 32, actor: alex!.email },
      ]) },
    { id: 'northwind', name: 'Northwind Boards', business_type: 'saas', plan: 'starter', status: 'active', created_at: ago(64 * DAY), reply_target_hours: 8, limit_overrides: {}, replies_this_month: 1288, tokens_this_month: 2_640_000,
      ...billingHistory(br, [{ days: 20, kind: 'credit', amount: 50, actor: ops!.email, note: 'Bank transfer INV-1077' }]) },
    { id: 'bloom-clinic', name: 'Bloom Clinic', business_type: 'healthcare', plan: 'free', status: 'active', created_at: ago(30 * DAY), reply_target_hours: 24, limit_overrides: {}, replies_this_month: 214, tokens_this_month: 940_000, ...billingHistory(br, []) },
    { id: 'harbor-realty', name: 'Harbor Realty', business_type: 'real_estate', plan: 'starter', status: 'suspended', created_at: ago(51 * DAY), reply_target_hours: 12, limit_overrides: { replies_per_month: 8000 }, replies_this_month: 0, tokens_this_month: 0, ...billingHistory(br, []) },
    // Deleted 6 days ago: restorable from the platform console.
    { id: 'old-bakery', name: 'Old Town Bakery', business_type: 'hospitality', plan: 'free', status: 'active', created_at: ago(140 * DAY), reply_target_hours: 24, limit_overrides: {}, replies_this_month: 0, tokens_this_month: 0, balance: 0, addons: [], ledger: [], deleted_at: ago(6 * DAY) },
  ];

  const memberships: MockDb['memberships'] = [
    { tenant_id: 'acme', user_id: alex!.id, role: 'owner', joined_at: ago(118 * DAY) },
    { tenant_id: 'acme', user_id: priya!.id, role: 'admin', joined_at: ago(110 * DAY) },
    { tenant_id: 'acme', user_id: marco!.id, role: 'editor', joined_at: ago(90 * DAY) },
    { tenant_id: 'acme', user_id: jun!.id, role: 'agent', joined_at: ago(80 * DAY) },
    { tenant_id: 'acme', user_id: sofia!.id, role: 'agent', joined_at: ago(45 * DAY) },
    { tenant_id: 'acme', user_id: liam!.id, role: 'viewer', joined_at: ago(12 * DAY) },
    { tenant_id: 'northwind', user_id: dana!.id, role: 'owner', joined_at: ago(64 * DAY) },
    { tenant_id: 'northwind', user_id: alex!.id, role: 'admin', joined_at: ago(40 * DAY) },
    { tenant_id: 'northwind', user_id: sam!.id, role: 'agent', joined_at: ago(38 * DAY) },
    { tenant_id: 'bloom-clinic', user_id: mia!.id, role: 'owner', joined_at: ago(30 * DAY) },
    { tenant_id: 'harbor-realty', user_id: owen!.id, role: 'owner', joined_at: ago(51 * DAY) },
    { tenant_id: 'old-bakery', user_id: owen!.id, role: 'owner', joined_at: ago(140 * DAY) },
  ];

  const bots: MockDb['bots'] = [
    { tenant_id: 'acme', id: 'support', name: 'Store assistant', kb_version: 14, created_at: ago(118 * DAY) },
    { tenant_id: 'acme', id: 'wholesale', name: 'Trade desk', kb_version: 3, created_at: ago(20 * DAY) },
    { tenant_id: 'northwind', id: 'support', name: 'Product specialist', kb_version: 6, created_at: ago(64 * DAY) },
    { tenant_id: 'bloom-clinic', id: 'support', name: 'Clinic assistant', kb_version: 1, created_at: ago(30 * DAY) },
    { tenant_id: 'harbor-realty', id: 'support', name: 'Property assistant', kb_version: 2, created_at: ago(51 * DAY) },
    { tenant_id: 'old-bakery', id: 'support', name: 'Bakery assistant', kb_version: 0, created_at: ago(140 * DAY) },
  ];

  const conversations: MockConversation[] = [];
  const acmeAgents = [alex!, priya!, jun!, sofia!].map((u) => ({ id: u.id, name: u.name }));
  const tickets = [
    ...buildTickets(r, 'acme', 'support', STORE_SCRIPTS, 38, acmeAgents, conversations),
    ...buildTickets(r, 'acme', 'wholesale', STORE_SCRIPTS.slice(4, 5), 3, acmeAgents, conversations),
    ...buildTickets(r, 'northwind', 'support', SAAS_SCRIPTS, 16, [dana!, alex!, sam!].map((u) => ({ id: u.id, name: u.name })), conversations),
    ...buildTickets(r, 'bloom-clinic', 'support', GENERIC_SCRIPTS, 5, [{ id: mia!.id, name: mia!.name }], conversations),
    ...buildTickets(r, 'harbor-realty', 'support', GENERIC_SCRIPTS, 4, [{ id: owen!.id, name: owen!.name }], conversations),
  ];

  // A few conversations the assistant flagged that nobody has picked up: the handoff queue.
  for (const [tenant, title, text] of [
    ['acme', 'Bulk order for a wedding registry', 'I want to set up a registry for 120 guests — can a person help me?'],
    ['acme', 'Allergy question about seasoning oil', 'Does your seasoning oil contain any nut oils? My son has a severe allergy.'],
    ['northwind', 'Security questionnaire for procurement', 'Our procurement team needs a completed security questionnaire.'],
  ] as const) {
    const at = ago(Math.floor(r() * 5 * HOUR) + 10 * MIN);
    conversations.push({
      id: id('conv', r),
      tenant_id: tenant,
      bot_id: 'support',
      channel: 'api',
      title,
      status: 'handoff',
      created_at: at,
      updated_at: at,
      messages: [
        { id: id('msg', r), role: 'user', content: text, author: 'customer', created_at: at },
        { id: id('msg', r), role: 'assistant', content: "That's a great question for our team — I've let them know and someone will reply here. In the meantime I'm happy to help with anything else.", author: 'assistant', created_at: at },
      ],
    });
  }

  // Replies and internal notes on tickets that a person answered.
  const replies: MockDb['replies'] = {};
  for (const t of tickets) {
    const conv = conversations.find((c) => c.id === t.conversation_id);
    const humans = conv?.messages.filter((m) => m.author === 'agent') ?? [];
    const list: TicketReply[] = humans.map((m) => ({ id: id('rpl', r), kind: 'reply' as const, author: m.agent ?? 'Team', content: m.content, message_id: m.id, created_at: m.created_at }));
    if (t.escalated || r() < 0.2) {
      list.unshift({
        id: id('rpl', r),
        kind: 'note',
        author: pick(r, acmeAgents).name,
        content: pick(r, [
          'Checked the order system — the order is real and paid. Waiting on the warehouse.',
          'Customer has been with us 3 years, happy to go the extra mile here.',
          'Escalated to billing; do not promise a refund amount yet.',
          'Same issue reported twice this week. Logged it with engineering.',
        ]),
        created_at: t.created_at,
      });
    }
    if (list.length) replies[t.id] = list;
  }

  const documents: MockDoc[] = [
    ...buildDocs(r, 'acme', 'support', STORE_DOCS),
    fileDoc(r, 'acme', 'support', 'acme-catalog-2026.pdf', 'application/pdf', 2_840_000, 'indexed', { product: 'catalog', version: '2026' }),
    fileDoc(r, 'acme', 'support', 'size-guide-bedding.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 184_000, 'processing'),
    fileDoc(r, 'acme', 'support', 'legacy-faq.html', 'text/html', 96_000, 'failed', { error: 'The file has no readable text after removing scripts and navigation.' }),
    fileDoc(r, 'acme', 'support', 'holiday-hours.md', 'text/markdown', 2_100, 'pending_upload'),
    ...buildDocs(r, 'acme', 'wholesale', STORE_DOCS.slice(6)),
    ...buildDocs(r, 'northwind', 'support', SAAS_DOCS),
    ...buildDocs(r, 'bloom-clinic', 'support', [{ title: 'Opening hours', content: '# Opening hours\n\nMonday–Friday 8am–6pm, Saturday 9am–1pm.' }]),
  ];

  const toolBase = (tenant: string, name: string, description: string, method: MockTool['api']['method'], url: string, parameters: MockTool['parameters'], read_only: boolean): MockTool => ({
    id: id('tool', r),
    tenant_id: tenant,
    name,
    description,
    method,
    parameters,
    read_only,
    available: true,
    disabled: false,
    calls: Math.floor(r() * 900),
    errors: Math.floor(r() * 20),
    api: { method, url, created_at: ago(40 * DAY), updated_at: ago(Math.floor(r() * 10) * DAY) },
  } as MockTool);

  const tools: MockTool[] = [
    toolBase('acme', 'lookup_order', 'Look up an order by its number to see status, items and tracking. Use when a customer asks where their order is.', 'GET', 'https://api.acme.example/orders/{order_number}', {
      type: 'object',
      properties: { order_number: { type: 'string', description: 'The order number, like A-10482' } },
      required: ['order_number'],
      additionalProperties: false,
    }, true),
    toolBase('acme', 'start_return', 'Start a return or exchange for an order item. Only use after the customer confirms they want to return it.', 'POST', 'https://api.acme.example/returns', {
      type: 'object',
      properties: {
        order_number: { type: 'string' },
        sku: { type: 'string', description: 'The item SKU' },
        reason: { type: 'string', enum: ['damaged', 'wrong_item', 'changed_mind', 'exchange'] },
      },
      required: ['order_number', 'sku', 'reason'],
      additionalProperties: false,
    }, false),
    toolBase('acme', 'check_stock', 'Check whether a product is in stock and when it will be restocked.', 'GET', 'https://api.acme.example/stock', {
      type: 'object',
      properties: { sku: { type: 'string' } },
      required: ['sku'],
    }, true),
    toolBase('northwind', 'service_status', 'Check the current Northwind service status and open incidents.', 'GET', 'https://status.northwind.example/api/v2/summary', { type: 'object', properties: {} }, true),
  ];
  tools[2]!.disabled = true;
  tools[2]!.available = false;
  tools[2]!.unavailable_reason = 'Turned off by a platform admin.';

  const supportVars = { tone: 'Warm, concise and practical', escalation_policy: 'Hand over to a person for refunds over $200, damaged items and anything legal.', sign_off: '' };
  const workspaces: MockDb['workspaces'] = [
    {
      tenant_id: 'acme', bot_id: 'support', name: 'Store assistant', revision: 7, updated_at: ago(2 * DAY),
      bot: { name: 'Ava', promptTemplateId: 'tpl_' + 'a'.repeat(32), promptVariables: { ...supportVars, return_policy: '30 days, unused items; damaged items replaced free.' }, model: 'google/gemini-3.1-flash-lite', temperature: 0.4, maxTokens: 800, ragEnabled: true, topK: 6, toolsEnabled: true, tools: ['lookup_order', 'start_return'] },
      history: [],
    },
    {
      tenant_id: 'acme', bot_id: 'wholesale', name: 'Trade desk', revision: 0,
      bot: { name: 'Trade desk', prompt: 'You answer trade and wholesale enquiries for Acme Store. Be brief, collect the business name, items and quantities, and hand over to a person for quotes.', model: '', temperature: 0.3, maxTokens: 600, ragEnabled: true, topK: 4, toolsEnabled: false, tools: [] },
      history: [],
    },
    {
      tenant_id: 'northwind', bot_id: 'support', name: 'Product specialist', revision: 3, updated_at: ago(9 * DAY),
      bot: { name: 'Nova', promptTemplateId: 'tpl_' + 'b'.repeat(32), promptVariables: { product_name: 'Northwind Boards', docs_url: 'https://northwind.example/docs', tone: 'Clear and technical' }, model: 'anthropic/claude-haiku-4.5', temperature: 0.2, maxTokens: 1200, ragEnabled: true, topK: 5, toolsEnabled: true, tools: ['service_status'] },
      history: [],
    },
  ];
  // Version history: a few older saves of Acme's bot.
  const acmeWs = workspaces[0]!;
  acmeWs.history = [
    { id: 'ver_' + hex(12), savedAt: ago(2 * DAY), bot: acmeWs.bot },
    { id: 'ver_' + hex(12), savedAt: ago(9 * DAY), bot: { ...acmeWs.bot, temperature: 0.7, topK: 4, tools: ['lookup_order'] } },
    { id: 'ver_' + hex(12), savedAt: ago(23 * DAY), bot: { ...acmeWs.bot, model: 'openai/gpt-5-mini', toolsEnabled: false, tools: [] } },
  ];

  const apiKeys: MockDb['apiKeys'] = [
    { id: id('key', r), name: 'Website chat · Production', tenant_id: 'acme', bot_id: 'support', key_prefix: 'tpx_4f9a', status: 'active', created_at: ago(100 * DAY), last_used_at: ago(4 * MIN) },
    { id: id('key', r), name: 'Telegram', tenant_id: 'acme', bot_id: 'support', key_prefix: 'tpx_b21c', status: 'active', created_at: ago(60 * DAY), last_used_at: ago(37 * MIN) },
    { id: id('key', r), name: 'Shopify', tenant_id: 'acme', bot_id: 'support', key_prefix: 'tpx_77d0', status: 'active', created_at: ago(33 * DAY), last_used_at: ago(2 * HOUR) },
    { id: id('key', r), name: 'WhatsApp · staging', tenant_id: 'acme', bot_id: 'support', key_prefix: 'tpx_09ee', status: 'revoked', created_at: ago(70 * DAY), last_used_at: ago(41 * DAY) },
    { id: id('key', r), name: 'Discord community', tenant_id: 'northwind', bot_id: 'support', key_prefix: 'tpx_c3a8', status: 'active', created_at: ago(30 * DAY), last_used_at: ago(3 * HOUR) },
  ];

  const channels = seedChannels(apiKeys, conversations, tickets);

  const audit: MockDb['audit'] = [];
  const addAudit = (tenant: string, actor: typeof alex, action: string, target: string, details: Record<string, unknown> | null, when: number) =>
    audit.push({ id: id('aud', r), tenant_id: tenant, actor: actor!.id, actor_email: actor!.email, action, target, details, created_at: ago(when) });
  addAudit('acme', alex, 'business.updated', 'acme', { reply_target_hours: { from: 8, to: 4 } }, 3 * HOUR);
  addAudit('acme', priya, 'api_key.created', apiKeys[2]!.id, { name: 'Shopify', bot_id: 'support' }, 33 * DAY);
  addAudit('acme', priya, 'api_key.revoked', apiKeys[3]!.id, { name: 'WhatsApp · staging' }, 41 * DAY);
  addAudit('acme', alex, 'member.role_changed', liam!.id, { from: 'agent', to: 'viewer' }, 6 * DAY);
  addAudit('acme', priya, 'invite.created', 'inv_' + hex(32), { email: 'kai@acme.example', role: 'agent' }, 26 * HOUR);
  addAudit('acme', alex, 'bot.created', 'wholesale', { name: 'Trade desk' }, 20 * DAY);
  addAudit('acme', alex, 'member.joined', sofia!.id, { role: 'agent' }, 45 * DAY);
  addAudit('acme', priya, 'webhook.updated', 'support', { url: 'https://hooks.acme.example/truplexy' }, 15 * DAY);
  addAudit('acme', ops, 'plan.changed', 'acme', { from: 'starter', to: 'pro' }, 50 * DAY);
  addAudit('acme', alex, 'member.removed', 'u_former', { email: 'tom@acme.example' }, 70 * DAY);
  addAudit('northwind', dana, 'business.created', 'northwind', { business_type: 'saas' }, 64 * DAY);
  addAudit('northwind', dana, 'invite.created', 'inv_' + hex(32), { email: 'alex@acme.example', role: 'admin' }, 41 * DAY);
  addAudit('northwind', dana, 'api_key.created', apiKeys[4]!.id, { name: 'Discord community' }, 30 * DAY);
  addAudit('acme', priya, 'channel.created', channels[1]!.id, { name: channels[1]!.name, type: 'telegram' }, 60 * DAY);
  addAudit('acme', priya, 'channel.disabled', channels[2]!.id, { name: channels[2]!.name }, 9 * DAY);
  addAudit('bloom-clinic', ops, 'channel.disabled', channels[4]!.id, { name: channels[4]!.name, by: 'platform' }, 4 * DAY);
  addAudit('harbor-realty', ops, 'business.suspended', 'harbor-realty', { reason: 'Payment overdue' }, 5 * DAY);
  addAudit('northwind', dana, 'business.deletion_requested', 'northwind', { reason: 'We are moving support to another tool.' }, 2 * DAY);
  addAudit('old-bakery', owen, 'business.deletion_requested', 'old-bakery', { reason: 'The bakery has closed.' }, 8 * DAY);
  addAudit('old-bakery', ops, 'business.deleted', 'old-bakery', { reason: 'The bakery has closed.' }, 6 * DAY);
  audit.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const invites: MockDb['invites'] = [
    { id: id('inv', r), tenant_id: 'acme', email: 'kai@acme.example', role: 'agent', status: 'pending', invited_by: priya!.email, expires_at: new Date(Date.now() + 6 * DAY).toISOString(), created_at: ago(26 * HOUR), token: 'tpi_' + hex(48) },
  ];

  const webhooks: MockDb['webhooks'] = {
    'acme/support': {
      url: 'https://hooks.acme.example/truplexy',
      enabled: true,
      secret: 'whsec_' + hex(40),
      secret_hint: 'whsec_…9c1e',
      events: ['message.created', 'ticket.updated'],
      last_delivery: { event: 'ticket.updated', ok: true, status: 200, at: ago(14 * MIN) },
      created_at: ago(15 * DAY),
      updated_at: ago(15 * DAY),
    },
  };

  const now = ago(0);
  const models: MockDb['models'] = [
    { id: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', description: 'Fast and inexpensive. A strong default for support.', input_price_per_mtok: 0.1, output_price_per_mtok: 0.4, fee_percent: null, commission_percent: null, pricing_synced_at: now, context_tokens: 1_000_000, max_output_tokens: 8192, supports_tools: true, supports_prompt_cache: true, status: 'active', is_default: true, sort_order: 10, created_at: ago(90 * DAY), updated_at: now },
    { id: 'openai/gpt-5-mini', label: 'GPT-5 mini', description: 'Balanced quality and cost, good at following instructions.', input_price_per_mtok: 0.25, output_price_per_mtok: 2, fee_percent: null, commission_percent: null, pricing_synced_at: now, context_tokens: 400_000, max_output_tokens: 16384, supports_tools: true, supports_prompt_cache: true, status: 'active', is_default: false, sort_order: 20, created_at: ago(90 * DAY), updated_at: now },
    { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5', description: 'Natural, careful replies with reliable tool use.', input_price_per_mtok: 1, output_price_per_mtok: 5, fee_percent: null, commission_percent: null, pricing_synced_at: now, context_tokens: 200_000, max_output_tokens: 8192, supports_tools: true, supports_prompt_cache: true, status: 'active', is_default: false, sort_order: 30, created_at: ago(80 * DAY), updated_at: now },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', description: 'The most capable option for complex products and long policies.', input_price_per_mtok: 3, output_price_per_mtok: 15, fee_percent: null, commission_percent: null, pricing_synced_at: now, context_tokens: 200_000, max_output_tokens: 16384, supports_tools: true, supports_prompt_cache: true, status: 'active', is_default: false, sort_order: 40, created_at: ago(80 * DAY), updated_at: now },
    { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', description: 'Open-weights model; no tool calling.', input_price_per_mtok: 0.15, output_price_per_mtok: 0.6, fee_percent: null, commission_percent: null, pricing_synced_at: now, context_tokens: 1_000_000, max_output_tokens: 8192, supports_tools: false, supports_prompt_cache: false, status: 'active', is_default: false, sort_order: 50, created_at: ago(60 * DAY), updated_at: now },
    { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', description: 'Kept for bots that already use it.', input_price_per_mtok: 0.27, output_price_per_mtok: 1.1, fee_percent: null, commission_percent: null, pricing_synced_at: now, context_tokens: 128_000, max_output_tokens: 8192, supports_tools: true, supports_prompt_cache: false, status: 'hidden', is_default: false, sort_order: 60, created_at: ago(120 * DAY), updated_at: now },
  ];

  const templates: MockDb['templates'] = [
    {
      id: 'tpl_' + 'a'.repeat(32),
      name: 'Store concierge',
      description: 'For online stores: orders, delivery, returns and product questions.',
      business_types: ['ecommerce'],
      status: 'active',
      is_default: false,
      version: 4,
      created_at: ago(90 * DAY),
      updated_at: ago(20 * DAY),
      variables: [
        { key: 'tone', label: 'Tone of voice', help: 'How the assistant should sound, in a few words.', required: true, max_length: 120 },
        { key: 'return_policy', label: 'Return policy summary', help: 'One line; the full policy belongs in the knowledge base.', required: true, max_length: 300 },
        { key: 'escalation_policy', label: 'When to hand over to a person', required: false, max_length: 400 },
        { key: 'sign_off', label: 'Sign-off', help: 'Optional closing line, e.g. "— The Acme team".', required: false, max_length: 80 },
      ],
      body: `You are {{assistant_name}}, the customer support assistant for {{business_name}}, an online store.

Speak in this tone: {{tone}}. Write like a helpful person, not a script: short paragraphs, no jargon, no made-up facts.

Answer from the knowledge base. If it doesn't cover the question, say so and offer to bring in the team.

Returns in one line: {{return_policy}}
{{#escalation_policy}}
Hand the conversation to a person when: {{escalation_policy}}
{{/escalation_policy}}
{{#sign_off}}
End longer replies with: {{sign_off}}
{{/sign_off}}`,
    },
    {
      id: 'tpl_' + 'b'.repeat(32),
      name: 'Product specialist',
      description: 'For software products: how-to questions, troubleshooting and billing.',
      business_types: ['saas'],
      status: 'active',
      is_default: false,
      version: 2,
      created_at: ago(90 * DAY),
      updated_at: ago(40 * DAY),
      variables: [
        { key: 'product_name', label: 'Product name', required: true, max_length: 80 },
        { key: 'docs_url', label: 'Documentation link', help: 'Shared when a full guide helps.', required: false, max_length: 300 },
        { key: 'tone', label: 'Tone of voice', required: true, max_length: 120 },
      ],
      body: `You are {{assistant_name}}, a product specialist for {{product_name}} by {{business_name}}.

Tone: {{tone}}. Give exact steps (menu paths, settings names). Ask one clarifying question when a problem is ambiguous.
{{#docs_url}}
Point to the documentation at {{docs_url}} when a longer guide would help.
{{/docs_url}}
Never guess about billing amounts or outages: hand those to the team.`,
    },
    {
      id: 'tpl_' + 'c'.repeat(32),
      name: 'Friendly support (general)',
      description: 'A general support assistant for any kind of business.',
      business_types: [],
      status: 'active',
      is_default: true,
      version: 1,
      created_at: ago(120 * DAY),
      updated_at: ago(120 * DAY),
      variables: [
        { key: 'tone', label: 'Tone of voice', required: true, max_length: 120 },
        { key: 'escalation_policy', label: 'When to hand over to a person', required: false, max_length: 400 },
      ],
      body: `You are {{assistant_name}}, the support assistant for {{business_name}}.

Tone: {{tone}}. Be accurate and brief, answer from the knowledge base, and offer a person when you can't help.
{{#escalation_policy}}
Hand over when: {{escalation_policy}}
{{/escalation_policy}}`,
    },
    {
      id: 'tpl_' + 'd'.repeat(32),
      name: 'Clinic front desk (draft)',
      description: 'Appointments and practical questions; never gives medical advice.',
      business_types: ['healthcare'],
      status: 'hidden',
      is_default: false,
      version: 1,
      created_at: ago(10 * DAY),
      updated_at: ago(10 * DAY),
      variables: [{ key: 'tone', label: 'Tone of voice', required: true, max_length: 120 }],
      body: `You are {{assistant_name}} at {{business_name}}. Tone: {{tone}}. Never give medical advice; for symptoms, direct people to call the clinic or emergency services.`,
    },
  ];

  return {
    version: DB_VERSION,
    seededAt: Date.now(),
    currentUserId: alex!.id,
    users,
    tenants,
    memberships,
    invites,
    bots,
    workspaces,
    apiKeys,
    audit,
    documents,
    tools,
    tickets,
    conversations,
    replies,
    webhooks,
    models,
    templates,
    playground: {},
    ...deletionHistory(dana!, owen!, ops!),
    channelTypes: channelTypes(),
    channels,
  };
}

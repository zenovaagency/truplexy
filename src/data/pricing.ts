import { SITE } from './site';

/**
 * Plans. `PLANS` feeds the plan cards on the home page and /pricing;
 * `COMPARISON` feeds the full table on /pricing. Keep the two in step: a
 * feature a card names must read the same in the table.
 *
 * Yearly prices are the monthly price less 20%, rounded down to the dollar.
 */
export type Billing = 'monthly' | 'yearly';

export type PlanId = 'free' | 'starter' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  blurb: string;
  /** USD per month. `yearly` is the per-month price when billed annually. */
  price: Record<Billing, number>;
  featured?: boolean;
  limits: string[];
  /** Heading above the feature list, e.g. "Everything in Free, plus". */
  includes: string;
  features: string[];
  cta: { label: string; href: string };
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    blurb: 'For trying Truplexy on one channel before you commit.',
    price: { monthly: 0, yearly: 0 },
    limits: ['100K AI tokens / month', '100 conversations / month', '1 AI agent · 3 team members'],
    includes: 'Includes',
    features: [
      'Website chat, Telegram or Discord (1 connection)',
      'Basic cross-channel customer identity',
      'Human handoff with full context',
      'Basic analytics',
    ],
    cta: { label: 'Start for free', href: SITE.signupUrl },
  },
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'For small teams putting AI support on every channel their customers use.',
    price: { monthly: 29, yearly: 23 },
    featured: true,
    limits: ['1M AI tokens / month', '1,000 conversations / month', '3 AI agents · 10 team members'],
    includes: 'Everything in Free, plus',
    features: [
      'WhatsApp, Messenger, Instagram & Email',
      'Shopify & WooCommerce',
      '10 automation workflows',
      'REST API (limited)',
      'Remove Truplexy branding',
    ],
    cta: { label: 'Get started', href: SITE.signupUrl },
  },
  {
    id: 'pro',
    name: 'Pro',
    blurb: 'For growing teams that want Truplexy to take action and plug into their own systems.',
    price: { monthly: 79, yearly: 63 },
    limits: ['10M AI tokens / month', '10,000 conversations / month', '10 AI agents · 25 team members'],
    includes: 'Everything in Starter, plus',
    features: [
      'HubSpot, Zendesk, Slack & Microsoft Teams',
      '100 automation workflows',
      'Full REST API, webhooks & custom integrations',
      'Advanced analytics',
      'Priority support',
    ],
    cta: { label: 'Get started', href: SITE.signupUrl },
  },
];

/**
 * Percent saved by paying yearly, for the toggle badge. The smallest saving
 * across paid plans, so the badge never overstates it.
 */
export const YEARLY_SAVING = Math.min(
  ...PLANS.filter((p) => p.price.monthly > 0).map((p) => Math.round((1 - p.price.yearly / p.price.monthly) * 100)),
);

/** `true` is included, `false` is not, a string is shown as is. */
export type Cell = boolean | string;

export interface CompareRow {
  label: string;
  values: Record<PlanId, Cell>;
  /** Marks the row with a footnote symbol from `FOOTNOTES`. */
  note?: keyof typeof FOOTNOTES;
}

export const FOOTNOTES = {
  '*': 'Free includes 1 active channel connection: website chat, Telegram or Discord.',
} as const;

const all = { free: true, starter: true, pro: true };
const paid = { free: false, starter: true, pro: true };
const proOnly = { free: false, starter: false, pro: true };
const row = (label: string, free: Cell, starter: Cell, pro: Cell): CompareRow => ({ label, values: { free, starter, pro } });

export const COMPARISON: { group: string; rows: CompareRow[] }[] = [
  {
    group: 'Usage & limits',
    rows: [
      row('AI tokens included', '100K', '1M', '10M'),
      row('Tickets / conversations per month', '100', '1,000', '10,000'),
      row('AI bots / agents', '1', '3', '10'),
      row('Team members', '3', '10', '25'),
      row('Active channel connections', '1', '5', '15'),
      row('Knowledge base storage', '5 MB', '50 MB', '250 MB'),
      row('Knowledge sources / documents', '10', '100', '500'),
      row('Customer profiles', '250', '5,000', '50,000'),
      row('Conversation history', '7 days', '90 days', '1 year'),
    ],
  },
  {
    group: 'Customer memory & automation',
    rows: [
      row('Cross-channel customer identity', 'Basic', true, true),
      row('Shared conversation history', 'Limited', true, true),
      row('Persistent customer context', 'Basic', 'Standard', 'Advanced'),
      { label: 'Human handoff', values: all },
      row('Automation workflows', false, '10', '100'),
    ],
  },
  {
    group: 'Channels',
    rows: [
      { label: 'Website chat', values: all },
      { label: 'Telegram', values: all, note: '*' },
      { label: 'Discord', values: all, note: '*' },
      { label: 'WhatsApp', values: paid },
      { label: 'Facebook Messenger', values: paid },
      { label: 'Instagram', values: paid },
      { label: 'Email', values: paid },
    ],
  },
  {
    group: 'Integrations',
    rows: [
      { label: 'Shopify', values: paid },
      { label: 'WooCommerce', values: paid },
      { label: 'HubSpot', values: proOnly },
      { label: 'Zendesk', values: proOnly },
      { label: 'Slack', values: proOnly },
      { label: 'Microsoft Teams', values: proOnly },
    ],
  },
  {
    group: 'Developer',
    rows: [
      row('REST API', false, 'Limited', 'Full'),
      { label: 'Webhooks', values: proOnly },
      { label: 'Custom API integrations', values: proOnly },
    ],
  },
  {
    group: 'Analytics & branding',
    rows: [
      { label: 'Basic analytics', values: all },
      { label: 'Advanced analytics', values: proOnly },
      { label: 'Remove Truplexy branding', values: paid },
    ],
  },
  {
    group: 'Token add-ons',
    rows: [
      row('Extra tokens', 'Not available', '$8 / 1M', '$6 / 1M'),
      row('Maximum add-on', false, '+5M / month', '+30M / month'),
    ],
  },
  {
    group: 'Support',
    rows: [row('Support', 'Community', 'Email', 'Priority')],
  },
];

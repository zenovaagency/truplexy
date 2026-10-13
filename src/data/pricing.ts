import { SITE } from './site';

/**
 * Plans. `PLANS` feeds the plan cards on the home page and /pricing;
 * `COMPARISON` feeds the full table on /pricing. Keep the two in step: a
 * feature a card names must read the same in the table. List only what the
 * product actually does.
 *
 * Yearly prices are the monthly price less 20%, rounded down to the dollar.
 */
export type Billing = 'monthly' | 'yearly';

export type PlanId = 'starter' | 'pro' | 'enterprise';

/** Self-serve plans start with a free trial this many days long. */
export const TRIAL_DAYS = 7;

export interface Plan {
  id: PlanId;
  name: string;
  blurb: string;
  /** USD per month. `yearly` is the per-month price when billed annually. Null is priced on request. */
  price: Record<Billing, number> | null;
  /** Starts with a `TRIAL_DAYS` free trial. */
  trial?: boolean;
  featured?: boolean;
  /** Heading above the feature list, e.g. "Everything in Starter, plus". */
  includes: string;
  features: string[];
  cta: { label: string; href: string };
}

/**
 * Where a plan's button goes: dashboard sign-up, with the plan and billing
 * period carried in `next`. After sign-up and onboarding the dashboard opens
 * that plan's Paddle checkout.
 */
export const signupHref = (plan: PlanId, billing: Billing = 'monthly') =>
  `${SITE.dashboardUrl}/sign-in?mode=signup&next=${encodeURIComponent(`/onboarding?plan=${plan}&billing=${billing}`)}`;

/** Data attributes that let the billing toggle re-point a plan's button. Empty for plans without a sign-up flow. */
export const signupAttrs = (plan: Plan) =>
  plan.trial ? { 'data-signup-monthly': signupHref(plan.id, 'monthly'), 'data-signup-yearly': signupHref(plan.id, 'yearly') } : {};

const trialCta = (id: PlanId) => ({ label: `Start ${TRIAL_DAYS}-day free trial`, href: signupHref(id) });

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'For small teams putting AI support on every channel their customers use.',
    price: { monthly: 29, yearly: 23 },
    trial: true,
    featured: true,
    includes: 'Includes',
    features: [
      'Website chat, WhatsApp, Messenger, Instagram, Telegram, Discord & Email',
      'Shopify, WooCommerce & WordPress',
      'Cross-channel customer identity & shared history',
      'Knowledge base & custom tools',
      'Human handoff with full context',
      'REST API (limited)',
    ],
    cta: trialCta('starter'),
  },
  {
    id: 'pro',
    name: 'Pro',
    blurb: 'For growing teams that want Truplexy to take action and plug into their own systems.',
    price: { monthly: 79, yearly: 63 },
    trial: true,
    includes: 'Everything in Starter, plus',
    features: [
      'HubSpot, Zendesk, Slack & Microsoft Teams',
      'Web search for your AI agent',
      'Full REST API & webhooks',
      'Priority support',
    ],
    cta: trialCta('pro'),
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    blurb: 'For larger teams that need limits, onboarding and support shaped around their volume.',
    price: null,
    includes: 'Everything in Pro, plus',
    features: [
      'Custom limits for bots, team members and knowledge',
      'Unlimited AI tokens available',
      'Hands-on onboarding for your channels and tools',
      'Dedicated support',
    ],
    cta: { label: 'Contact sales', href: SITE.demoUrl },
  },
];

/** The plans with a list price. */
export const PRICED = PLANS.filter((p): p is Plan & { price: Record<Billing, number> } => p.price !== null);

/**
 * Percent saved by paying yearly, for the toggle badge. The smallest saving
 * across priced plans, so the badge never overstates it.
 */
export const YEARLY_SAVING = Math.min(...PRICED.map((p) => Math.round((1 - p.price.yearly / p.price.monthly) * 100)));

/** `true` is included, `false` is not, a string is shown as is. */
export type Cell = boolean | string;

export interface CompareRow {
  label: string;
  values: Record<PlanId, Cell>;
  /** Marks the row with a footnote symbol from `FOOTNOTES`. */
  note?: keyof typeof FOOTNOTES;
}

export const FOOTNOTES: Record<string, string> = {};

const all = { starter: true, pro: true, enterprise: true };
const proUp = { starter: false, pro: true, enterprise: true };
const row = (label: string, starter: Cell, pro: Cell, enterprise: Cell): CompareRow => ({ label, values: { starter, pro, enterprise } });

export const COMPARISON: { group: string; rows: CompareRow[] }[] = [
  {
    group: 'AI & knowledge',
    rows: [
      row('Knowledge documents per bot', '100', '500', 'Custom'),
      { label: 'Custom tools', values: all },
      { label: 'Web search', values: proUp },
    ],
  },
  {
    group: 'Customer memory',
    rows: [
      { label: 'Cross-channel customer identity', values: all },
      { label: 'Shared conversation history', values: all },
      { label: 'Human handoff', values: all },
    ],
  },
  {
    group: 'Channels',
    rows: [
      { label: 'Website chat', values: all },
      { label: 'Telegram', values: all },
      { label: 'Discord', values: all },
      { label: 'WhatsApp', values: all },
      { label: 'Facebook Messenger', values: all },
      { label: 'Instagram', values: all },
      { label: 'Email', values: all },
    ],
  },
  {
    group: 'Integrations',
    rows: [
      { label: 'Shopify', values: all },
      { label: 'WooCommerce', values: all },
      { label: 'WordPress', values: all },
      { label: 'HubSpot', values: proUp },
      { label: 'Zendesk', values: proUp },
      { label: 'Slack', values: proUp },
      { label: 'Microsoft Teams', values: proUp },
    ],
  },
  {
    group: 'Developer',
    rows: [
      row('REST API', 'Limited', 'Full', 'Full'),
      { label: 'Webhooks', values: proUp },
    ],
  },
  {
    group: 'Analytics',
    rows: [{ label: 'Conversation analytics', values: all }],
  },
  {
    group: 'Token add-ons',
    rows: [
      row('Extra tokens', '$8 / 1M', '$6 / 1M', 'Custom'),
      row('Maximum add-on', '+5M / month', '+30M / month', 'Unlimited tokens'),
    ],
  },
  {
    group: 'Support',
    rows: [row('Support', 'Email', 'Priority', 'Dedicated')],
  },
];

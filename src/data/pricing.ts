import { SITE } from './site';

/**
 * Plans. Everything marked PLACEHOLDER is a stand-in until pricing is
 * confirmed: the prices, the limits, and which features sit in which tier.
 * Search the repo for "PLACEHOLDER" before launch.
 *
 * Features only name capabilities that are live today. The Premium/Pro split
 * follows the existing demo copy: "Premium covers the core support features —
 * Pro mainly adds advanced automation."
 */
export type Billing = 'monthly' | 'yearly';

export interface Plan {
  id: string;
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
    blurb: 'For trying Truplexy on your own channels before you commit.',
    price: { monthly: 0, yearly: 0 },
    limits: ['100 AI conversations / month', '1 team seat'], // PLACEHOLDER
    includes: 'Includes',
    features: [
      // PLACEHOLDER — tier contents. Keep memory, inbox and handoff here:
      // the section lede says every plan includes them.
      'Website chat, Telegram, Discord & Email',
      'Cross-channel memory',
      'Unified inbox',
      'Human handoff with full context',
    ],
    cta: { label: 'Start for free', href: SITE.signupUrl },
  },
  {
    id: 'premium',
    name: 'Premium',
    blurb: 'For small teams putting AI support on every channel their customers use.',
    price: { monthly: 49, yearly: 39 }, // PLACEHOLDER
    featured: true,
    limits: ['1,000 AI conversations / month', '3 team seats'], // PLACEHOLDER
    includes: 'Everything in Free, plus',
    features: [
      // PLACEHOLDER — tier contents
      'WhatsApp, Messenger & Instagram',
      'AI summaries and intent',
      'Slack & Microsoft Teams',
    ],
    cta: { label: 'Get started', href: SITE.signupUrl },
  },
  {
    id: 'pro',
    name: 'Pro',
    blurb: 'For growing teams that want Truplexy to take action and plug into their own systems.',
    price: { monthly: 149, yearly: 119 }, // PLACEHOLDER
    limits: ['5,000 AI conversations / month', '10 team seats'], // PLACEHOLDER
    includes: 'Everything in Premium, plus',
    features: [
      // PLACEHOLDER — tier contents
      'Automations',
      'Shopify, WooCommerce, HubSpot & Zendesk',
      'REST API & webhooks',
      'Custom integrations',
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

import { SITE } from './site';

/**
 * Plans. Everything marked PLACEHOLDER is a stand-in until pricing is
 * confirmed: the prices, the limits, and which features sit in which tier.
 * Search the repo for "PLACEHOLDER" before launch.
 *
 * Features only name capabilities that are live today. The Starter/Pro split
 * follows the existing demo copy: "Starter covers the core support features —
 * Pro mainly adds advanced automation."
 */
export interface Plan {
  id: string;
  name: string;
  blurb: string;
  /** Display price, e.g. "$49". Free text so "Custom" works. */
  price: string;
  period?: string;
  featured?: boolean;
  limits: string[];
  /** Heading above the feature list, e.g. "Everything in Starter, plus". */
  includes: string;
  features: string[];
  cta: { label: string; href: string };
}

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'For small teams putting AI support on their channels for the first time.',
    price: '$49', // PLACEHOLDER
    period: 'per month',
    limits: ['1,000 AI conversations / month', '3 team seats'], // PLACEHOLDER
    includes: 'Includes',
    features: [
      // PLACEHOLDER — tier contents
      'Website chat, WhatsApp, Messenger, Instagram, Telegram, Discord & Email',
      'Cross-channel memory',
      'Unified inbox',
      'Human handoff with full context',
      'AI summaries and intent',
    ],
    cta: { label: 'Get started', href: SITE.signupUrl },
  },
  {
    id: 'pro',
    name: 'Pro',
    blurb: 'For growing teams that want Truplexy to take action, not just answer.',
    price: '$149', // PLACEHOLDER
    period: 'per month',
    featured: true,
    limits: ['5,000 AI conversations / month', '10 team seats'], // PLACEHOLDER
    includes: 'Everything in Starter, plus',
    features: [
      // PLACEHOLDER — tier contents
      'Automations',
      'Shopify, WooCommerce, HubSpot & Zendesk',
      'Slack & Microsoft Teams',
    ],
    cta: { label: 'Get started', href: SITE.signupUrl },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    blurb: 'For high volumes and setups built around your own systems.',
    price: 'Custom', // PLACEHOLDER
    limits: ['Custom conversation volume', 'Unlimited team seats'], // PLACEHOLDER
    includes: 'Everything in Pro, plus',
    features: [
      // PLACEHOLDER — tier contents
      'REST API',
      'Webhooks',
      'Custom integrations',
    ],
    cta: { label: 'Book a demo', href: SITE.demoUrl },
  },
];

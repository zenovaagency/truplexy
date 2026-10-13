import { TRIAL_DAYS } from './pricing';
import { SITE } from './site';

/**
 * Facts the Terms, Privacy Notice and Refund Policy share. Everything marked
 * PLACEHOLDER is a stand-in until the real value is confirmed — search the
 * repo for "PLACEHOLDER" before launch. The pages render these values as
 * written, so an unfilled one is visible on the page, not hidden.
 *
 * Zenova Agency is not a registered company yet. When it is, put the
 * registered name and number in `entity`, the registered office in `address`,
 * bump `updated`, and re-check the name on the Paddle account.
 */
export const LEGAL = {
  /** The business that operates Truplexy and contracts with customers. */
  entity: 'Zenova Agency',
  entityUrl: 'https://zenova.agency',
  entityHost: 'zenova.agency',
  /** City and country only: there is no registered office yet. */
  address: 'Gazipur, Bangladesh',
  /** Law that governs the Terms, and where disputes are heard. */
  law: 'Bangladesh',
  courts: 'Gazipur, Bangladesh',
  /** Both use the site's contact inbox (`SITE.email`). */
  privacyEmail: SITE.email,
  supportEmail: SITE.email,
  /** Truplexy is for businesses, so account holders must be adults. */
  minimumAge: '18',
  /** Shown as "Last updated". Bump it whenever a policy changes. */
  updated: '14 October 2026',
  /** Length of the free trial on Starter and Pro (from pricing.ts). */
  trialDays: TRIAL_DAYS,
  /** Refund window for the first payment on a paid plan, in days. */
  refundWindowDays: 14,
  /** Checkout provider and Merchant of Record. */
  paddle: {
    name: 'Paddle',
    entity: 'Paddle.com Market Limited',
    terms: 'https://www.paddle.com/legal/checkout-buyer-terms',
    privacy: 'https://www.paddle.com/legal/privacy',
    help: 'https://www.paddle.com/help',
  },
} as const;

/** Every page links the other two, so a reader can find all three. */
export const LEGAL_PAGES = [
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Privacy Notice', href: '/privacy' },
  { label: 'Refund Policy', href: '/refunds' },
] as const;

/**
 * Site-wide facts. Everything marked PLACEHOLDER is a stand-in until the real
 * value is confirmed — search the repo for "PLACEHOLDER" before launch.
 * `url` is the one place the domain is set: astro.config.mjs (`site`),
 * canonical URLs, robots.txt and the sitemap all read it.
 */
const email = 'hello@truplexy.com'; // PLACEHOLDER — real inbox

export const SITE = {
  name: 'Truplexy',
  url: 'https://truplexy.com',
  title: 'Truplexy — AI Customer Support. Every Channel, One Platform.',
  description:
    'Truplexy is an independent AI customer support platform. It puts a human-like AI assistant on every channel you already use — website, WhatsApp, Instagram, Telegram, Discord, email and your own apps — and gives your team one platform to manage every conversation.',
  tagline: 'Every channel. One platform.',
  email,
  // The dashboard, served by the `dashboard` service in vercel.json.
  dashboardUrl: 'https://app.truplexy.com',
  // Create an account in the dashboard. Plan buttons use `signupHref` (pricing.ts) to carry a plan through.
  signupUrl: 'https://app.truplexy.com/sign-in?mode=signup',
  // PLACEHOLDER — swap for the real booking link (Calendly, Cal.com, …).
  demoUrl: `mailto:${email}?subject=${encodeURIComponent('Book a Truplexy demo')}`,
} as const;

export interface NavLink {
  label: string;
  href: string;
  blurb?: string;
}

/** What Truplexy does, as sections of the home page. */
export const PRODUCT_LINKS: NavLink[] = [
  { label: 'Human-like AI', href: '#features', blurb: 'Replies with the right tone, and no canned loops' },
  { label: 'Live demo', href: '#demo', blurb: 'Watch a conversation end in a handoff' },
  { label: 'Smart handoff', href: '#handoff', blurb: 'Your team steps in with the conversation and context' },
  { label: 'Unified inbox', href: '#inbox', blurb: 'Every conversation and ticket in one place' },
];

export const DOCS_LINKS: NavLink[] = [
  { label: 'Documentation', href: '/docs', blurb: 'Setup guides for every channel' },
  { label: 'Quickstart', href: '/docs#quickstart', blurb: 'From sign-up to first reply' },
  { label: 'Website chat SDK', href: '/docs/web-sdk', blurb: 'A chat widget for any site' },
  { label: 'REST API', href: '/docs/api', blurb: 'Connect a platform of your own' },
  { label: 'Webhooks', href: '/docs/webhooks', blurb: 'Signed events when your team replies' },
];

export const CHANGELOG_HREF = '/changelog';

export type NavMenu = 'product' | 'channels' | 'resources';

/**
 * The nav bar. A menu opens a dropdown; `match` lists the paths that mark
 * the item as the current section.
 */
export const NAV: { label: string; href: string; menu?: NavMenu; match: string[] }[] = [
  { label: 'Product', href: '/', menu: 'product', match: [] },
  { label: 'Channels', href: '/channels', menu: 'channels', match: ['/channels'] },
  { label: 'Resources', href: '/docs', menu: 'resources', match: ['/docs', CHANGELOG_HREF] },
  { label: 'Pricing', href: '/pricing', match: ['/pricing'] },
];

/** The site's main pages, for flat lists (404). */
export const PAGES: NavLink[] = [
  { label: 'Channels', href: '/channels' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Docs', href: '/docs' },
  { label: 'Changelog', href: CHANGELOG_HREF },
];

/**
 * Resolves a link for the page it's rendered on. Section anchors only
 * exist on the home page, so everywhere else they point back to it.
 */
export function navHref(href: string, onHome: boolean) {
  return href.startsWith('#') && !onHome ? `/${href}` : href;
}

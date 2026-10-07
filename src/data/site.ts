/**
 * Site-wide facts. Everything marked PLACEHOLDER is a stand-in until the real
 * value is confirmed — search the repo for "PLACEHOLDER" before launch.
 * `url` must also be mirrored in astro.config.mjs (`site`) and
 * public/robots.txt.
 */
const email = 'hello@truplexy.com'; // PLACEHOLDER — real inbox

export const SITE = {
  name: 'Truplexy',
  url: 'https://zenovasolution.xyz',
  title: 'Truplexy — One conversation. Everywhere.',
  description:
    'Truplexy is the AI customer-support layer that keeps one continuous, human-like conversation going across your website, Telegram, Discord and your own apps — with smart handoff to your team when it matters.',
  tagline: 'One conversation. Everywhere.',
  email,
  // The dashboard, served by the `dashboard` service in vercel.json.
  dashboardUrl: 'https://app.zenovasolution.xyz',
  // PLACEHOLDER — swap for the real sign-up flow.
  signupUrl: `mailto:${email}?subject=${encodeURIComponent('Get started with Truplexy')}`,
  // PLACEHOLDER — swap for the real booking link (Calendly, Cal.com, …).
  demoUrl: `mailto:${email}?subject=${encodeURIComponent('Book a Truplexy demo')}`,
} as const;

/** Home-page sections in page order, then the standalone pages. */
export const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'Try it', href: '#try' },
  { label: 'Channels', href: '#channels' },
  { label: 'Continuity', href: '#continuous' },
  { label: 'Pricing', href: '/pricing' },
] as const;

/**
 * Resolves a NAV href for the page it's rendered on. Section anchors only
 * exist on the home page, so everywhere else they point back to it.
 */
export function navHref(href: string, onHome: boolean) {
  return href.startsWith('#') && !onHome ? `/${href}` : href;
}

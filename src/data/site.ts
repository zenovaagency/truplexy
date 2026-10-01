/**
 * Site-wide facts. Everything marked PLACEHOLDER is a stand-in until the real
 * value is confirmed — search the repo for "PLACEHOLDER" before launch.
 * `url` must also be mirrored in astro.config.mjs (`site`) and
 * public/robots.txt.
 */
const email = 'hello@truplexy.com'; // PLACEHOLDER — real inbox

export const SITE = {
  name: 'Truplexy',
  url: 'https://truplexy.com', // PLACEHOLDER — confirmed production domain
  title: 'Truplexy — One conversation. Everywhere.',
  description:
    'Truplexy is the AI customer-support layer that keeps one continuous, human-like conversation going across your website, Telegram, Discord and your own apps — with smart handoff to your team when it matters.',
  tagline: 'One conversation. Everywhere.',
  email,
  // PLACEHOLDER — swap for the real sign-up flow.
  signupUrl: `mailto:${email}?subject=${encodeURIComponent('Get started with Truplexy')}`,
  // PLACEHOLDER — swap for the real booking link (Calendly, Cal.com, …).
  demoUrl: `mailto:${email}?subject=${encodeURIComponent('Book a Truplexy demo')}`,
} as const;

/** In-page sections, in page order. */
export const NAV = [
  { label: 'How it works', href: '#journey' },
  { label: 'Continuity', href: '#continuous' },
  { label: 'Channels', href: '#channels' },
  { label: 'Inbox', href: '#inbox' },
  { label: 'Handoff', href: '#handoff' },
] as const;

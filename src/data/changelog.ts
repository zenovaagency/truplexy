/**
 * Product changelog, newest first. Each entry is something a customer can
 * see or use; site-only and internal changes stay out.
 */
export type ChangeTag = 'SDK' | 'Dashboard' | 'Channels' | 'Pricing';

export interface ChangeEntry {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  title: string;
  tag: ChangeTag;
  items: string[];
}

export const CHANGELOG: ChangeEntry[] = [
  {
    date: '2026-10-12',
    title: 'Web search sources and tickets that stay open',
    tag: 'SDK',
    items: [
      'When the assistant searches the web, the chat widget links the pages it used under its reply.',
      'Inactive tickets now close on their own. Set keepTicketsOpen in the server route, or the same setting in the WordPress plugin, to keep them open.',
      'Released as 0.4.3 of the web, React, Vue and server packages.',
    ],
  },
  {
    date: '2026-10-12',
    title: 'A page and a setup guide for every channel',
    tag: 'Channels',
    items: [
      'Each channel has its own overview at /channels, with a sample conversation drawn in that platform’s look.',
      'Each channel has a step-by-step setup guide in the docs, with server code for every supported language.',
      'WordPress joins the channel list.',
    ],
  },
  {
    date: '2026-10-10',
    title: 'Customers',
    tag: 'Dashboard',
    items: [
      'A new Customers page with search, a contacts editor and a detail panel.',
      'A customer can have any number of contacts (email, phone, Discord or any platform ID), so their history follows them across channels.',
      'Tickets show who they’re from, and the ticket queue can be filtered by customer.',
    ],
  },
  {
    date: '2026-10-09',
    title: 'Visitor details and the business profile in the chat widget',
    tag: 'SDK',
    items: [
      'The widget asks for the visitor’s name and email and opens a ticket named after them on the first message. Set details="off" or tickets: false to turn it off.',
      'The widget header uses your business name and logo unless you set heading or avatar.',
      'Released as 0.2.0 of the web, React, Vue and server packages.',
    ],
  },
  {
    date: '2026-10-09',
    title: 'Website chat SDK',
    tag: 'SDK',
    items: [
      'A drop-in <truplexy-chat> widget for any site: no dependencies, Shadow DOM, about 12 KB gzipped.',
      'React and Vue wrappers, a server route for Node and any Fetch runtime, and a WordPress plugin.',
      'Team replies arrive in real time, and the browser never sees your chat key.',
    ],
  },
  {
    date: '2026-10-07',
    title: 'AI ticket summaries',
    tag: 'Dashboard',
    items: [
      'Escalated tickets get a Generate summary button. The summary sits at the top of the conversation.',
      'A hint shows when newer messages have arrived, so you know when to regenerate.',
      'Ticket statuses are now simply open and closed.',
    ],
  },
  {
    date: '2026-10-07',
    title: 'Plans and pricing',
    tag: 'Pricing',
    items: [
      'Free, Starter ($29 a month) and Pro ($79 a month), with 20% off when billed yearly.',
      'A dedicated pricing page with the full feature comparison and token add-ons.',
    ],
  },
];

export const formatChangeDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

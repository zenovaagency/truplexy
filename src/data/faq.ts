import { LEGAL } from './legal';
import { PLANS, PRICED, TRIAL_DAYS } from './pricing';
import { channelsIn, listNames } from './channels';

/**
 * Buyer questions for the home page FAQ. The same text feeds the visible
 * answers and the FAQPage JSON-LD, so the two always match. Every answer
 * restates something the product, the pricing data or the legal pages
 * already say: keep it that way when editing.
 */
const liveMessaging = listNames(channelsIn('messaging').filter((c) => c.status === 'live'));
const price = (id: string) => PRICED.find((p) => p.id === id)!.price.monthly;
const enterprise = PLANS.find((p) => p.id === 'enterprise')!;

export interface Faq {
  q: string;
  /** Plain text, used as is in the JSON-LD. */
  a: string;
  /** Optional link shown under the answer. */
  link?: { href: string; label: string };
}

export const FAQS: Faq[] = [
  {
    q: 'How long does setup take?',
    a: 'Most of setup is connecting your channels and adding your knowledge. WhatsApp, Messenger, Instagram, Discord, Shopify and other platforms connect in one click from the dashboard; the website chat is a short snippet or a WordPress plugin. How long the rest takes depends on how much knowledge you add, such as help articles, policies and product details.',
    link: { href: '/docs#quickstart', label: 'Read the quickstart' },
  },
  {
    q: 'Which channels does Truplexy work on?',
    a: `${liveMessaging}. It also connects to Shopify, WooCommerce, WordPress, HubSpot and Zendesk, sends handoffs to Slack and Microsoft Teams, and has a REST API and webhooks for your own apps.`,
    link: { href: '/channels', label: 'See every channel' },
  },
  {
    q: 'How accurate are the AI’s answers?',
    a: 'The assistant answers from the knowledge you give it, and can show customers the sources an answer came from. When it can’t find a reliable answer it says so, asks a clarifying question, or offers a person instead of guessing. AI replies can still be wrong, so your team can read and correct any conversation and decide when a person takes over.',
  },
  {
    q: 'What happens when a customer needs a person?',
    a: 'The assistant hands the conversation to your team with the full history and context, in the same unified inbox. A teammate takes over in one click and the customer keeps talking on the channel they started on.',
  },
  {
    q: 'What do you do with our data and our customers’ data?',
    a: `You decide what goes into Truplexy, and we process your customers’ conversations on your behalf. To write a reply, only the relevant part of the conversation and the knowledge passages needed are sent to the AI model provider. ${LEGAL.entity} does not train AI models on your content or your customers’ conversations, and does not sell personal data. Connections are encrypted (HTTPS) and platform access tokens are stored encrypted.`,
    link: { href: '/privacy', label: 'Read the Privacy Notice' },
  },
  {
    q: 'How much does it cost?',
    a: `Starter is $${price('starter')} a month and Pro is $${price('pro')} a month, or less when billed yearly. Both start with a ${TRIAL_DAYS}-day free trial. Enterprise is priced to your volume: ${enterprise.cta.label.toLowerCase()} for a quote. Prices are in US dollars, excluding any sales tax or VAT.`,
    link: { href: '/pricing', label: 'Compare plans' },
  },
  {
    q: 'Can I cancel at any time?',
    a: `Yes. Cancel the free trial before it ends and you aren’t charged. A paid plan can be cancelled any time in the dashboard: it stops the next renewal and you keep access until the end of the period you paid for. Your first payment on a paid plan has a ${LEGAL.refundWindowDays}-day refund.`,
    link: { href: '/refunds', label: 'Read the Refund Policy' },
  },
  {
    q: 'Do I need a developer?',
    a: 'No. Channels connect from the dashboard, and the website chat can go on with a snippet or the WordPress plugin. Developers can go further with the REST API, webhooks and custom tools that let the assistant look things up in your own systems.',
    link: { href: '/docs', label: 'Read the documentation' },
  },
];

/** The FAQPage node for the home page's JSON-LD. */
export const faqSchema = (pageUrl: string) => ({
  '@type': 'FAQPage',
  '@id': `${pageUrl}#faq`,
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
});

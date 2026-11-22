import type { KnowledgeSite, SitePage } from '@/lib/api/types';

/* Websites a bot learns from, for demo mode. The demo can't fetch other sites, so mapping "finds" a typical small
   business site under the address given, and each page's text is written from its address. */

export type MockSitePage = SitePage & { /** The sync that last checked it. */ checked_at?: string };
export type MockSite = Omit<KnowledgeSite, 'counts' | 'max_pages'> & {
  tenant_id: string;
  bot_id: string;
  pages: MockSitePage[];
  /** When the running sync started; pages checked before it are pending. */
  sync_started_at?: string;
};

export const SITE_MAX_PAGES = 500;

/** Paths a typical support-heavy business site has, with the text a page would show. */
const PAGES: [path: string, title: string, text: string][] = [
  ['/', 'Home', 'We make everyday things that last. Free shipping on orders over $50, and 30-day returns on everything.'],
  ['/help', 'Help centre', 'Find answers about orders, shipping, returns, payments and your account, or contact our team.'],
  ['/help/shipping', 'Shipping', 'Orders ship within 1–2 business days. Standard delivery takes 3–5 business days; express takes 1–2. Shipping is free over $50.'],
  ['/help/returns', 'Returns and refunds', 'You can return any unused item within 30 days for a full refund. Start a return from your order page; refunds reach your card in 5–10 days.'],
  ['/help/orders/track', 'Track your order', 'Every order gets a tracking link by email as soon as it ships. You can also find it under Orders in your account.'],
  ['/help/orders/change', 'Change or cancel an order', 'Orders can be changed or cancelled within one hour of placing them. After that, return the items once they arrive.'],
  ['/help/payments', 'Payments', 'We accept Visa, Mastercard, American Express, PayPal, Apple Pay and Google Pay. Prices include VAT where it applies.'],
  ['/help/warranty', 'Warranty', 'Every product carries a two-year warranty against defects. Send us a photo of the problem and your order number.'],
  ['/help/account', 'Your account', 'Create an account to track orders, save addresses and reorder in one click. You can delete your account at any time.'],
  ['/pricing', 'Pricing', 'Simple prices with no hidden fees. Subscribe and save 10% on refills, cancel any time.'],
  ['/about', 'About us', 'A small team in Lisbon designing durable products since 2016.'],
  ['/contact', 'Contact us', 'Email support@example.com or chat with us, Monday to Friday, 9:00–18:00 CET. We answer within one business day.'],
  ['/blog/care-guide', 'How to care for your products', 'Wipe with a damp cloth, avoid the dishwasher, and dry fully before storing. Oil wooden parts twice a year.'],
  ['/blog/size-guide', 'Size guide', 'Measure your chest and waist and compare with the table. Between two sizes, pick the larger one.'],
  ['/privacy', 'Privacy policy', 'We only collect what we need to deliver your order, and never sell your data.'],
  ['/terms', 'Terms of service', 'These terms apply to every purchase made on our website.'],
  ['/login', 'Sign in', ''],
  ['/cart', 'Cart', ''],
  ['/search', 'Search', ''],
  ['/blog/tag/news', 'News', ''],
  ['/blog/page/2', 'Blog – page 2', ''],
];

/** Why a page starts unticked, mirroring the API's rules. */
export function junkReason(path: string): string | undefined {
  const first = path.split('/').filter(Boolean)[0] ?? '';
  if (['login', 'signin', 'sign-in', 'register', 'account', 'my-account'].includes(first)) return 'Sign-in page';
  if (['cart', 'basket', 'checkout'].includes(first)) return 'Cart or checkout';
  if (first === 'search' || /[?&](q|s|search)=/.test(path)) return 'Search results';
  if (/\/(tag|tags|category|author)\//.test(path)) return 'Tag or category archive';
  if (/\/page\/\d+\/?$/.test(path)) return 'A page of a list';
  return undefined;
}

/** The pages mapping "finds" under `root` (a site, or a section of one such as /help). */
export function mapPages(root: URL): MockSitePage[] {
  const base = root.pathname.replace(/\/+$/, '');
  return PAGES.filter(([path]) => !base || path === base || path.startsWith(`${base}/`)).map(([path, title]) => ({
    url: `${root.origin}${path}`,
    title,
    selected: false,
    junk_reason: junkReason(path),
    status: 'new',
  }));
}

/** The Markdown a page is indexed with. */
export function pageText(url: string): string {
  const path = new URL(url).pathname;
  const page = PAGES.find(([p]) => p === path);
  return page ? `# ${page[1]}\n\n${page[2] || 'This page has no text to learn from.'}` : `# ${path}\n\nA page of the website.`;
}

export function siteCounts(s: MockSite): KnowledgeSite['counts'] {
  const counts = { total: s.pages.length, selected: 0, indexed: 0, failed: 0, skipped: 0, gone: 0, pending: 0 };
  for (const p of s.pages) {
    if (p.selected) counts.selected++;
    if (p.status === 'indexed') counts.indexed++;
    if (p.status === 'failed') counts.failed++;
    if (p.status === 'skipped') counts.skipped++;
    if (p.status === 'gone') counts.gone++;
    if (s.status === 'syncing' && p.selected && (!p.checked_at || (s.sync_started_at && p.checked_at < s.sync_started_at))) counts.pending++;
  }
  return counts;
}

export const siteOut = ({ tenant_id: _t, bot_id: _b, pages: _p, sync_started_at: _s, ...rest }: MockSite, s: MockSite): KnowledgeSite => ({
  ...rest,
  counts: siteCounts(s),
  max_pages: SITE_MAX_PAGES,
});

export const pageOut = ({ checked_at: _c, ...p }: MockSitePage): SitePage => p;

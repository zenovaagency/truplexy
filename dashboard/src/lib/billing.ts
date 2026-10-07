import type { AddonQuote, Business, LedgerKind, TokenAddon } from '@/lib/api/types';
import { formatDate } from '@/lib/format';

/**
 * What `millions` extra tokens cost on a plan's slider. Graduated, like tax
 * brackets: each million costs its own tier's price, so buying more never
 * costs less in total. Matches GET /billing/token-addons/quote.
 */
export function quoteTokens(a: TokenAddon, millions: number): AddonQuote {
  const breakdown: AddonQuote['breakdown'] = [];
  a.tiers.forEach((t, i) => {
    const to = Math.min(millions, (a.tiers[i + 1]?.from_millions ?? Infinity) - 1);
    if (to < t.from_millions) return;
    const n = to - t.from_millions + 1;
    breakdown.push({ from_millions: t.from_millions, to_millions: to, millions: n, price_per_million: t.price_per_million, amount: +(n * t.price_per_million).toFixed(2) });
  });
  const price = +breakdown.reduce((s, b) => s + b.amount, 0).toFixed(2);
  return { millions, tokens: millions * 1_000_000, currency: a.currency, price, average_per_million: millions ? +(price / millions).toFixed(4) : 0, breakdown };
}

/** The monthly limit closest to running out, or null when the plan has none. */
export function planUsage(t: Business) {
  const limits = [
    { unit: 'tokens', used: t.usage.tokens_this_month, limit: t.limits.tokens_per_month },
    { unit: 'replies', used: t.usage.replies_this_month, limit: t.limits.replies_per_month },
  ]
    .filter((l) => l.limit > 0)
    .map((l) => ({ ...l, share: l.used / l.limit }));
  return limits.sort((a, b) => b.share - a.share)[0] ?? null;
}

/** "1st", "10th", "50th". */
export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

/** "October 2026" from "2026-10". */
export const formatMonth = (month: string) => formatDate(`${month}-01T00:00:00Z`, { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const LEDGER_KIND: Record<LedgerKind, { label: string; tone: 'live' | 'warn' | 'accent' | 'neutral' }> = {
  credit: { label: 'Top-up', tone: 'live' },
  debit: { label: 'Debit', tone: 'warn' },
  token_addon: { label: 'Extra tokens', tone: 'accent' },
  overage: { label: 'Reply past tokens', tone: 'neutral' },
};

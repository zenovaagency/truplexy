/** Formatting helpers. Every time from the API is UTC RFC 3339. */

const nf = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export const formatNumber = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));

export const formatCompact = (n: number | null | undefined) => (n == null ? '—' : compact.format(n));

/** USD. Model costs are often fractions of a cent, so small amounts keep more digits. */
export function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  const digits = n === 0 ? 2 : Math.abs(n) < 0.01 ? 4 : Math.abs(n) < 1 ? 3 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** A model price in USD per million tokens: "$0.075", "$1.50", "$15", "Free". */
export function formatPerM(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n === 0) return 'Free';
  return `$${n.toFixed(n < 0.1 ? 3 : n < 100 ? 2 : 0)}`;
}

/** A 0–1 rate as a percentage. */
export function formatPercent(rate: number | null | undefined, digits = 0) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${(rate * 100).toFixed(digits)}%`;
}

/** Seconds as "45s", "12m", "3h 20m", "2d 4h". */
export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export function formatMs(ms: number | null | undefined) {
  if (ms == null) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', opts).format(new Date(iso));
}

export const formatDateTime = (iso: string | null | undefined) =>
  formatDate(iso, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const formatTime = (iso: string | null | undefined) => formatDate(iso, { hour: 'numeric', minute: '2-digit' });

/** "just now", "5 min ago", "yesterday", then a date. */
export function formatRelative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDate(iso);
}

/** Short day label for chart axes: "Oct 3". `date` is YYYY-MM-DD. */
export const formatDay = (date: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

/** YYYY-MM-DD in UTC, as the API reads query dates. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function dayRange(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400_000);
  return { from: isoDay(from), to: isoDay(to) };
}

/** The range of the same length that ends the day before `range.from`. */
export function previousRange(range: { from: string; to: string }) {
  const from = Date.parse(`${range.from}T00:00:00Z`);
  const span = Date.parse(`${range.to}T00:00:00Z`) - from;
  const to = from - 86400_000;
  return { from: isoDay(new Date(to - span)), to: isoDay(new Date(to)) };
}

export function initials(name?: string | null, email?: string | null) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export const pluralize = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** Turns `snake_case`, `dot.case` and `kebab-case` into "Sentence case". */
export function humanize(s: string) {
  const t = s.replace(/[._-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

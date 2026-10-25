import type { ImportStatus, ProductImport, ProductStatus } from '@/lib/api/types';
import type { Tone } from '@/components/ui';

/* The product catalog (API_REFERENCE.md → "Product catalog (2026-10-25)"). */

export const PRODUCT_STATUS: Record<ProductStatus, { label: string; tone: Tone; hint: string }> = {
  active: { label: 'Active', tone: 'live', hint: 'The assistant can find it.' },
  draft: { label: 'Draft', tone: 'neutral', hint: 'Only your team sees it.' },
  archived: { label: 'Archived', tone: 'outline', hint: 'Kept, but no longer sold.' },
};

export const IMPORT_STATUS: Record<ImportStatus, { label: string; tone: Tone }> = {
  uploading: { label: 'Not uploaded', tone: 'warn' },
  processing: { label: 'Reading', tone: 'accent' },
  ready: { label: 'Ready to review', tone: 'violet' },
  failed: { label: 'Failed', tone: 'danger' },
  committed: { label: 'Saved', tone: 'live' },
};

export const IMPORT_METHOD: Record<NonNullable<ProductImport['method']>, string> = {
  csv: 'Read from the columns',
  json: 'Read from the keys',
  json_ld: "Read from the page's product data",
  ai: 'Read with AI — check prices and links',
};

/** The files imports read, with their size limits (the API checks them again). */
export const IMPORT_FILES = ['.csv', '.tsv', '.json', '.txt', '.md', '.pdf', '.docx', '.html'];
const TEXT_MAX = 5 << 20;
const CONVERTED_MAX = 10 << 20;
const CONVERTED = /\.(pdf|docx|html?)$/i;

export function importFileProblem(file: File): string | undefined {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (ext === '.xlsx' || ext === '.xls' || ext === '.numbers') return 'Export the spreadsheet as CSV first, then import the CSV file.';
  if (!IMPORT_FILES.includes(ext) && ext !== '.htm') return `This file type isn't read. Use ${IMPORT_FILES.join(', ')}.`;
  const max = CONVERTED.test(file.name) ? CONVERTED_MAX : TEXT_MAX;
  if (file.size > max) return `This file is over ${max >> 20} MB.`;
  if (!file.size) return 'This file is empty.';
  return undefined;
}

/** Files read by their columns cost nothing; the rest are read with AI. */
export const readsWithAI = (file: File) => !/\.(csv|tsv|json)$/i.test(file.name);

/** "$12.50", "12.50 EUR" for codes Intl doesn't know, "12.50" without a currency, "—" without a price. */
export function formatPrice(price: string | null, currency: string): string {
  if (price === null || price === '') return '—';
  const n = Number(price);
  if (!Number.isFinite(n)) return price;
  if (!currency) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 4 }).format(n);
  } catch {
    return `${price} ${currency}`;
  }
}

/** A price as people type it, as the API stores it, or undefined when it isn't an amount. "" is no price. */
export function parsePrice(input: string): string | null | undefined {
  let s = input.trim().replace(/^[$€£¥₹]\s*/, '').replace(/\s*[$€£¥₹]$/, '').replace(/\s/g, '');
  if (!s) return null;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma > dot && (dot >= 0 || s.length - comma - 1 !== 3)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  return /^\d{1,12}(\.\d{1,4})?$/.test(s) ? s : undefined;
}

export const isLink = (s: string) => {
  if (!s) return true;
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username;
  } catch {
    return false;
  }
};

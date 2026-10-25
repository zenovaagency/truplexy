import type { Product, ProductDraft, ProductImport, PropertyDefinition } from '@/lib/api/types';
import { isLink, parsePrice } from '@/lib/products';
import { PropertyError, normalizeValue } from './properties';

/* The product catalog as the API keeps it, for demo mode: drafts read from a CSV the way the API reads one, and
   sample products standing in for what a model or a shop page would give. */

export type MockProduct = Omit<Product, 'masked_properties'>;
export type MockImport = ProductImport & { tenant_id: string; bot_id: string; items: ProductDraft[] };

const COLUMNS: Record<string, string[]> = {
  name: ['name', 'title', 'product', 'product name', 'item'],
  sku: ['sku', 'variant sku', 'product code', 'code'],
  description: ['description', 'body (html)', 'body', 'details'],
  price: ['price', 'variant price', 'regular price', 'unit price'],
  currency: ['currency', 'currency code'],
  stock: ['stock', 'variant inventory qty', 'inventory', 'quantity', 'qty'],
  url: ['url', 'link', 'product url'],
  image_url: ['image_url', 'image', 'image src', 'image url'],
};

const fieldOf = (header: string) => Object.entries(COLUMNS).find(([, names]) => names.includes(header.trim().toLowerCase()))?.[0];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Splits CSV text into rows; quoted fields may hold the delimiter and doubled quotes. */
function rowsOf(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', '\t'].find((d) => first.split(d).length > first.split(',').length) ?? ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === delimiter) row.push(cell), (cell = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      (row = []), (cell = '');
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** What a draft looks like after checking, as the API builds it. */
export function draftOf(raw: Record<string, string>, extra: Record<string, string>, defs: PropertyDefinition[]): ProductDraft {
  const d: ProductDraft = { name: '', sku: '', description: '', price: null, currency: '', stock: null, url: '', image_url: '', properties: {}, problems: [], exists: false };
  d.name = (raw.name ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!d.name) d.problems.push('It has no name.');
  d.sku = (raw.sku ?? '').trim().slice(0, 64);
  d.description = (raw.description ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 5000);
  if (raw.price) {
    const p = parsePrice(raw.price);
    if (p === undefined) d.problems.push(`The price "${raw.price.slice(0, 40)}" isn't an amount, so it was left out.`);
    else d.price = p;
  }
  if (raw.currency) {
    if (/^[A-Za-z]{3}$/.test(raw.currency.trim())) d.currency = raw.currency.trim().toUpperCase();
    else d.problems.push(`The currency "${raw.currency.slice(0, 20)}" isn't a three-letter code, so it was left out.`);
  }
  if (raw.stock) {
    if (/^\d+$/.test(raw.stock.trim())) d.stock = Number(raw.stock.trim());
    else d.problems.push(`The stock "${raw.stock.slice(0, 20)}" isn't a whole number, so it was left out.`);
  }
  for (const k of ['url', 'image_url'] as const) {
    const v = (raw[k] ?? '').trim();
    if (v && isLink(v)) d[k] = v;
    else if (v) d.problems.push(`The ${k === 'url' ? 'link' : 'image'} "${v.slice(0, 60)}" isn't an http or https link, so it was left out.`);
  }
  for (const def of defs) {
    const v = extra[def.key] ?? extra[slug(def.label)];
    if (!v) continue;
    try {
      const n = normalizeValue(def, v);
      if (n !== null) d.properties[def.key] = n;
    } catch (e) {
      if (e instanceof PropertyError) d.problems.push(`${e.message} It was left out.`);
    }
  }
  return d;
}

/** Reads a CSV file like the API: by its columns, up to 500 products. */
export function readCsv(text: string, defs: PropertyDefinition[]): { items: ProductDraft[]; truncated: boolean } | string {
  const [header, ...rows] = rowsOf(text.replace(/^\ufeff/, ''));
  if (!header || !header.some((h) => fieldOf(h) === 'name')) return 'Name a column name or title so each row’s product has a name.';
  const items: ProductDraft[] = [];
  for (const row of rows) {
    const raw: Record<string, string> = {};
    const extra: Record<string, string> = {};
    header.forEach((h, i) => {
      const v = (row[i] ?? '').trim();
      if (!v) return;
      const f = fieldOf(h);
      if (f) raw[f] ??= v;
      else extra[slug(h)] = v;
    });
    if (!raw.name) continue;
    if (items.length === 500) return { items, truncated: true };
    items.push(draftOf(raw, extra, defs));
  }
  return items.length ? { items, truncated: false } : 'No row has a product name.';
}

/** What a model, or a shop page's product data, would find: a small sample shop, with one rough edge. */
export function sampleDrafts(source: string, defs: PropertyDefinition[]): ProductDraft[] {
  let host = 'shop.example.com';
  try {
    host = new URL(source).host;
  } catch {
    /* a file name */
  }
  const base = `https://${host}`;
  return [
    { name: 'Linen tote bag', sku: 'TOTE-01', price: '24.00', currency: 'USD', stock: '18', url: `${base}/products/linen-tote`, description: 'A roomy tote in washed linen.' },
    { name: 'Ceramic pour-over set', sku: 'POUR-02', price: '39.50', currency: 'USD', stock: '0', url: `${base}/products/pour-over` },
    { name: 'Hand-poured soy candle', sku: 'CNDL-03', price: '18', currency: 'USD', url: `${base}/products/candle`, description: 'Cedar and sage, 40 hours.' },
    { name: 'Gift card', sku: '', price: 'from $25', currency: 'USD', url: `${base}/products/gift-card` },
  ].map((r) => draftOf(r as Record<string, string>, {}, defs));
}

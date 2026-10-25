import type { PropertyDefinition, PropertyEntity, PropertyOption, PropertyType, PropertyValues } from '@/lib/api/types';
import { formatDate, formatNumber } from '@/lib/format';

/* Custom properties: labels, keys, and moving values between the API and form fields. The API checks every
   value again; the checks here only catch mistakes before a round trip. */

export const PROPERTY_TYPES: { value: PropertyType; label: string; hint: string }[] = [
  { value: 'text', label: 'Text', hint: 'A short line, up to 500 characters.' },
  { value: 'long_text', label: 'Long text', hint: 'Notes or an address, up to 5,000 characters.' },
  { value: 'number', label: 'Number', hint: 'Seats, budget, a count.' },
  { value: 'boolean', label: 'Yes / no', hint: 'A switch, such as VIP.' },
  { value: 'date', label: 'Date', hint: 'A day, such as a birthday.' },
  { value: 'select', label: 'Single choice', hint: 'One of a list you define.' },
  { value: 'multi_select', label: 'Multiple choice', hint: 'Any of a list you define.' },
  { value: 'email', label: 'Email', hint: 'An email address.' },
  { value: 'phone', label: 'Phone', hint: 'A phone number.' },
  { value: 'url', label: 'Link', hint: 'An http or https address.' },
];

export const PROPERTY_TYPE_LABEL = Object.fromEntries(PROPERTY_TYPES.map((t) => [t.value, t.label])) as Record<PropertyType, string>;

export const ENTITY_LABEL: Record<PropertyEntity, { one: string; many: string }> = {
  customer: { one: 'customer', many: 'Customers' },
  product: { one: 'product', many: 'Products' },
};

export const hasOptions = (t: PropertyType) => t === 'select' || t === 'multi_select';

/** Keys the API keeps for fields records already have. */
export const RESERVED_KEYS = new Set([
  'id', 'name', 'email', 'phone', 'status', 'type', 'metadata', 'properties', 'contacts', 'created_at', 'updated_at', 'deleted_at',
  'tenant_id', 'bot_id', 'customer_id', 'conversation_id', 'ticket_id', 'sku', 'price', 'currency', 'stock', 'url', 'image_url',
  'description', 'subject', 'number', 'source',
]);

export const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
export const MAX_PROPERTIES = 50;

/** A key from a label: "Loyalty tier" → loyalty_tier. */
export function keyFromLabel(label: string): string {
  const slug = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9_]+/, '');
  return slug.slice(0, 40).replace(/_+$/, '');
}

export function keyProblem(key: string): string | undefined {
  if (!key) return 'Give the property a key.';
  if (!KEY_RE.test(key)) return 'Use 1–40 lowercase letters, digits or _, starting with a letter.';
  if (RESERVED_KEYS.has(key)) return `${key} is a built-in field; pick another key.`;
  return undefined;
}

/** An option's value from its label: "Gold tier" → gold_tier; falls back to the label itself. */
export const optionValue = (label: string) => keyFromLabel(label) || label.trim().slice(0, 60);

export function optionsProblem(options: PropertyOption[]): string | undefined {
  if (!options.length) return 'Add at least one option.';
  if (options.length > 100) return 'Keep it to 100 options.';
  const seen = new Set<string>();
  for (const o of options) {
    if (!o.value.trim()) return 'Give every option a name.';
    const k = o.value.trim().toLowerCase();
    if (seen.has(k)) return `“${o.label || o.value}” is listed twice.`;
    seen.add(k);
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

/** A form field's value: text for most types, a boolean for yes/no, a list for multiple choice. */
export type FieldValue = string | boolean | string[];

export function toField(def: PropertyDefinition, v: unknown): FieldValue {
  if (def.type === 'boolean') return v === true;
  if (def.type === 'multi_select') return Array.isArray(v) ? v.map(String) : [];
  if (v === undefined || v === null) return '';
  return String(v);
}

/** What to send for a field: null clears it. Numbers stay text; the API reads them. */
export function fromField(def: PropertyDefinition, v: FieldValue): unknown {
  if (def.type === 'boolean') return v === true;
  if (def.type === 'multi_select') return Array.isArray(v) && v.length ? v : null;
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  if (def.type === 'number') {
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : s;
  }
  return s;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A problem worth showing before saving, or undefined. */
export function valueProblem(def: PropertyDefinition, v: FieldValue): string | undefined {
  const empty = Array.isArray(v) ? v.length === 0 : typeof v === 'string' ? !v.trim() : false;
  if (empty) return def.required ? `${def.label} is required.` : undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  switch (def.type) {
    case 'text':
      return s.length > 500 ? 'Keep it to 500 characters.' : undefined;
    case 'long_text':
      return s.length > 5000 ? 'Keep it to 5,000 characters.' : undefined;
    case 'number':
      return Number.isFinite(Number(s.replace(/,/g, ''))) ? undefined : 'Enter a number.';
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? undefined : 'Enter a date as YYYY-MM-DD.';
    case 'email':
      return EMAIL_RE.test(s) ? undefined : 'Enter an email address.';
    case 'phone':
      return /^\+?[0-9]{5,20}$/.test(s.replace(/[\s\-.()]/g, '')) ? undefined : 'Enter 5–20 digits, optionally starting with +.';
    case 'url':
      try {
        const u = new URL(s);
        return u.protocol === 'https:' || u.protocol === 'http:' ? undefined : 'Enter an http or https link.';
      } catch {
        return 'Enter an http or https link.';
      }
  }
  return undefined;
}

/**
 * The changed values only, for a PATCH: keys whose field differs from the stored value, with null for a cleared
 * one. Unchanged keys are left out, so a value the API would no longer accept (a removed option) isn't sent again.
 */
export function changedValues(defs: PropertyDefinition[], stored: PropertyValues, fields: Record<string, FieldValue>): PropertyValues {
  const out: PropertyValues = {};
  for (const d of defs) {
    if (!(d.key in fields)) continue;
    const next = fromField(d, fields[d.key]!);
    const before = stored[d.key] ?? null;
    const same = JSON.stringify(next) === JSON.stringify(d.type === 'boolean' ? before === true : before);
    if (!same) out[d.key] = next;
  }
  return out;
}

/** Every filled field, for a create. An unticked yes/no is left unset, unless the property is required. */
export function filledValues(defs: PropertyDefinition[], fields: Record<string, FieldValue>): PropertyValues {
  const out: PropertyValues = {};
  for (const d of defs) {
    if (!(d.key in fields)) continue;
    const v = fromField(d, fields[d.key]!);
    if (v === null || (v === false && !d.required)) continue;
    out[d.key] = v;
  }
  return out;
}

const optionLabel = (def: PropertyDefinition, v: unknown) => def.options.find((o) => o.value === v)?.label ?? String(v);

/** A stored value in words. */
export function formatValue(def: PropertyDefinition, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  switch (def.type) {
    case 'boolean':
      return v === true ? 'Yes' : 'No';
    case 'number':
      return typeof v === 'number' ? formatNumber(v) : String(v);
    case 'date':
      return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(`${v}T00:00:00`) : String(v);
    case 'select':
      return optionLabel(def, v);
    case 'multi_select':
      return Array.isArray(v) ? v.map((x) => optionLabel(def, x)).join(', ') || '—' : String(v);
  }
  return String(v);
}

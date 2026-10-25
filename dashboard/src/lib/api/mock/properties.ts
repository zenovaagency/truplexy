/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PropertyDefinition, PropertyEntity, PropertyOption, PropertyPreset, PropertyType, PropertyValues } from '@/lib/api/types';
import { KEY_RE, MAX_PROPERTIES, RESERVED_KEYS } from '@/lib/properties';

/* Custom properties as the API keeps them: definition checks, and checking and merging a record's values.
   Errors are messages; the handlers turn them into 400 INVALID_REQUEST. */

export class PropertyError extends Error {}
const bad = (message: string) => new PropertyError(message);

export const PROPERTY_ENTITIES: PropertyEntity[] = ['customer'];
const TYPES: PropertyType[] = ['text', 'long_text', 'number', 'boolean', 'date', 'select', 'multi_select', 'email', 'phone', 'url'];
const withOptions = (t: PropertyType) => t === 'select' || t === 'multi_select';

export type MockProperty = PropertyDefinition & { tenant_id: string; bot_id: string };

function cleanOptions(type: PropertyType, raw: unknown): PropertyOption[] {
  const list = raw === undefined ? [] : raw;
  if (!Array.isArray(list)) throw bad('options must be a list of {value, label}.');
  if (!withOptions(type)) {
    if (list.length) throw bad('Only select and multi_select properties have options.');
    return [];
  }
  if (!list.length || list.length > 100) throw bad(`Give a ${type} property 1–100 options.`);
  const seen = new Set<string>();
  return list.map((o: any) => {
    const value = String(o?.value ?? '').trim();
    const label = String(o?.label ?? '').trim().replace(/\s+/g, ' ') || value;
    if (!value || value.length > 60) throw bad('Give each option a value of 1–60 characters.');
    if (label.length > 60) throw bad("Keep each option's label to 60 characters.");
    if (seen.has(value.toLowerCase())) throw bad(`Each option value can be listed once: ${value} is repeated.`);
    seen.add(value.toLowerCase());
    return { value, label };
  });
}

/** Checks a POST body against the entity's existing properties. */
export function newDefinition(b: any, existing: MockProperty[]): Omit<MockProperty, 'id' | 'tenant_id' | 'bot_id' | 'created_at' | 'updated_at'> {
  if (!PROPERTY_ENTITIES.includes(b.entity)) throw bad(`Set entity to one of ${PROPERTY_ENTITIES.join(', ')}.`);
  if (b.scope_id) throw bad(`Leave scope_id out: ${b.entity} properties belong to every ${b.entity}.`);
  const key = String(b.key ?? '').trim();
  if (!KEY_RE.test(key)) throw bad('Set key to 1–40 lowercase letters, digits or underscores, starting with a letter, such as loyalty_tier.');
  if (RESERVED_KEYS.has(key)) throw bad(`${key} is a built-in field; pick another key.`);
  if (!TYPES.includes(b.type)) throw bad(`Set type to one of ${TYPES.join(', ')}.`);
  const same = existing.filter((d) => d.entity === b.entity);
  if (same.length >= MAX_PROPERTIES) throw bad(`A ${b.entity} can have up to ${MAX_PROPERTIES} properties; delete one first.`);
  const d = {
    entity: b.entity as PropertyEntity,
    key,
    type: b.type as PropertyType,
    label: '',
    description: '',
    options: [] as PropertyOption[],
    required: false,
    sensitive: false,
    sort_order: Number.isInteger(b.sort_order) ? b.sort_order : same.reduce((m, x) => Math.max(m, x.sort_order + 1), 0),
  };
  changeDefinition(d, b);
  return d;
}

/** Applies a PATCH (or the rest of a POST) to a definition. */
export function changeDefinition(d: Pick<PropertyDefinition, 'entity' | 'key' | 'type' | 'label' | 'description' | 'options' | 'required' | 'sensitive' | 'sort_order' | 'scope_id'>, b: any) {
  if ((b.entity !== undefined && b.entity !== d.entity) || (b.scope_id !== undefined && (b.scope_id || undefined) !== d.scope_id)) {
    throw bad('A property can’t move to another entity; delete it and add a new one.');
  }
  if (b.key !== undefined && b.key !== d.key) throw bad("A property's key can't change, since records store their values under it.");
  if (b.type !== undefined && b.type !== d.type) throw bad("A property's type can't change, since records store values of that type; add a new property instead.");
  if (b.label !== undefined) d.label = String(b.label).trim().replace(/\s+/g, ' ');
  if (b.description !== undefined) d.description = String(b.description).trim();
  if (b.options !== undefined) d.options = b.options;
  if (b.required !== undefined) d.required = b.required === true;
  if (b.sensitive !== undefined) d.sensitive = b.sensitive === true;
  if (b.sort_order !== undefined) d.sort_order = b.sort_order;
  if (!d.label || d.label.length > 60) throw bad('Give the property a label of 1–60 characters.');
  if (d.description.length > 300) throw bad('Keep the description to 300 characters.');
  if (!Number.isInteger(d.sort_order) || d.sort_order < 0 || d.sort_order > 10000) throw bad('sort_order is from 0 to 10000.');
  d.options = cleanOptions(d.type, d.options);
}

function option(d: PropertyDefinition, s: string) {
  const t = s.trim();
  return d.options.find((o) => o.value === t) ?? d.options.find((o) => o.value.toLowerCase() === t.toLowerCase() || o.label.toLowerCase() === t.toLowerCase());
}

/** One value in its stored form, or null for empty. */
export function normalizeValue(d: PropertyDefinition, v: unknown): unknown {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length && d.type === 'multi_select')) return null;
  const s = typeof v === 'string' ? v.trim() : undefined;
  switch (d.type) {
    case 'text':
    case 'long_text': {
      const limit = d.type === 'text' ? 500 : 5000;
      if (s === undefined) throw bad(`${d.label}: send text.`);
      const out = d.type === 'text' ? s.replace(/\s+/g, ' ') : s;
      if (out.length > limit) throw bad(`${d.label}: keep it to ${limit} characters.`);
      return out;
    }
    case 'number': {
      const n = typeof v === 'number' ? v : s !== undefined ? Number(s.replace(/,/g, '')) : NaN;
      if (!Number.isFinite(n) || Math.abs(n) > 1e15) throw bad(`${d.label}: send a number.`);
      return n;
    }
    case 'boolean':
      if (typeof v === 'boolean') return v;
      if (s && ['true', 'yes', 'y', '1'].includes(s.toLowerCase())) return true;
      if (s && ['false', 'no', 'n', '0'].includes(s.toLowerCase())) return false;
      throw bad(`${d.label}: send true or false.`);
    case 'date':
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) || Number.isNaN(Date.parse(s.slice(0, 10)))) throw bad(`${d.label}: send a date as YYYY-MM-DD.`);
      return s.slice(0, 10);
    case 'select': {
      const o = s !== undefined ? option(d, s) : undefined;
      if (!o) throw bad(`${d.label}: "${String(v).slice(0, 60)}" isn't one of its options.`);
      return o.value;
    }
    case 'multi_select': {
      const items = Array.isArray(v) ? v : s !== undefined ? s.split(',').map((x) => x.trim()).filter(Boolean) : null;
      if (!items) throw bad(`${d.label}: send a list of its options.`);
      if (items.length > 20) throw bad(`${d.label}: pick up to 20 options.`);
      const out: string[] = [];
      for (const item of items) {
        const o = typeof item === 'string' ? option(d, item) : undefined;
        if (!o) throw bad(`${d.label}: "${String(item).slice(0, 60)}" isn't one of its options.`);
        if (!out.includes(o.value)) out.push(o.value);
      }
      return out.length ? out : null;
    }
    case 'email': {
      const e = s?.toLowerCase();
      if (!e || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e) || e.length > 254) throw bad(`${d.label}: send an email address such as ann@example.com.`);
      return e;
    }
    case 'phone': {
      const p = (s ?? (typeof v === 'number' ? String(v) : '')).replace(/[\s\-.()]/g, '');
      if (!/^\+?[0-9]{5,20}$/.test(p)) throw bad(`${d.label}: send a number of 5–20 digits, optionally starting with +.`);
      return p;
    }
    case 'url': {
      try {
        const u = new URL(s ?? '');
        if ((u.protocol === 'https:' || u.protocol === 'http:') && !u.username && s!.length <= 2048) return s;
      } catch {
        /* falls through */
      }
      throw bad(`${d.label}: send an http or https link.`);
    }
  }
  throw bad(`${d.label} has an unknown type.`);
}

/** Merges a record's properties patch like the API: sent keys replace, null clears, others stay unchecked. */
export function applyValues(defs: PropertyDefinition[], current: PropertyValues, patch: unknown, creating: boolean): PropertyValues {
  const out: PropertyValues = { ...current };
  if (patch !== undefined) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw bad('Set properties to a JSON object of values by property key.');
    for (const [key, v] of Object.entries(patch)) {
      const d = defs.find((x) => x.key === key);
      if (!d) throw bad(`No property has the key "${key.slice(0, 40)}". Add it under Settings → Properties first.`);
      const value = normalizeValue(d, v);
      if (value === null) {
        if (d.required && !creating) throw bad(`${d.label} is required and can't be cleared.`);
        delete out[key];
      } else out[key] = value;
    }
  }
  if (creating) for (const d of defs) if (d.required && !(d.key in out)) throw bad(`${d.label} is required.`);
  if (JSON.stringify(out).length > 16 * 1024) throw bad("Keep a record's properties to 16 KB.");
  return out;
}

/** The values a reader sees: sensitive ones only with `sensitive`, and only properties that still exist. */
export function visibleValues(defs: PropertyDefinition[], values: PropertyValues | undefined, sensitive: boolean) {
  const properties: PropertyValues = {};
  const masked: string[] = [];
  for (const d of defs) {
    if (!values || !(d.key in values)) continue;
    if (d.sensitive && !sensitive) masked.push(d.key);
    else properties[d.key] = values[d.key];
  }
  return { properties, masked_properties: masked };
}

/** `property[key]=value` filters, as the API reads them. */
export function matchesFilters(defs: PropertyDefinition[], values: PropertyValues | undefined, query: URLSearchParams, sensitive: boolean): boolean {
  for (const [name, raw] of query) {
    const m = /^property\[([a-z][a-z0-9_]{0,39})\]$/.exec(name);
    if (!m) continue;
    const d = defs.find((x) => x.key === m[1]);
    if (!d) throw bad(`No property has the key "${m[1]}".`);
    if (d.sensitive && !sensitive) throw bad(`${d.label} is sensitive; only members who may edit records can filter by it.`);
    if (d.type === 'long_text') throw bad(`${d.label} is long text, which can't be filtered by.`);
    const have = values?.[d.key];
    if (d.type === 'multi_select') {
      const o = option(d, raw);
      if (!o) throw bad(`${d.label}: "${raw}" isn't one of its options.`);
      if (!Array.isArray(have) || !have.includes(o.value)) return false;
      continue;
    }
    const want = normalizeValue(d, raw);
    if (want === null ? have !== undefined : have !== want) return false;
  }
  return true;
}

const opts = (...pairs: string[]) => pairs.flatMap((_, i) => (i % 2 ? [] : [{ value: pairs[i]!, label: pairs[i + 1]! }]));

export const PRESETS: PropertyPreset[] = [
  { entity: 'customer', key: 'company', label: 'Company', description: '', type: 'text', options: [], sensitive: false, business_types: [] },
  { entity: 'customer', key: 'language', label: 'Preferred language', description: '', type: 'text', options: [], sensitive: false, business_types: [] },
  { entity: 'customer', key: 'vip', label: 'VIP', description: 'Gets priority from the team.', type: 'boolean', options: [], sensitive: false, business_types: [] },
  { entity: 'customer', key: 'notes', label: 'Notes', description: '', type: 'long_text', options: [], sensitive: false, business_types: [] },
  { entity: 'customer', key: 'loyalty_tier', label: 'Loyalty tier', description: '', type: 'select', options: opts('bronze', 'Bronze', 'silver', 'Silver', 'gold', 'Gold'), sensitive: false, business_types: ['ecommerce', 'hospitality'] },
  { entity: 'customer', key: 'birthday', label: 'Birthday', description: '', type: 'date', options: [], sensitive: true, business_types: ['ecommerce', 'hospitality'] },
  { entity: 'customer', key: 'shipping_address', label: 'Shipping address', description: '', type: 'long_text', options: [], sensitive: true, business_types: ['ecommerce'] },
  { entity: 'customer', key: 'plan', label: 'Plan', description: '', type: 'select', options: opts('free', 'Free', 'pro', 'Pro', 'enterprise', 'Enterprise'), sensitive: false, business_types: ['saas'] },
  { entity: 'customer', key: 'account_id', label: 'Account ID', description: '', type: 'text', options: [], sensitive: false, business_types: ['saas'] },
  { entity: 'customer', key: 'seats', label: 'Seats', description: '', type: 'number', options: [], sensitive: false, business_types: ['saas'] },
  { entity: 'customer', key: 'date_of_birth', label: 'Date of birth', description: '', type: 'date', options: [], sensitive: true, business_types: ['healthcare'] },
  { entity: 'customer', key: 'patient_number', label: 'Patient number', description: '', type: 'text', options: [], sensitive: true, business_types: ['healthcare'] },
  { entity: 'customer', key: 'insurance_provider', label: 'Insurance provider', description: '', type: 'text', options: [], sensitive: false, business_types: ['healthcare'] },
  { entity: 'customer', key: 'budget', label: 'Budget', description: '', type: 'number', options: [], sensitive: false, business_types: ['real_estate'] },
  { entity: 'customer', key: 'preferred_area', label: 'Preferred area', description: '', type: 'text', options: [], sensitive: false, business_types: ['real_estate'] },
  { entity: 'customer', key: 'move_in_date', label: 'Move-in date', description: '', type: 'date', options: [], sensitive: false, business_types: ['real_estate'] },
  { entity: 'customer', key: 'dietary_needs', label: 'Dietary needs', description: '', type: 'text', options: [], sensitive: false, business_types: ['hospitality'] },
];

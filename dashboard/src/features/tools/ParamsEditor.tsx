import { Plus, Trash2 } from 'lucide-react';
import type { JsonSchema } from '@/lib/api/types';
import { Button, Checkbox, Input, Select } from '@/components/ui';

export type ScalarType = 'string' | 'integer' | 'number' | 'boolean';
export type ParamType = ScalarType | 'array';

export interface ParamRow {
  id: string;
  name: string;
  type: ParamType;
  description: string;
  required: boolean;
  /** Allowed values, comma-separated. Not used for booleans and arrays. */
  enumText: string;
  itemType: ScalarType;
}

/** The API allows at most 30 properties per object. */
export const MAX_PARAMS = 30;

const SCALARS: ScalarType[] = ['string', 'integer', 'number', 'boolean'];
const TYPE_OPTIONS: { value: ParamType; label: string }[] = [
  { value: 'string', label: 'Text' },
  { value: 'integer', label: 'Whole number' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'True / false' },
  { value: 'array', label: 'List' },
];
const ITEM_OPTIONS = TYPE_OPTIONS.filter((o) => o.value !== 'array');
const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

let seq = 0;
export function newRow(patch: Partial<ParamRow> = {}): ParamRow {
  return { id: `p${++seq}`, name: '', type: 'string', description: '', required: false, enumText: '', itemType: 'string', ...patch };
}

const isScalar = (t: unknown): t is ScalarType => SCALARS.includes(t as ScalarType);
const hasOnly = (o: object, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));

/**
 * Rows for the form, or null when the schema has something the form can't show
 * (nested objects, lists of objects, keywords on list items), so nothing is lost.
 */
export function schemaToRows(s: JsonSchema): ParamRow[] | null {
  if (s.type !== 'object' || !hasOnly(s, ['type', 'description', 'properties', 'required', 'additionalProperties'])) return null;
  const props = s.properties ?? {};
  const required = s.required ?? [];
  if (required.some((r) => !(r in props))) return null;
  const rows: ParamRow[] = [];
  for (const [name, p] of Object.entries(props)) {
    if (!hasOnly(p, ['type', 'description', 'enum', 'items'])) return null;
    const base = { name, description: p.description ?? '', required: required.includes(name) };
    if (p.type === 'array') {
      if (p.enum || !p.items || !isScalar(p.items.type) || !hasOnly(p.items, ['type'])) return null;
      rows.push(newRow({ ...base, type: 'array', itemType: p.items.type }));
    } else if (isScalar(p.type)) {
      if (p.items || (p.enum && p.type === 'boolean')) return null;
      rows.push(newRow({ ...base, type: p.type, enumText: (p.enum ?? []).join(', ') }));
    } else {
      return null;
    }
  }
  return rows;
}

const splitEnum = (text: string) =>
  text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

export function rowsToSchema(rows: ParamRow[]): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const r of rows) {
    const p: JsonSchema = { type: r.type };
    if (r.description.trim()) p.description = r.description.trim();
    if (r.type === 'array') p.items = { type: r.itemType };
    else if (r.type !== 'boolean') {
      const values = splitEnum(r.enumText);
      if (values.length) p.enum = r.type === 'string' ? values : values.map(Number);
    }
    properties[r.name] = p;
  }
  const required = rows.filter((r) => r.required).map((r) => r.name);
  return { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false };
}

/** Problems by row id. Empty when the rows make a valid schema. */
export function validateRows(rows: ParamRow[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.name) errors[r.id] = 'Give the parameter a name.';
    else if (!NAME_RE.test(r.name)) errors[r.id] = 'Use letters, digits and _ only, not starting with a digit.';
    else if (seen.has(r.name)) errors[r.id] = `There's already a parameter called ${r.name}.`;
    else if ((r.type === 'integer' || r.type === 'number') && splitEnum(r.enumText).some((v) => !Number.isFinite(Number(v)) || (r.type === 'integer' && !Number.isInteger(Number(v)))))
      errors[r.id] = r.type === 'integer' ? 'Allowed values must be whole numbers.' : 'Allowed values must be numbers.';
    seen.add(r.name);
  }
  return errors;
}

export function ParamsForm({ rows, onChange, errors }: { rows: ParamRow[]; onChange: (rows: ParamRow[]) => void; errors: Record<string, string> }) {
  const patch = (id: string, p: Partial<ParamRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  return (
    <div className="grid gap-2">
      {rows.length ? (
        rows.map((r) => (
          <div key={r.id} className="grid gap-2 rounded-[12px] border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                size="sm"
                aria-label="Parameter name"
                value={r.name}
                onChange={(e) => patch(r.id, { name: e.target.value.replace(/\s/g, '_').slice(0, 64) })}
                placeholder="order_id"
                className="min-w-[9rem] flex-1 font-mono text-xs"
                aria-invalid={errors[r.id] ? true : undefined}
              />
              <Select
                size="sm"
                aria-label={`Type of ${r.name || 'parameter'}`}
                value={r.type}
                onChange={(e) => patch(r.id, { type: e.target.value as ParamType })}
                options={TYPE_OPTIONS}
                className="w-[140px]"
              />
              <Checkbox label="Required" checked={r.required} onChange={(e) => patch(r.id, { required: e.target.checked })} />
              <Button size="xs" icon variant="quiet" aria-label={`Remove ${r.name || 'parameter'}`} onClick={() => onChange(rows.filter((x) => x.id !== r.id))}>
                <Trash2 />
              </Button>
            </div>
            <Input
              size="sm"
              aria-label={`Description of ${r.name || 'parameter'}`}
              value={r.description}
              onChange={(e) => patch(r.id, { description: e.target.value })}
              placeholder="What it is, so the model fills it in right. E.g. The order number, like A-10482"
            />
            {r.type === 'array' ? (
              <div className="flex items-center gap-2 text-xs text-ink-faint">
                <span>Each item is</span>
                <Select size="sm" aria-label={`Item type of ${r.name || 'parameter'}`} value={r.itemType} onChange={(e) => patch(r.id, { itemType: e.target.value as ScalarType })} options={ITEM_OPTIONS} className="w-[140px]" />
              </div>
            ) : (
              r.type !== 'boolean' && (
                <Input
                  size="sm"
                  aria-label={`Allowed values of ${r.name || 'parameter'}`}
                  value={r.enumText}
                  onChange={(e) => patch(r.id, { enumText: e.target.value })}
                  placeholder="Allowed values, comma-separated (optional)"
                  className="text-xs"
                />
              )
            )}
            {errors[r.id] && <p className="text-xs font-medium text-danger">{errors[r.id]}</p>}
          </div>
        ))
      ) : (
        <p className="rounded-[12px] border border-dashed border-line px-4 py-5 text-center text-[0.8125rem] text-ink-faint">
          No parameters. The tool is called without arguments.
        </p>
      )}
      <Button size="xs" variant="ghost" leading={<Plus />} className="justify-self-start" disabled={rows.length >= MAX_PARAMS} onClick={() => onChange([...rows, newRow()])}>
        Add parameter
      </Button>
    </div>
  );
}

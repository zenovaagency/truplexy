import { Lock } from 'lucide-react';
import type { PropertyDefinition, PropertyValues as Values } from '@/lib/api/types';
import { formatValue, type FieldValue } from '@/lib/properties';
import { cn } from '@/lib/cn';
import { DescList, Field, Input, Select, Switch, Textarea, Tip } from '@/components/ui';

/** The input for one custom property. */
export function PropertyField({
  def,
  value,
  onChange,
  error,
  disabled,
}: {
  def: PropertyDefinition;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  error?: string;
  disabled?: boolean;
}) {
  const label = (
    <span className="inline-flex items-center gap-1.5">
      {def.label}
      {def.sensitive && <SensitiveMark />}
    </span>
  );
  const hint = def.description || undefined;
  const text = typeof value === 'string' ? value : '';

  if (def.type === 'boolean') {
    return (
      <div className="grid gap-1">
        <Switch checked={value === true} onCheckedChange={onChange} disabled={disabled} label={label} description={hint} />
        {error && <p className="text-xs font-medium text-danger">{error}</p>}
      </div>
    );
  }

  if (def.type === 'multi_select') {
    const picked = Array.isArray(value) ? value : [];
    const toggle = (v: string) => onChange(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]);
    return (
      <fieldset className="grid gap-1.5" aria-invalid={error ? true : undefined}>
        <legend className="mb-1.5 text-[0.8125rem] font-semibold text-ink">
          {label}
          {!def.required && <span className="ml-1.5 font-normal text-ink-faint">Optional</span>}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {def.options.map((o) => {
            const on = picked.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggle(o.value)}
                className={cn('chip cursor-pointer border transition-colors', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-muted hover:text-ink')}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {error ? <p className="text-xs font-medium text-danger">{error}</p> : hint && <p className="text-xs text-ink-faint">{hint}</p>}
      </fieldset>
    );
  }

  let control;
  switch (def.type) {
    case 'long_text':
      control = <Textarea rows={3} value={text} maxLength={5000} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'select':
      control = (
        <Select value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="—" options={def.options.map((o) => ({ value: o.value, label: o.label }))}>
          {/* A value whose option was removed stays visible until someone changes it. */}
          {text && !def.options.some((o) => o.value === text) && <option value={text}>{text} (removed option)</option>}
        </Select>
      );
      break;
    default:
      control = (
        <Input
          value={text}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          maxLength={def.type === 'url' ? 2048 : 500}
          type={def.type === 'date' ? 'date' : def.type === 'email' ? 'email' : def.type === 'url' ? 'url' : def.type === 'phone' ? 'tel' : 'text'}
          inputMode={def.type === 'number' ? 'decimal' : undefined}
          placeholder={def.type === 'url' ? 'https://' : undefined}
        />
      );
  }
  return (
    <Field label={label} hint={hint} error={error} optional={!def.required}>
      {control}
    </Field>
  );
}

/** Inputs for a record's custom properties, in their order. Masked ones are shown locked. */
export function PropertyFields({
  defs,
  values,
  onChange,
  errors,
  masked = [],
  disabled,
  className,
}: {
  defs: PropertyDefinition[];
  values: Record<string, FieldValue>;
  onChange: (key: string, v: FieldValue) => void;
  errors?: Record<string, string | undefined>;
  masked?: string[];
  disabled?: boolean;
  className?: string;
}) {
  if (!defs.length) return null;
  return (
    <div className={cn('grid gap-4', className)}>
      {defs.map((d) =>
        masked.includes(d.key) ? (
          <Field key={d.key} label={d.label} hint="Sensitive: only people who can edit this record see it.">
            <Input value="Hidden" disabled readOnly />
          </Field>
        ) : (
          <PropertyField key={d.key} def={d} value={values[d.key] ?? (d.type === 'multi_select' ? [] : d.type === 'boolean' ? false : '')} onChange={(v) => onChange(d.key, v)} error={errors?.[d.key]} disabled={disabled} />
        ),
      )}
    </div>
  );
}

/** A record's custom properties, read-only. */
export function PropertyList({ defs, values, masked = [], hideEmpty, className }: { defs: PropertyDefinition[]; values: Values; masked?: string[]; hideEmpty?: boolean; className?: string }) {
  const rows = defs
    .filter((d) => !hideEmpty || masked.includes(d.key) || (values[d.key] !== undefined && values[d.key] !== null))
    .map((d) => ({
      label: (
        <span className="inline-flex items-center gap-1.5">
          {d.label}
          {d.sensitive && <SensitiveMark />}
        </span>
      ),
      value: masked.includes(d.key) ? <span className="text-ink-faint">Hidden</span> : <PropertyValue def={d} value={values[d.key]} />,
    }));
  if (!rows.length) return null;
  return <DescList className={className} items={rows} />;
}

/** One stored value: a link stays a link, an email opens mail. */
export function PropertyValue({ def, value }: { def: PropertyDefinition; value: unknown }) {
  const text = formatValue(def, value);
  if (text === '—') return <span className="text-ink-faint">—</span>;
  if (def.type === 'url' && typeof value === 'string' && /^https?:\/\//.test(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent hover:underline">
        {value}
      </a>
    );
  }
  if (def.type === 'email' && typeof value === 'string') {
    return (
      <a href={`mailto:${value}`} className="text-accent hover:underline">
        {value}
      </a>
    );
  }
  if (def.type === 'long_text') return <span className="whitespace-pre-wrap">{text}</span>;
  return <>{text}</>;
}

export function SensitiveMark() {
  return (
    <Tip content="Sensitive: hidden from read-only members and never given to the assistant">
      <span tabIndex={0} role="img" aria-label="Sensitive" className="inline-flex text-ink-faint">
        <Lock className="size-3" aria-hidden />
      </span>
    </Tip>
  );
}

/** One picker over every choice and yes/no property of a list: "Loyalty tier: Gold". Its value is `key=value`, or "". */
export function PropertyFilter({ defs, value, onChange, all }: { defs: PropertyDefinition[]; value: string; onChange: (v: string) => void; all: string }) {
  const pickable = defs.filter((d) => (d.type === 'select' || d.type === 'multi_select' || d.type === 'boolean') && !d.sensitive);
  if (!pickable.length) return null;
  return (
    <Select className="w-auto max-w-[220px]" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter by property">
      <option value="">{all}</option>
      {pickable.map((d) => (
        <optgroup key={d.key} label={d.label}>
          {(d.type === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : d.options).map((o) => (
            <option key={o.value} value={`${d.key}=${o.value}`}>
              {d.label}: {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

/** A `key=value` filter as the query's properties. */
export const filterOf = (f: string): Record<string, string> => {
  const i = f.indexOf('=');
  return i > 0 ? { [f.slice(0, i)]: f.slice(i + 1) } : {};
};

import { useEffect, useState, type ReactNode } from 'react';
import { Field, Input, Select } from '@/components/ui';
import { pluralize } from '@/lib/format';

/** The API's ceiling: 90 days. */
export const AUTO_CLOSE_MAX_HOURS = 2160;

/** "Never", "3 days" or "36 hours". */
export function formatAutoClose(hours: number) {
  if (!hours) return 'Never';
  return hours % 24 === 0 ? pluralize(hours / 24, 'day') : pluralize(hours, 'hour');
}

/**
 * How long an open ticket may sit without activity before it closes on its
 * own. 0 is never; with `inheritLabel`, null means "use the next level's".
 */
export function AutoCloseField({
  value,
  onChange,
  label = 'Close inactive tickets',
  hint,
  inheritLabel,
  disabled,
}: {
  value: number | null;
  onChange: (hours: number | null) => void;
  label?: ReactNode;
  hint?: ReactNode;
  /** Offers null, e.g. "Business setting (3 days)". */
  inheritLabel?: string;
  disabled?: boolean;
}) {
  const mode = value === null ? 'inherit' : value === 0 ? 'never' : 'after';
  // The hours box keeps what was typed while it's empty or out of range.
  const [draft, setDraft] = useState(value && value > 0 ? String(value) : '72');
  useEffect(() => {
    if (value && value > 0) setDraft(String(value));
  }, [value]);

  const hours = Number(draft);
  const valid = Number.isInteger(hours) && hours >= 1 && hours <= AUTO_CLOSE_MAX_HOURS;

  return (
    <Field
      label={label}
      hint={hint}
      error={mode === 'after' && !valid ? `A whole number of hours from 1 to ${AUTO_CLOSE_MAX_HOURS} (90 days).` : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-auto min-w-[180px] flex-1"
          disabled={disabled}
          value={mode}
          onChange={(e) => {
            const m = e.target.value;
            onChange(m === 'inherit' ? null : m === 'never' ? 0 : valid ? hours : 72);
          }}
          options={[
            ...(inheritLabel ? [{ value: 'inherit', label: inheritLabel }] : []),
            { value: 'never', label: 'Never' },
            { value: 'after', label: 'After a time without activity' },
          ]}
        />
        {mode === 'after' && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={AUTO_CLOSE_MAX_HOURS}
              className="w-24 tabular-nums"
              aria-label="Hours"
              disabled={disabled}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= AUTO_CLOSE_MAX_HOURS) onChange(n);
              }}
            />
            <span className="text-[0.8125rem] text-ink-muted">hours{valid && hours >= 24 && hours % 24 === 0 ? ` (${formatAutoClose(hours)})` : ''}</span>
          </div>
        )}
      </div>
    </Field>
  );
}

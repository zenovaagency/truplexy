import { Check } from 'lucide-react';
import { Input } from '@/components/ui';
import { WIDGET_COLOURS, WIDGET_DEFAULTS, colourPreset } from '@/lib/widget';

const swatch =
  'relative grid size-8 shrink-0 place-items-center rounded-full inset-ring inset-ring-black/10 ring-offset-2 ring-offset-surface transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-60 aria-checked:ring-2 aria-checked:ring-ink dark:inset-ring-white/20 [@media(pointer:coarse)]:size-9';

/**
 * The chat widget's colour: one of the ready-made colours, or Custom with a picker and a code.
 * A code that isn't ready-made always shows as Custom; `custom` keeps Custom open on a ready-made one.
 */
export function AccentPicker({
  value,
  onChange,
  custom,
  onCustomChange,
  disabled,
  describedBy,
}: {
  value: string;
  onChange: (hex: string) => void;
  custom: boolean;
  onCustomChange: (on: boolean) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const preset = colourPreset(value);
  const isCustom = custom || !preset;
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="Colour" aria-describedby={describedBy} className="flex flex-wrap items-center gap-2">
        {WIDGET_COLOURS.map((c) => {
          const on = !isCustom && preset?.id === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              title={c.name}
              disabled={disabled}
              onClick={() => (onChange(c.hex), onCustomChange(false))}
              className={swatch}
              style={{ backgroundColor: c.hex }}
            >
              {on && <Check className="size-4 text-white" strokeWidth={3} aria-hidden />}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={isCustom}
          disabled={disabled}
          onClick={() => onCustomChange(true)}
          className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface pl-1 pr-3 text-[0.8125rem] font-semibold text-ink transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-default disabled:opacity-60 aria-checked:border-ink [@media(pointer:coarse)]:h-9"
        >
          <span
            aria-hidden
            className="size-6 rounded-full"
            style={{ background: isCustom && valid ? value : 'conic-gradient(#e11d48, #f59e0b, #16a34a, #0ea5e9, #6d28d9, #e11d48)' }}
          />
          Custom
        </button>
      </div>
      {isCustom && (
        <div className="relative w-full max-w-[11rem]">
          <input
            type="color"
            aria-label="Pick a colour"
            value={valid ? value : WIDGET_DEFAULTS.accent}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="absolute left-1.5 top-1/2 z-[1] size-6 -translate-y-1/2 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:cursor-default [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
          />
          <Input
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value.slice(0, 7))}
            aria-label="Colour code"
            aria-describedby={describedBy}
            className="pl-10 font-mono text-[0.8125rem]"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}

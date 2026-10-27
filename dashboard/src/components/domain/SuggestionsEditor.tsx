import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { MAX_SUGGESTIONS, SUGGESTION_LIMIT } from '@/lib/widget';

/** Starting points offered while the list is empty; one tap adds it. */
const IDEAS = ['Where is my order?', 'What is your return policy?', 'Do you ship to my country?'];

/**
 * The chat's suggested questions: a row each, up to four, with a character count and a remove button.
 * Enter moves to the next row, or adds one after the last.
 */
export function SuggestionsEditor({ value, onChange, disabled, describedBy }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean; describedBy?: string }) {
  const rows = useRef<(HTMLInputElement | null)[]>([]);
  // The row to focus once it has rendered: a new one, or the one that took a removed row's place.
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const full = value.length >= MAX_SUGGESTIONS;

  useEffect(() => {
    if (focusRow === null) return;
    rows.current[Math.min(focusRow, value.length - 1)]?.focus();
    setFocusRow(null);
  }, [focusRow, value.length]);

  const add = (text = '') => {
    if (full) return;
    onChange([...value, text]);
    if (!text) setFocusRow(value.length);
  };
  const remove = (i: number) => {
    onChange(value.filter((_, n) => n !== i));
    if (value.length > 1) setFocusRow(i);
  };

  return (
    <div className="grid gap-3">
      {value.length > 0 && (
        <ol className="grid gap-2">
          {value.map((q, i) => {
            const n = [...q].length;
            return (
              <li key={i} className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[0.6875rem] font-semibold tabular-nums text-ink-muted" aria-hidden>
                  {i + 1}
                </span>
                <Input
                  ref={(el) => {
                    rows.current[i] = el;
                  }}
                  value={q}
                  onChange={(e) => onChange(value.map((v, n) => (n === i ? e.target.value : v)))}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                    // Enter would save the whole form; here it moves on instead.
                    e.preventDefault();
                    if (i < value.length - 1) rows.current[i + 1]?.focus();
                    else if (q.trim()) add();
                  }}
                  placeholder={IDEAS[i % IDEAS.length]}
                  aria-label={`Suggested question ${i + 1}`}
                  aria-invalid={n > SUGGESTION_LIMIT || undefined}
                  aria-describedby={describedBy}
                  className="min-w-0 flex-1"
                />
                <span className={cn('w-11 shrink-0 text-right text-xs tabular-nums', n > SUGGESTION_LIMIT ? 'font-semibold text-danger' : 'text-ink-faint')}>
                  {n}/{SUGGESTION_LIMIT}
                </span>
                <Button size="xs" icon variant="quiet" className="shrink-0 hover:text-danger" disabled={disabled} onClick={() => remove(i)} aria-label={`Remove question ${i + 1}`}>
                  <X />
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="soft" leading={<Plus />} disabled={disabled || full} onClick={() => add()}>
          Add a question
        </Button>
        {value.length === 0 ? (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
            Or start with
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                disabled={disabled}
                onClick={() => add(idea)}
                className="rounded-full border border-line px-2.5 py-1 font-medium text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-50"
              >
                {idea}
              </button>
            ))}
          </span>
        ) : (
          <span className="text-xs text-ink-faint">
            {value.length} of {MAX_SUGGESTIONS}
          </span>
        )}
      </div>
    </div>
  );
}

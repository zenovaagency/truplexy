import { useId, type ComponentProps, type ReactElement, type ReactNode, cloneElement, isValidElement } from 'react';
import { Switch as RSwitch } from 'radix-ui';
import { cn } from '@/lib/cn';

/**
 * A labelled control. The child input gets the generated id, plus
 * aria-describedby/aria-invalid wired to the hint and error.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  aside,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  /** Right side of the label row, e.g. a character count. */
  aside?: ReactNode;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        'aria-describedby': [errId, hintId].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? true : undefined,
      })
    : children;
  return (
    <div className={cn('grid gap-1.5', className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={children.props.id ?? id} className="text-[0.8125rem] font-semibold text-ink">
              {label}
              {optional && <span className="ml-1.5 font-normal text-ink-faint">Optional</span>}
            </label>
          )}
          {aside && <span className="text-xs text-ink-faint">{aside}</span>}
        </div>
      )}
      {control}
      {error ? (
        <p id={errId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs text-ink-faint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function Input({ className, size, ...rest }: Omit<ComponentProps<'input'>, 'size'> & { size?: 'sm' | 'md' }) {
  return <input className={cn('input', size === 'sm' && 'input-sm', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn('input', className)} {...rest} />;
}

/** Native select: fast, accessible, and the right picker on phones. */
export function Select({
  className,
  size,
  options,
  placeholder,
  ...rest
}: Omit<ComponentProps<'select'>, 'size'> & {
  size?: 'sm' | 'md';
  options?: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}) {
  return (
    <select className={cn('input', size === 'sm' && 'input-sm', className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options?.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
      {rest.children}
    </select>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
  id,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
  id?: string;
  className?: string;
}) {
  const auto = useId();
  const sid = id ?? auto;
  const control = (
    <RSwitch.Root
      id={sid}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border border-transparent bg-line-strong transition-colors',
        'data-[state=checked]:bg-btn disabled:cursor-not-allowed disabled:opacity-50',
        '[@media(pointer:coarse)]:min-h-0',
      )}
    >
      <RSwitch.Thumb className="block size-[18px] translate-x-[1px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-[var(--ease-out-expo)] data-[state=checked]:translate-x-[17px]" />
    </RSwitch.Root>
  );
  if (!label) return control;
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <label htmlFor={sid} className="grid gap-0.5">
        <span className="text-[0.8125rem] font-semibold text-ink">{label}</span>
        {description && <span className="text-xs text-ink-faint">{description}</span>}
      </label>
      <div className="pt-0.5">{control}</div>
    </div>
  );
}

export function Checkbox({ label, className, ...rest }: ComponentProps<'input'> & { label?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={rest.id ?? id} className={cn('inline-flex items-center gap-2 text-[0.8125rem] text-ink', className)}>
      <input type="checkbox" id={rest.id ?? id} className="checkbox" {...rest} />
      {label}
    </label>
  );
}

import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'soft' | 'quiet' | 'danger' | 'danger-ghost';
export type ButtonSize = 'xs' | 'sm' | 'md';

// Literal class names, so Tailwind's scanner sees them.
const ICON_SIZE: Record<ButtonSize, string> = { xs: '[&_svg]:size-3.5', sm: '[&_svg]:size-4', md: '[&_svg]:size-[18px]' };

export function buttonClass({
  variant = 'ghost',
  size = 'sm',
  icon = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; icon?: boolean; className?: string } = {}) {
  return cn(
    'btn',
    `btn-${size}`,
    `btn-${variant}`,
    icon && 'btn-icon',
    icon && (size === 'xs' ? 'h-[30px]' : size === 'sm' ? 'h-9' : 'h-[46px]'),
    ICON_SIZE[size],
    '[&_svg]:shrink-0',
    className,
  );
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square, icon-only. Give it an aria-label. */
  icon?: boolean;
  loading?: boolean;
  /** Render the child (e.g. a <Link>) with button styling. */
  asChild?: boolean;
  leading?: ReactNode;
}

export function Button({
  variant = 'ghost',
  size = 'sm',
  icon = false,
  loading = false,
  asChild = false,
  leading,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = buttonClass({ variant, size, icon, className });
  if (asChild) {
    // Put the leading icon inside the child (e.g. a <Link>), before its own content.
    const child =
      leading && isValidElement(children)
        ? cloneElement(children as ReactElement<{ children?: ReactNode }>, {}, leading, (children as ReactElement<{ children?: ReactNode }>).props.children)
        : children;
    return (
      <Slot.Root className={cls} {...(rest as ComponentProps<typeof Slot.Root>)}>
        {child}
      </Slot.Root>
    );
  }
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : leading}
      {children}
    </button>
  );
}

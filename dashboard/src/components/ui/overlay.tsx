import type { ComponentProps, ReactNode } from 'react';
import { Dialog as D, DropdownMenu as M, Popover as P, Tooltip as T } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------ */
/* Dialog: centered on desktop, a bottom sheet on phones.               */
/* ------------------------------------------------------------------ */

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Keep open on outside click (forms with edits). */
  modal?: boolean;
  className?: string;
}

const DIALOG_W = { sm: 'sm:max-w-[420px]', md: 'sm:max-w-[540px]', lg: 'sm:max-w-[720px]', xl: 'sm:max-w-[960px]' };

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', className }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px] animate-fade-in" />
        <D.Content
          className={cn(
            'fixed z-50 flex max-h-[min(92dvh,900px)] w-full flex-col overflow-hidden border border-line bg-surface shadow-lg outline-none',
            'inset-x-0 bottom-0 rounded-t-[20px] pb-[env(safe-area-inset-bottom)] animate-pop-in',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:pb-0',
            DIALOG_W[size],
            className,
          )}
        >
          <header className="flex items-start gap-4 border-b border-line px-5 py-4">
            <div className="grid flex-1 gap-1">
              <D.Title className="text-base font-bold text-ink">{title}</D.Title>
              {description ? (
                <D.Description className="text-[0.8125rem] text-ink-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</D.Description>
              )}
            </div>
            <D.Close className="btn btn-quiet btn-icon btn-xs -mr-1.5 [&_svg]:size-4" aria-label="Close">
              <X />
            </D.Close>
          </header>
          {children && <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>}
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3.5">{footer}</footer>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Sheet: a side drawer for detail views and guides.                    */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = 'right',
  width = 'md',
  headerExtra,
}: Omit<DialogProps, 'size'> & { side?: 'left' | 'right'; width?: 'sm' | 'md' | 'lg'; headerExtra?: ReactNode }) {
  const w = { sm: 'sm:max-w-[400px]', md: 'sm:max-w-[560px]', lg: 'sm:max-w-[760px]' }[width];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] animate-fade-in" />
        <D.Content
          // Focus the panel, not its close button: a ring on "×" is the first thing people would see.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          className={cn(
            'fixed inset-y-0 z-50 flex w-full flex-col bg-surface shadow-lg outline-none',
            side === 'right' ? 'right-0 border-l border-line animate-slide-in-right' : 'left-0 border-r border-line animate-slide-in-left',
            w,
          )}
        >
          <header className="flex items-start gap-3 border-b border-line px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="grid flex-1 gap-1">
              <D.Title className="text-base font-bold text-ink">{title}</D.Title>
              {description ? (
                <D.Description className="text-[0.8125rem] text-ink-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === 'string' ? title : 'Panel'}</D.Description>
              )}
            </div>
            {headerExtra}
            <D.Close className="btn btn-quiet btn-icon btn-xs -mr-1.5 [&_svg]:size-4" aria-label="Close">
              <X />
            </D.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Menus                                                               */
/* ------------------------------------------------------------------ */

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuGroup = M.Group;
export const MenuSub = M.Sub;

export function MenuContent({ className, align = 'end', sideOffset = 6, ...rest }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'z-50 min-w-[200px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[14px] border border-line bg-surface p-1.5 shadow-lg animate-pop-in',
          className,
        )}
        {...rest}
      />
    </M.Portal>
  );
}

const itemCls =
  'flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-[0.8125rem] font-medium text-ink outline-none transition-colors data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-faint';

export function MenuItem({ className, danger, ...rest }: ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return <M.Item className={cn(itemCls, danger && 'text-danger [&_svg]:text-danger data-[highlighted]:bg-danger-soft', className)} {...rest} />;
}

export function MenuCheckItem({ className, children, ...rest }: ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem className={cn(itemCls, 'pr-8 relative', className)} {...rest}>
      {children}
      <M.ItemIndicator className="absolute right-2.5 text-accent">✓</M.ItemIndicator>
    </M.CheckboxItem>
  );
}

export function MenuRadioGroup(props: ComponentProps<typeof M.RadioGroup>) {
  return <M.RadioGroup {...props} />;
}

export function MenuRadioItem({ className, children, ...rest }: ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(itemCls, 'relative pr-8', className)} {...rest}>
      {children}
      <M.ItemIndicator className="absolute right-2.5 size-2 rounded-full bg-accent" />
    </M.RadioItem>
  );
}

export function MenuLabel({ className, ...rest }: ComponentProps<typeof M.Label>) {
  return <M.Label className={cn('mono px-2.5 pb-1 pt-2 text-ink-faint', className)} {...rest} />;
}

export function MenuSeparator() {
  return <M.Separator className="-mx-1.5 my-1.5 h-px bg-line" />;
}

export function MenuSubTrigger({ className, ...rest }: ComponentProps<typeof M.SubTrigger>) {
  return <M.SubTrigger className={cn(itemCls, 'data-[state=open]:bg-surface-2', className)} {...rest} />;
}

export function MenuSubContent({ className, ...rest }: ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent
        sideOffset={6}
        collisionPadding={12}
        className={cn('z-50 min-w-[180px] rounded-[14px] border border-line bg-surface p-1.5 shadow-lg animate-pop-in', className)}
        {...rest}
      />
    </M.Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Popover                                                             */
/* ------------------------------------------------------------------ */

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export function PopoverContent({ className, align = 'start', sideOffset = 6, ...rest }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn('z-50 w-72 max-w-[calc(100vw-24px)] rounded-[14px] border border-line bg-surface shadow-lg outline-none animate-pop-in', className)}
        {...rest}
      />
    </P.Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

export const TooltipProvider = T.Provider;

export function Tip({
  content,
  children,
  side = 'top',
  align = 'center',
  disabled,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  disabled?: boolean;
}) {
  if (disabled || !content) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="z-[60] max-w-[260px] rounded-[8px] bg-ink px-2.5 py-1.5 text-xs font-medium text-paper shadow-md animate-fade-in"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

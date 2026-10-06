import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertDialog as A } from 'radix-ui';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { Input } from './field';

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  /** The person must type this to enable the confirm button. */
  typeToConfirm?: string;
  /** Runs on confirm; the dialog stays open (busy) until it settles, and stays open if it throws. */
  onConfirm?: () => Promise<unknown> | unknown;
}

type Confirm = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function useConfirm() {
  const c = useContext(ConfirmContext);
  if (!c) throw new Error('useConfirm must be used inside ConfirmProvider');
  return c;
}

/** One app-wide confirmation dialog, awaited: `if (await confirm({...})) …`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const resolver = useRef<(v: boolean) => void>(() => {});

  const confirm = useCallback<Confirm>((o) => {
    setOpts(o);
    setTyped('');
    setBusy(false);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    setOpen(false);
    resolver.current(result);
  };

  const onConfirm = async () => {
    if (!opts?.onConfirm) return close(true);
    setBusy(true);
    try {
      await opts.onConfirm();
      close(true);
    } catch {
      // The mutation already toasted; keep the dialog so they can retry or cancel.
      setBusy(false);
    }
  };

  const danger = opts?.tone === 'danger';
  const blocked = Boolean(opts?.typeToConfirm) && typed.trim() !== opts?.typeToConfirm;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <A.Root open={open} onOpenChange={(o) => !o && !busy && close(false)}>
        <A.Portal>
          <A.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px] animate-fade-in" />
          <A.Content className="fixed inset-x-3 bottom-3 z-50 rounded-[20px] border border-line bg-surface p-5 shadow-lg outline-none animate-pop-in sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2">
            <div className="flex gap-3.5">
              {danger && (
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
                  <AlertTriangle className="size-5" />
                </span>
              )}
              <div className="grid flex-1 gap-1.5">
                <A.Title className="text-base font-bold text-ink">{opts?.title}</A.Title>
                <A.Description asChild>
                  <div className="text-[0.8125rem] leading-relaxed text-ink-muted">{opts?.description}</div>
                </A.Description>
              </div>
            </div>
            {opts?.typeToConfirm && (
              <div className="mt-4 grid gap-1.5">
                <label className="text-xs text-ink-muted" htmlFor="confirm-type">
                  Type <span className="font-mono font-semibold text-ink">{opts.typeToConfirm}</span> to confirm
                </label>
                <Input id="confirm-type" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </div>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <A.Cancel asChild>
                <Button variant="ghost" disabled={busy}>
                  {opts?.cancelLabel ?? 'Cancel'}
                </Button>
              </A.Cancel>
              <Button
                variant={danger ? 'danger' : 'accent'}
                loading={busy}
                disabled={blocked}
                onClick={onConfirm}
                className={cn(!opts?.typeToConfirm && 'focus-visible:outline-2')}
              >
                {opts?.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </A.Content>
        </A.Portal>
      </A.Root>
    </ConfirmContext.Provider>
  );
}

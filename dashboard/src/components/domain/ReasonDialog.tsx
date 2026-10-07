import { useEffect, useState, type ReactNode } from 'react';
import { Button, Dialog, Field, Input, Textarea } from '@/components/ui';

const MAX = 1000;

/**
 * A confirmation that also collects an optional note, such as the reason
 * for deleting a business. `typeToConfirm` asks for the exact text first.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  label,
  hint,
  placeholder,
  typeToConfirm,
  confirmLabel,
  tone = 'default',
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Shown above the note, e.g. a callout. */
  children?: ReactNode;
  label: string;
  hint?: ReactNode;
  placeholder?: string;
  typeToConfirm?: string;
  confirmLabel: string;
  tone?: 'danger' | 'default';
  /** The dialog closes when it resolves and stays open if it throws. */
  onSubmit: (note: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setNote('');
    setTyped('');
    setBusy(false);
  }, [open]);

  const blocked = Boolean(typeToConfirm) && typed.trim() !== typeToConfirm;
  const submit = async () => {
    if (blocked || busy) return;
    setBusy(true);
    try {
      await onSubmit(note.trim());
      onOpenChange(false);
    } catch {
      // The mutation already toasted; keep the dialog so they can retry or cancel.
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'accent'} loading={busy} disabled={blocked} onClick={() => void submit()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {children}
        <Field label={label} optional hint={hint} aside={`${note.length}/${MAX}`}>
          <Textarea rows={3} value={note} placeholder={placeholder} onChange={(e) => setNote(e.target.value.slice(0, MAX))} />
        </Field>
        {typeToConfirm && (
          <Field
            label={
              <>
                Type <span className="font-mono font-semibold text-ink">{typeToConfirm}</span> to confirm
              </>
            }
          >
            <Input autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
        )}
      </form>
    </Dialog>
  );
}

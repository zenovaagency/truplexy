import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileUp, Globe, Sparkles } from 'lucide-react';
import { useImportFile, useImportPage, type ImportStep } from '@/lib/api/endpoints/products';
import type { ProductImport } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { IMPORT_FILES, importFileProblem, readsWithAI } from '@/lib/products';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Button, Callout, Dialog, Field, Input, Progress, Segmented } from '@/components/ui';

/**
 * Starts an import from a file or a web page, then opens its review. Nothing reaches the catalog here: every import
 * is reviewed first.
 */
export function ImportDialog({ mode: initial, onClose }: { mode: 'file' | 'url'; onClose: () => void }) {
  const { href } = useScopeCtx();
  const navigate = useNavigate();
  const [mode, setMode] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState('');
  const [drag, setDrag] = useState(false);
  const [step, setStep] = useState<{ step: ImportStep; progress: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const importFile = useImportFile();
  const importPage = useImportPage();
  const busy = importFile.isPending || importPage.isPending;
  const problem = file ? importFileProblem(file) : undefined;
  const linkOk = /^https:\/\/[^\s/]+\.[^\s]+/.test(link.trim());

  const review = (i: ProductImport) => {
    onClose();
    navigate(href(`products/imports/${i.id}`));
  };
  const start = () => {
    if (mode === 'file' && file && !problem) {
      importFile.mutate({ file, onStep: (s, p) => setStep({ step: s, progress: p }) }, { onSuccess: review, onSettled: () => setStep(null) });
    } else if (mode === 'url' && linkOk) {
      importPage.mutate(link.trim(), { onSuccess: review });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      size="md"
      title="Import products"
      description="You'll review everything that was found before it's added to your catalog."
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} disabled={mode === 'file' ? !file || Boolean(problem) : !linkOk} onClick={start}>
            {busy ? (mode === 'url' ? 'Reading the page…' : step?.step === 'uploading' ? 'Uploading…' : 'Reading…') : 'Find products'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Segmented
          stretch
          label="Import from"
          value={mode}
          onChange={(v) => !busy && setMode(v)}
          options={[
            { value: 'file', label: 'A file' },
            { value: 'url', label: 'A web page' },
          ]}
        />
        {mode === 'file' ? (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (!busy && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
              }}
              onClick={() => !busy && input.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && input.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Choose a file to import"
              className={cn(
                'grid cursor-pointer place-items-center gap-2 rounded-[16px] border-2 border-dashed px-6 py-8 text-center transition-colors',
                drag ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface-2/50 hover:border-accent/60',
              )}
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-surface text-accent shadow-sm">
                <FileUp className="size-5" />
              </span>
              {file ? (
                <p className="text-[0.875rem] font-semibold text-ink">
                  {file.name} <span className="font-normal text-ink-faint">· {formatBytes(file.size)}</span>
                </p>
              ) : (
                <p className="text-[0.875rem] font-semibold text-ink">Drop a file here, or click to choose</p>
              )}
              <p className="text-xs text-ink-faint">{IMPORT_FILES.join(', ')} · CSV and JSON up to 5 MB, PDF, Word and HTML up to 10 MB</p>
              <input
                ref={input}
                type="file"
                accept={IMPORT_FILES.join(',')}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) setFile(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </div>
            {problem && <p className="text-xs font-medium text-danger">{problem}</p>}
            {step && <Progress value={step.step === 'uploading' ? step.progress : 1} label={step.step === 'uploading' ? 'Uploading' : 'Reading'} />}
            {file && !problem && readsWithAI(file) ? (
              <Callout tone="neutral" icon={<Sparkles />}>
                This file is read with AI, which counts as one reply on your plan. Check prices and links before saving.
              </Callout>
            ) : (
              <p className="text-xs text-ink-faint">
                A CSV needs a <span className="mono">name</span> or <span className="mono">title</span> column; <span className="mono">sku</span>, <span className="mono">price</span>,{' '}
                <span className="mono">currency</span>, <span className="mono">stock</span>, <span className="mono">description</span>, <span className="mono">url</span> and{' '}
                <span className="mono">image</span> are read too, as are Shopify and WooCommerce exports. Other columns fill properties with the same name.
              </p>
            )}
          </>
        ) : (
          <>
            <Field label="Page link" hint="A product page, a collection or a category page of a public shop.">
              <Input
                type="url"
                value={link}
                autoFocus
                maxLength={2048}
                disabled={busy}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && start()}
                placeholder="https://shop.example.com/collections/all"
              />
            </Field>
            <Callout tone="neutral" icon={<Globe />}>
              Most shops publish product data for search engines, which is read exactly and for free. Otherwise the page is read with AI, which counts as one reply on your plan.
            </Callout>
          </>
        )}
      </div>
    </Dialog>
  );
}

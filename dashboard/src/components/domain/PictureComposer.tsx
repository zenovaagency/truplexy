import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { Link } from 'react-router';
import { AlertCircle, ImagePlus, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { canAttach, lacksVisionModel, needsUpgrade, type PictureFeature } from '@/lib/images/feature';
import type { Picture, PictureSet } from '@/lib/images/pictures';
import { Button, Tip } from '@/components/ui';
import { Loader } from '@/components/ui/loader';

/**
 * The composer's picture controls. Everything here renders nothing unless the
 * feature check says pictures are on, so with the feature off the composer is
 * exactly what it was before.
 */

/** Picks files, takes drops and pastes, and keeps the last thing worth telling the person. */
export function usePictureInput(set: PictureSet, feature: PictureFeature, disabled = false) {
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const on = canAttach(feature) && !disabled;

  const addFiles = useCallback(
    (files: File[]) => {
      if (!on || !files.length) return;
      const turnedAway = set.add(files);
      setNotice(turnedAway.length ? [...new Set(turnedAway)].join(' ') : null);
    },
    [on, set],
  );

  const hasFiles = (e: DragEvent) => on && [...e.dataTransfer.types].includes('Files');

  return {
    notice,
    dismissNotice: () => setNotice(null),
    addFiles,
    dragging: dragging && on,
    /** Spread on the element that takes drops. */
    dropProps: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        depth.current++;
        setDragging(true);
      },
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault(); // allows the drop
        e.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      },
      onDrop: (e: DragEvent) => {
        depth.current = 0;
        setDragging(false);
        if (!hasFiles(e)) return;
        e.preventDefault();
        addFiles([...e.dataTransfer.files]);
      },
    },
    /** Pasting a picture attaches it; pasting text is left alone. */
    onPaste: (e: ClipboardEvent) => {
      if (!on) return;
      const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      if (!e.clipboardData.getData('text/plain')) e.preventDefault();
      addFiles(files);
    },
  };
}

export function AttachButton({ feature, onFiles, disabled }: { feature: PictureFeature; onFiles: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  if (!canAttach(feature)) return null;
  return (
    <>
      {/* The accepted types come from the server's config, which today is JPEG, PNG and WebP. HEIC is left out on purpose: phones usually convert to JPEG on pick. */}
      <input
        ref={input}
        type="file"
        hidden
        multiple={feature.limits.maxPerMessage > 1}
        accept={feature.limits.contentTypes.join(',')}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = ''; // picking the same file again must fire again
        }}
      />
      <Tip content="Attach pictures">
        <Button type="button" icon size="sm" variant="ghost" className="h-[42px] w-[42px]" disabled={disabled} aria-label="Attach pictures" onClick={() => input.current?.click()}>
          <ImagePlus />
        </Button>
      </Tip>
    </>
  );
}

/** Thumbnails with a remove button, upload progress and a per-picture error with retry. */
export function PictureTray({ pictures, set, disabled }: { pictures: readonly Picture[]; set: PictureSet; disabled?: boolean }) {
  if (!pictures.length) return null;
  return (
    <ul className="flex flex-wrap gap-2.5" aria-label="Pictures to send">
      {pictures.map((p) => (
        <li key={p.key} className="w-[92px]">
          <div className={cn('group relative size-[92px] overflow-hidden rounded-[12px] border bg-surface-2', p.phase === 'failed' ? 'border-danger/50' : 'border-line')}>
            <img src={p.previewUrl} alt={`Preview of ${p.name}`} className={cn('size-full object-cover', p.phase !== 'ready' && 'opacity-60')} />
            {p.phase !== 'ready' && p.phase !== 'failed' && (
              <div className="absolute inset-x-0 bottom-0 grid gap-1 bg-gradient-to-t from-black/55 to-transparent px-1.5 pb-1.5 pt-4" aria-hidden={p.phase !== 'uploading'}>
                <div
                  role="progressbar"
                  aria-label={`Uploading ${p.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={p.phase === 'uploading' ? Math.round(p.progress * 100) : undefined}
                  className="h-1 overflow-hidden rounded-full bg-white/40"
                >
                  <div className={cn('h-full rounded-full bg-white transition-[width]', p.phase !== 'uploading' && 'w-1/3 animate-pulse')} style={p.phase === 'uploading' ? { width: `${Math.max(4, p.progress * 100)}%` } : undefined} />
                </div>
              </div>
            )}
            {p.phase === 'failed' && (
              <div className="absolute inset-0 grid place-items-center bg-danger/15">
                <AlertCircle className="size-5 text-danger" aria-hidden />
              </div>
            )}
            <button
              type="button"
              onClick={() => set.remove(p.key)}
              disabled={disabled}
              aria-label={`Remove ${p.name}`}
              className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white outline-none transition-opacity hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40 [@media(pointer:coarse)]:min-h-0"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
          <p className="mt-1 truncate text-[0.68rem] text-ink-faint" title={p.name}>
            {p.phase === 'ready' ? p.name : p.phase === 'failed' ? <span className="font-medium text-danger">{p.problem?.title ?? 'Upload failed'}</span> : <span className="inline-flex items-center gap-1"><Loader size={12} label={null} />{p.phase === 'uploading' ? `${Math.round(p.progress * 100)}%` : 'Preparing'}</span>}
          </p>
          {p.phase === 'failed' && (
            <div role="alert" className="grid gap-0.5 text-[0.68rem] leading-snug text-ink-muted">
              {p.problem?.detail && <span>{p.problem.detail}</span>}
              {p.problem?.requestId && <span className="font-mono text-[0.62rem] text-ink-faint">Request {p.problem.requestId}</span>}
              {p.retryable && (
                <button type="button" onClick={() => set.retry(p.key)} disabled={disabled} className="inline-flex items-center gap-1 justify-self-start font-semibold text-accent disabled:opacity-50 [@media(pointer:coarse)]:min-h-0">
                  <RefreshCw className="size-3" aria-hidden /> Retry
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** What to say, if anything, when the control is hidden. Business users see an upgrade hint only when the plan is the reason. */
export function PictureHint({ feature, upgradeTo, platformAdmin, modelsTo }: { feature: PictureFeature; upgradeTo?: string; platformAdmin?: boolean; modelsTo?: string }) {
  if (needsUpgrade(feature)) {
    return (
      <p className="flex items-center gap-1.5 px-1 text-xs text-ink-faint">
        <ImagePlus className="size-3.5 shrink-0" aria-hidden />
        <span>
          Customers can't send pictures on this plan.
          {upgradeTo && (
            <>
              {' '}
              <Link to={upgradeTo} className="font-semibold text-accent hover:underline">
                See plans
              </Link>
            </>
          )}
        </span>
      </p>
    );
  }
  if (lacksVisionModel(feature) && platformAdmin) {
    return (
      <p className="flex items-center gap-1.5 px-1 text-xs text-ink-faint">
        <ImagePlus className="size-3.5 shrink-0" aria-hidden />
        <span>
          Picture input is off: no active model can read pictures.
          {modelsTo && (
            <>
              {' '}
              <Link to={modelsTo} className="font-semibold text-accent hover:underline">
                Platform models
              </Link>
            </>
          )}
        </span>
      </p>
    );
  }
  return null;
}

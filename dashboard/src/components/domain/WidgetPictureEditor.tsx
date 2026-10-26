import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Maximize2, Trash2, Upload } from 'lucide-react';
import { Avatar, Button, Dialog, Slider } from '@/components/ui';
import { cn } from '@/lib/cn';
import { MAX_ZOOM, MIN_ZOOM, centered, exportSide, exportSquare, pan, placement, squareOf, zoomTo, type Point } from '@/lib/images/crop';
import { notifyError } from '@/lib/notify';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
/** The picture is cropped and shrunk here before it is sent, so the original may be large. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MIN_SIDE = 16;
const MAX_SIDE = 8192;
const VIEW = 280;

/** Reads the file the way the browser shows it (turned upright by its EXIF), or says why not. */
async function open(file: File): Promise<{ bitmap: ImageBitmap } | { error: string }> {
  if (!TYPES.includes(file.type)) return { error: 'Use a PNG, JPEG or WebP picture. SVG and GIF files are not supported.' };
  if (file.size > MAX_SOURCE_BYTES) return { error: 'The picture is larger than 20 MB.' };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (Math.min(bitmap.width, bitmap.height) < MIN_SIDE || Math.max(bitmap.width, bitmap.height) > MAX_SIDE) {
      bitmap.close();
      return { error: `The picture must be ${MIN_SIDE}–${MAX_SIDE} pixels on each side.` };
    }
    return { bitmap };
  } catch {
    return { error: "That file can't be read as a picture." };
  }
}

/**
 * The chat window's header picture: choose or drop a picture, move and zoom it inside a round frame
 * (it starts fitted, so nothing is left empty), and the square that shows is what is uploaded.
 * `value` is the current picture's URL; empty means the window uses the business logo.
 */
export function WidgetPictureEditor({
  value,
  fallback,
  disabled,
  busy,
  onSave,
  onRemove,
}: {
  value: string;
  /** What shows when there is no picture: the business logo or the bot's picture, if any. */
  fallback?: string;
  disabled?: boolean;
  busy?: boolean;
  onSave: (file: File) => Promise<unknown> | void;
  onRemove: () => Promise<unknown> | void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [source, setSource] = useState<{ bitmap: ImageBitmap; name: string; type: 'image/png' | 'image/jpeg' } | null>(null);

  const choose = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const opened = await open(file);
    if ('error' in opened) {
      notifyError(opened.error);
      return;
    }
    // A transparent logo keeps its transparency; a photo is saved smaller as a JPEG.
    setSource({ bitmap: opened.bitmap, name: file.name, type: file.type === 'image/png' ? 'image/png' : 'image/jpeg' });
  }, []);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name="Chat" src={value || fallback} size={64} />
        <div className="grid gap-1.5">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" leading={<ImagePlus />} disabled={disabled || busy} loading={busy} onClick={() => input.current?.click()}>
              {value ? 'Replace' : 'Upload a picture'}
            </Button>
            {value && (
              <Button size="sm" variant="quiet" leading={<Trash2 />} disabled={disabled || busy} onClick={() => void onRemove()}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-faint">{value ? 'Shown in the chat header.' : fallback ? 'Using your business logo. Upload a picture to replace it.' : 'Shown in the chat header. Without one, a chat icon is used.'}</p>
        </div>
      </div>
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) void choose(e.dataTransfer.files[0]);
        }}
        className={cn('grid place-items-center gap-1 rounded-[14px] border border-dashed px-4 py-5 text-center text-xs text-ink-faint transition-colors', over ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong')}
      >
        <Upload className="size-4" aria-hidden />
        <span>Drop a picture here. PNG, JPEG or WebP; you can move and zoom it next.</span>
      </div>
      <input
        ref={input}
        type="file"
        accept={TYPES.join(',')}
        hidden
        data-testid="widget-picture-input"
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {source && (
        <CropDialog
          source={source}
          onClose={() => {
            source.bitmap.close();
            setSource(null);
          }}
          onSave={async (file) => {
            await onSave(file);
            source.bitmap.close();
            setSource(null);
          }}
        />
      )}
    </div>
  );
}

function CropDialog({
  source,
  onClose,
  onSave,
}: {
  source: { bitmap: ImageBitmap; name: string; type: 'image/png' | 'image/jpeg' };
  onClose: () => void;
  onSave: (file: File) => Promise<unknown>;
}) {
  const { bitmap } = source;
  const w = bitmap.width;
  const h = bitmap.height;
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [center, setCenter] = useState<Point>(() => centered(w, h));
  const [saving, setSaving] = useState(false);
  // State, not refs: the dialog's content mounts a moment after this component, and drawing waits for it.
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // The frame shows the picture where the person put it; the small round preview shows what the header will.
  useEffect(() => {
    const frame = canvas;
    if (frame) {
      const dpr = window.devicePixelRatio || 1;
      frame.width = frame.height = Math.round(VIEW * dpr);
      const ctx = frame.getContext('2d');
      if (ctx) {
        const p = placement(w, h, VIEW, zoom, center);
        ctx.clearRect(0, 0, frame.width, frame.height);
        ctx.drawImage(bitmap, p.left * dpr, p.top * dpr, p.width * dpr, p.height * dpr);
      }
    }
    const small = preview;
    if (small) {
      small.width = small.height = 76;
      const ctx = small.getContext('2d');
      if (ctx) {
        const s = squareOf(w, h, VIEW, zoom, center);
        ctx.clearRect(0, 0, 76, 76);
        ctx.drawImage(bitmap, s.sx, s.sy, s.size, s.size, 0, 0, 76, 76);
      }
    }
  }, [bitmap, w, h, zoom, center, canvas, preview]);

  const fit = () => {
    setZoom(MIN_ZOOM);
    setCenter(centered(w, h));
  };

  const save = async () => {
    setSaving(true);
    try {
      const square = squareOf(w, h, VIEW, zoom, center);
      const blob = await exportSquare(bitmap, square, exportSide(square), source.type);
      const ext = source.type === 'image/png' ? 'png' : 'jpg';
      await onSave(new File([blob], `widget-picture.${ext}`, { type: source.type }));
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "The picture couldn't be prepared.");
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      size="sm"
      title="Adjust the picture"
      description="Drag to move it and use the slider to zoom. The circle is what visitors see."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="accent" loading={saving} onClick={() => void save()}>
            Use this picture
          </Button>
        </>
      }
    >
      <div className="grid justify-items-center gap-4">
        <div
          className="relative touch-none select-none overflow-hidden rounded-[14px] bg-surface-2"
          style={{ width: VIEW, height: VIEW, cursor: 'grab' }}
          data-testid="crop-frame"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = e.clientX - drag.current.x;
            const dy = e.clientY - drag.current.y;
            drag.current = { x: e.clientX, y: e.clientY };
            setCenter((c) => pan(w, h, VIEW, zoom, c, dx, dy));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(e) => {
            const next = zoomTo(w, h, VIEW, zoom - e.deltaY / 400, center);
            setZoom(next.zoom);
            setCenter(next.center);
          }}
        >
          <canvas ref={setCanvas} style={{ width: VIEW, height: VIEW }} aria-label="The picture, to move and zoom" />
          {/* Everything outside the circle is dimmed. */}
          <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: '0 0 0 999px rgba(0,0,0,0.5)' }} aria-hidden />
        </div>
        <div className="flex w-full items-center gap-3">
          <Slider
            label="Zoom"
            value={zoom}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            onValueChange={(z) => {
              const next = zoomTo(w, h, VIEW, z, center);
              setZoom(next.zoom);
              setCenter(next.center);
            }}
          />
          <Button size="xs" variant="soft" icon aria-label="Fit the picture" onClick={fit}>
            <Maximize2 />
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-faint">
          <canvas ref={setPreview} className="size-[38px] rounded-full bg-surface-2" aria-hidden />
          <span>How it looks in the chat header</span>
        </div>
      </div>
    </Dialog>
  );
}

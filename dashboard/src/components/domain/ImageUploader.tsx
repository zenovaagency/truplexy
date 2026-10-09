import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Avatar, Button } from '@/components/ui';
import { notifyError } from '@/lib/notify';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 512 * 1024;
const MIN_SIDE = 16;
const MAX_SIDE = 4096;

/** The same rules the API enforces, so most mistakes are caught before the upload. */
async function check(file: File): Promise<string | null> {
  if (!TYPES.includes(file.type)) return 'Use a PNG, JPEG or WebP image. SVG and GIF files are not supported.';
  if (file.size > MAX_BYTES) return 'The image is larger than 512 KiB.';
  try {
    const bmp = await createImageBitmap(file);
    const { width, height } = bmp;
    bmp.close();
    if (Math.min(width, height) < MIN_SIDE || Math.max(width, height) > MAX_SIDE) return `The image must be ${MIN_SIDE}–${MAX_SIDE} pixels on each side.`;
  } catch {
    return "That file can't be read as an image.";
  }
  return null;
}

/** A picture with Upload / Remove, for a person's avatar, a business logo or a bot's picture. */
export function ImageUploader({
  name,
  email,
  src,
  rounded = 'rounded-full',
  disabled,
  busy,
  onUpload,
  onRemove,
}: {
  name: string;
  email?: string;
  src?: string | null;
  rounded?: string;
  disabled?: boolean;
  busy?: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);

  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    setChecking(true);
    const problem = await check(file);
    setChecking(false);
    if (problem) return notifyError(new Error(problem), "That image can't be used");
    onUpload(file);
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} email={email} src={src} size={64} className={rounded} />
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" hidden accept={TYPES.join(',')} onChange={(e) => void pick(e.target.files?.[0])} />
          <Button size="xs" leading={<ImagePlus />} loading={busy || checking} onClick={() => input.current?.click()}>
            {src ? 'Replace' : 'Upload'}
          </Button>
          {src && (
            <Button size="xs" variant="ghost" leading={<Trash2 />} disabled={busy} onClick={onRemove}>
              Remove
            </Button>
          )}
          <span className="text-xs text-ink-faint">PNG, JPEG or WebP · up to 512 KiB</span>
        </div>
      )}
    </div>
  );
}

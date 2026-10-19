/**
 * Optional speed-up: shrink a very large photo in the browser before it is
 * hashed and uploaded. The server shrinks every picture to 1280 px anyway, so
 * this is never required and every failure falls back to the original file.
 */

/** Long edge of the shrunk copy: comfortably above the server's 1280 px, so text in a screenshot stays sharp. */
export const DOWNSCALE_EDGE = 2048;
const PHOTO_MIN_BYTES = 1.5 * 1024 * 1024;
/** Screenshots and diagrams are usually PNGs: leave them alone unless the file is huge. */
const PNG_MIN_BYTES = 8 * 1024 * 1024;

export interface Plan {
  width: number;
  height: number;
  /** Same format as the original, so transparency and sharp edges survive. */
  type: 'image/jpeg' | 'image/png' | 'image/webp';
}

/** Whether (and to what) to shrink. Pure, so the rules are testable without a canvas. */
export function planDownscale(img: { width: number; height: number; type: string; size: number }): Plan | null {
  const longEdge = Math.max(img.width, img.height);
  if (longEdge <= DOWNSCALE_EDGE) return null;
  const type = img.type as Plan['type'];
  if (type !== 'image/jpeg' && type !== 'image/png' && type !== 'image/webp') return null;
  if (img.size < (type === 'image/png' ? PNG_MIN_BYTES : PHOTO_MIN_BYTES)) return null;
  const scale = DOWNSCALE_EDGE / longEdge;
  return { type, width: Math.max(1, Math.round(img.width * scale)), height: Math.max(1, Math.round(img.height * scale)) };
}

/** The shrunk copy, or the original when shrinking isn't worthwhile or isn't possible here. */
export async function downscale(file: File): Promise<File> {
  try {
    if (typeof createImageBitmap !== 'function') return file;
    const bmp = await createImageBitmap(file); // applies the photo's EXIF rotation
    const plan = planDownscale({ width: bmp.width, height: bmp.height, type: file.type, size: file.size });
    if (!plan) {
      bmp.close();
      return file;
    }
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(plan.width, plan.height) : Object.assign(document.createElement('canvas'), { width: plan.width, height: plan.height });
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) {
      bmp.close();
      return file;
    }
    ctx.drawImage(bmp, 0, 0, plan.width, plan.height);
    bmp.close();
    const blob =
      canvas instanceof HTMLCanvasElement
        ? await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, plan.type, 0.9))
        : await canvas.convertToBlob({ type: plan.type, quality: 0.9 });
    // A browser that can't encode the format hands back another one (Safari and WebP): keep the original then.
    if (!blob || blob.type !== plan.type || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: blob.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

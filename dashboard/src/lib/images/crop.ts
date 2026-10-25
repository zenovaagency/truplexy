/*
 * The maths of a square crop: an image shown in a square viewport, zoomed and moved by the person.
 * Zoom 1 is "fit": the image covers the viewport exactly, with its short side filling it, so nothing
 * is left empty. Positions are in the image's own pixels, so they survive a resize of the viewport.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export interface Point {
  x: number;
  y: number;
}

/** The part of the image that is shown, in the image's pixels. */
export interface Square {
  sx: number;
  sy: number;
  size: number;
}

/** Screen pixels per image pixel at `zoom` for a `view`-pixel viewport. */
export function scaleFor(w: number, h: number, view: number, zoom: number): number {
  return (view / Math.min(w, h)) * clampZoom(zoom);
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** The middle of the image: what "fit" shows. */
export const centered = (w: number, h: number): Point => ({ x: w / 2, y: h / 2 });

/** Keeps the viewport inside the image, so no edge of it is ever empty. */
export function clampCenter(w: number, h: number, view: number, zoom: number, c: Point): Point {
  const half = view / scaleFor(w, h, view, zoom) / 2;
  return { x: Math.min(w - half, Math.max(half, c.x)), y: Math.min(h - half, Math.max(half, c.y)) };
}

/** The new centre after the image is dragged by (dx, dy) screen pixels. */
export function pan(w: number, h: number, view: number, zoom: number, c: Point, dx: number, dy: number): Point {
  const k = scaleFor(w, h, view, zoom);
  return clampCenter(w, h, view, zoom, { x: c.x - dx / k, y: c.y - dy / k });
}

/** The same spot stays in the middle when the zoom changes, kept inside the image. */
export function zoomTo(w: number, h: number, view: number, zoom: number, c: Point): { zoom: number; center: Point } {
  const z = clampZoom(zoom);
  return { zoom: z, center: clampCenter(w, h, view, z, c) };
}

/** The part of the image to cut out for this view. */
export function squareOf(w: number, h: number, view: number, zoom: number, c: Point): Square {
  const z = clampZoom(zoom);
  const size = view / scaleFor(w, h, view, z);
  const at = clampCenter(w, h, view, z, c);
  return { sx: at.x - size / 2, sy: at.y - size / 2, size };
}

/** Where the whole image sits in the viewport, in screen pixels, for drawing it. */
export function placement(w: number, h: number, view: number, zoom: number, c: Point) {
  const k = scaleFor(w, h, view, zoom);
  const at = clampCenter(w, h, view, zoom, c);
  return { left: view / 2 - at.x * k, top: view / 2 - at.y * k, width: w * k, height: h * k };
}

/** The side of the exported picture: the cut is never enlarged past its own pixels. */
export function exportSide(square: Square, max = 512): number {
  return Math.max(16, Math.min(max, Math.floor(square.size)));
}

/**
 * Cuts `square` out of `source` and returns it as a `side`×`side` picture. PNG keeps transparency;
 * a photo is saved as JPEG, which is smaller.
 */
export async function exportSquare(source: CanvasImageSource, square: Square, side: number, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("This browser can't crop pictures.");
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, square.sx, square.sy, square.size, square.size, 0, 0, side, side);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture couldn't be prepared."))), type, 0.9));
}

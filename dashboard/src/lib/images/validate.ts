import { formatBytes, pluralize } from '@/lib/format';
import type { PictureLimits } from './feature';

/**
 * Friendly local checks before anything is uploaded. They only save a round
 * trip: the server reads the real bytes and stays the authority.
 */

const TYPE_NAME: Record<string, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' };
const EXTENSION_TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const TYPE_EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** "JPEG, PNG or WebP", from the types the server allows. */
export function typeList(contentTypes: string[]) {
  const names = contentTypes.map((t) => TYPE_NAME[t] ?? t.replace(/^image\//, '').toUpperCase());
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : (names[0] ?? 'image');
}

/** The type to register: the file's own, else what its extension says (pasted and dragged files sometimes have none). */
export function pictureType(file: Pick<File, 'type' | 'name'>) {
  if (file.type) return file.type.toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPE[ext] ?? '';
}

/** A name the API accepts: up to 260 characters, no slashes, ending in .jpg, .jpeg, .png or .webp that matches the type. */
export function registrationName(file: Pick<File, 'type' | 'name'>) {
  const type = pictureType(file);
  const wanted = TYPE_EXTENSION[type] ?? 'jpg';
  const base = (file.name.split(/[\\/]/).pop() ?? '').trim();
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  const stem = (dot > 0 ? base.slice(0, dot) : base) || 'picture';
  const sameKind = EXTENSION_TYPE[ext] === type;
  return `${stem.slice(0, 260 - wanted.length - 1)}.${sameKind ? ext : wanted}`.slice(0, 260);
}

/** What is wrong with this file, in words for the person, or null. `already` counts the pictures on the message. */
export function checkPicture(file: Pick<File, 'type' | 'name' | 'size'>, limits: PictureLimits, already: number): string | null {
  if (already >= limits.maxPerMessage) {
    return `You can attach up to ${pluralize(limits.maxPerMessage, 'picture')} to a message.`;
  }
  if (!limits.contentTypes.includes(pictureType(file))) return `Use a ${typeList(limits.contentTypes)} picture.`;
  if (file.size <= 0) return `${file.name || 'That file'} is empty.`;
  if (file.size > limits.maxBytes) {
    return `${file.name || 'That picture'} is ${formatBytes(file.size)}, over the ${formatBytes(limits.maxBytes)} limit. Choose a smaller picture.`;
  }
  return null;
}

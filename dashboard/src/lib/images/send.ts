import { isApiError } from '@/lib/api/client';
import type { PictureSet } from './pictures';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends with the pictures that are ready. Two failures have a fix that needs no
 * decision from the person, so each gets one automatic second try:
 *
 * - `ATTACHMENT_NOT_UPLOADED`: the `PUT` hadn't landed. Wait for uploads, then send again.
 * - `ATTACHMENT_NOT_FOUND`: expired (an hour) or already used. Register and upload every picture again, then send.
 *
 * Every other error is thrown for the caller to show. A picture error happens
 * before anything is stored or paid for, so there is nothing to clean up.
 */
export async function sendWithPictures<R>(pictures: PictureSet, send: (attachmentIds: string[]) => Promise<R>, settleMs = 800): Promise<R> {
  try {
    return await send(pictures.readyIds());
  } catch (e) {
    if (!isApiError(e)) throw e;
    if (e.code === 'ATTACHMENT_NOT_UPLOADED') {
      await pictures.whenIdle();
      await wait(settleMs);
    } else if (e.code === 'ATTACHMENT_NOT_FOUND') {
      await pictures.reupload();
    } else throw e;
    const ids = pictures.readyIds();
    if (!ids.length || ids.length !== pictures.size) throw e; // something failed again: show the original problem
    return await send(ids);
  }
}

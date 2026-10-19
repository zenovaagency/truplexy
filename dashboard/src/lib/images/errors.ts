import { isApiError } from '@/lib/api/client';
import { describeError, type Described } from '@/lib/errors';
import type { PictureOffReason } from './feature';

/**
 * What a picture error means and what to do about it. The codes
 * INVALID_IMAGE, IMAGE_TOO_LARGE and UNSUPPORTED_IMAGE_TYPE are also what
 * avatar uploads answer, with other limits, so `describeError` can't word them
 * for pictures: this does, and only for the picture calls.
 *
 * Matches on `code` (and `limit`), never on text.
 */
export type PictureAction =
  /** The file can't be used: take it off the message. */
  | 'remove'
  /** Wait for the upload to finish, then send again. */
  | 'wait'
  /** The attachment is gone (expired or used): upload the pictures again, then send. */
  | 'reupload'
  /** The feature isn't available to this business or right now: hide the control. */
  | 'hide'
  /** Anything else: show it, and let the person retry. */
  | 'retry';

export interface PictureProblem extends Described {
  action: PictureAction;
  /** Why the control should go, for `hide`. */
  offReason?: PictureOffReason;
}

export function describePictureError(e: unknown): PictureProblem {
  if (isApiError(e)) {
    const base = { code: e.code, requestId: e.requestId };
    switch (e.code) {
      case 'UNSUPPORTED_IMAGE_TYPE':
        return { ...base, title: 'Use a JPEG, PNG or WebP picture', detail: 'That file type is not supported.', action: 'remove' };
      case 'INVALID_IMAGE':
        // The message names the rule that failed (unreadable, too small, too many pixels).
        return { ...base, title: "That picture can't be used", detail: e.message, action: 'remove' };
      case 'IMAGE_TOO_LARGE':
        return { ...base, title: 'That picture is too large', detail: 'Choose a smaller or simpler picture.', action: 'remove' };
      case 'ATTACHMENT_NOT_UPLOADED':
        return { ...base, title: "A picture hadn't finished uploading", detail: 'Wait for it to finish, then send again.', action: 'wait' };
      case 'ATTACHMENT_NOT_FOUND':
        return { ...base, title: 'A picture expired', detail: 'Pictures must be sent within an hour of being added. It needs to be uploaded again.', action: 'reupload' };
      case 'FEATURE_UNAVAILABLE':
        return { ...base, title: "Pictures aren't available right now", detail: 'No assistant model can read pictures at the moment.', action: 'hide', offReason: 'no_vision_model' };
      case 'PLAN_LIMIT_REACHED':
        if (e.limit === 'image_input') {
          return { ...base, title: "Your plan doesn't include pictures", detail: 'Upgrade the plan to let customers send pictures. See Settings → Plan & usage.', action: 'hide', offReason: 'plan' };
        }
    }
  }
  return { ...describeError(e), action: 'retry' };
}

/** The picture errors that happen before anything is stored or paid for: the message can be sent again as it was. */
export const isPictureError = (e: unknown) =>
  isApiError(e) &&
  (['UNSUPPORTED_IMAGE_TYPE', 'INVALID_IMAGE', 'IMAGE_TOO_LARGE', 'ATTACHMENT_NOT_UPLOADED', 'ATTACHMENT_NOT_FOUND', 'FEATURE_UNAVAILABLE'].includes(e.code) ||
    (e.code === 'PLAN_LIMIT_REACHED' && e.limit === 'image_input'));

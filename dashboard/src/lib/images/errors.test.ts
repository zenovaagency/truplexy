import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { describeError } from '@/lib/errors';
import { describePictureError, isPictureError } from './errors';

const api = (code: string, status: number, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ code, status, message: `server text for ${code}`, requestId: 'req_abc', ...extra });

describe('describePictureError', () => {
  it('UNSUPPORTED_IMAGE_TYPE: use another type, and remove the file', () => {
    const p = describePictureError(api('UNSUPPORTED_IMAGE_TYPE', 400));
    expect(p.title).toBe('Use a JPEG, PNG or WebP picture');
    expect(p.action).toBe('remove');
    expect(p.requestId).toBe('req_abc');
  });

  it("INVALID_IMAGE: shows the server's message and removes the file", () => {
    const p = describePictureError(api('INVALID_IMAGE', 400, { message: 'The picture is under 8 px on one side.' }));
    expect(p.detail).toBe('The picture is under 8 px on one side.');
    expect(p.action).toBe('remove');
  });

  it('IMAGE_TOO_LARGE: asks for a smaller picture and removes the file', () => {
    const p = describePictureError(api('IMAGE_TOO_LARGE', 413));
    expect(p.detail).toMatch(/smaller/);
    expect(p.action).toBe('remove');
  });

  it('ATTACHMENT_NOT_UPLOADED: wait, then send again', () => {
    const p = describePictureError(api('ATTACHMENT_NOT_UPLOADED', 409));
    expect(p.action).toBe('wait');
    expect(p.detail).toMatch(/send again/i);
  });

  it('ATTACHMENT_NOT_FOUND: upload that picture again', () => {
    const p = describePictureError(api('ATTACHMENT_NOT_FOUND', 404));
    expect(p.action).toBe('reupload');
    expect(p.detail).toMatch(/hour/);
  });

  it('PLAN_LIMIT_REACHED with limit image_input: hide the control, say the plan has no pictures', () => {
    const p = describePictureError(api('PLAN_LIMIT_REACHED', 403, { limit: 'image_input' }));
    expect(p.action).toBe('hide');
    expect(p.offReason).toBe('plan');
    expect(p.title).toMatch(/plan/);
  });

  it('FEATURE_UNAVAILABLE: hide the control, no model can read pictures', () => {
    const p = describePictureError(api('FEATURE_UNAVAILABLE', 400));
    expect(p.action).toBe('hide');
    expect(p.offReason).toBe('no_vision_model');
  });

  it('PLAN_LIMIT_REACHED with another limit keeps its existing behaviour', () => {
    const e = api('PLAN_LIMIT_REACHED', 429, { limit: 'replies_per_month' });
    expect(describePictureError(e)).toMatchObject({ action: 'retry', title: describeError(e).title, detail: describeError(e).detail });
    expect(isPictureError(e)).toBe(false);
  });

  it('matches on the code, never on the text', () => {
    const p = describePictureError(api('INVALID_IMAGE', 400, { message: 'IMAGE_TOO_LARGE! unsupported! expired!' }));
    expect(p.action).toBe('remove');
    expect(p.title).toBe("That picture can't be used");
  });

  it('leaves everything else to the existing wording', () => {
    const p = describePictureError(api('LLM_PROVIDER_ERROR', 502));
    expect(p.action).toBe('retry');
    expect(p.title).toBe(describeError(api('LLM_PROVIDER_ERROR', 502)).title);
    expect(describePictureError(new Error('boom')).title).toBe('Something went wrong');
  });
});

describe('avatar wording is untouched', () => {
  it('describeError still words the shared codes for avatars', () => {
    expect(describeError(api('IMAGE_TOO_LARGE', 413)).detail).toMatch(/512 KiB/);
    expect(describeError(api('UNSUPPORTED_IMAGE_TYPE', 415)).title).toBe('Use a PNG, JPEG or WebP image');
  });

  it('an image_input plan limit is worded for pictures wherever describeError is used', () => {
    expect(describeError(api('PLAN_LIMIT_REACHED', 403, { limit: 'image_input' })).detail).toMatch(/pictures/);
  });
});

describe('isPictureError', () => {
  it.each(['UNSUPPORTED_IMAGE_TYPE', 'INVALID_IMAGE', 'IMAGE_TOO_LARGE', 'ATTACHMENT_NOT_UPLOADED', 'ATTACHMENT_NOT_FOUND', 'FEATURE_UNAVAILABLE'])('%s', (code) => {
    expect(isPictureError(api(code, 400))).toBe(true);
  });
  it('is false for plain errors', () => {
    expect(isPictureError(new Error('x'))).toBe(false);
    expect(isPictureError(api('TIMEOUT', 504))).toBe(false);
  });
});

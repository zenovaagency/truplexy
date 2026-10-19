import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/client';
import type { AttachmentUpload } from '@/lib/api/types';
import { PictureSet, type PictureDeps } from './pictures';
import { PutError } from './put';
import { sendWithPictures } from './send';

const limits = { maxBytes: 20 * 1024 * 1024, maxPerMessage: 3, contentTypes: ['image/jpeg', 'image/png', 'image/webp'] };

const apiError = (code: string, status: number, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ code, status, message: `text for ${code}`, requestId: 'req_1', ...extra });

const jpg = (name = 'a.jpg', size = 2048) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' });

/** Fakes for everything outside the set: registration, R2, hashing and object URLs. */
function setup(over: Partial<PictureDeps> = {}) {
  let n = 0;
  const registered: unknown[] = [];
  const puts: { url: string; headers: Record<string, string>; file: Blob }[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  const deps: PictureDeps = {
    register: vi.fn(async (body): Promise<AttachmentUpload> => {
      registered.push(body);
      const id = `att_${String(++n).padStart(32, '0')}`;
      return { attachment: { id, status: 'pending', filename: body.filename, content_type: body.content_type, size: body.size }, url: `https://r2.example/${id}`, method: 'PUT', headers: { 'Content-Type': body.content_type, 'x-sig': id }, expires_at: '2026-10-19T12:15:00Z' };
    }),
    put: vi.fn(async (t, file, onProgress) => {
      puts.push({ url: t.url, headers: t.headers, file });
      onProgress(1);
    }),
    hash: vi.fn(async () => 'f'.repeat(64)),
    limits: () => limits,
    createObjectURL: () => {
      const u = `blob:preview-${created.length + 1}`;
      created.push(u);
      return u;
    },
    revokeObjectURL: (u) => void revoked.push(u),
    backoffMs: [0, 0],
    ...over,
  };
  return { set: new PictureSet(deps), deps, registered, puts, created, revoked };
}

describe('uploading a picture', () => {
  it('hashes, registers the declared details, PUTs with exactly the returned headers, then is ready', async () => {
    const { set, registered, puts, deps } = setup();
    const f = jpg('beach.jpg', 4096);
    expect(set.add([f])).toEqual([]);
    expect(set.getSnapshot()[0]!.phase).toMatch(/queued|preparing/);
    await set.whenIdle();

    expect(registered).toEqual([{ filename: 'beach.jpg', content_type: 'image/jpeg', size: 4096, sha256: 'f'.repeat(64) }]);
    expect(deps.hash).toHaveBeenCalledWith(f);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.headers).toEqual({ 'Content-Type': 'image/jpeg', 'x-sig': puts[0]!.url.split('/').pop() });
    expect(puts[0]!.file).toBe(f);
    expect(set.getSnapshot()[0]).toMatchObject({ phase: 'ready', progress: 1, name: 'beach.jpg', previewUrl: 'blob:preview-1' });
    expect(set.readyIds()).toEqual([set.getSnapshot()[0]!.attachmentId]);
    expect(set.busy).toBe(false);
  });

  it('starts uploading as soon as a picture is picked, and notifies subscribers as it goes', async () => {
    const { set } = setup();
    const seen: string[] = [];
    set.subscribe(() => seen.push(set.getSnapshot()[0]?.phase ?? 'none'));
    set.add([jpg()]);
    await set.whenIdle();
    expect(seen).toEqual(expect.arrayContaining(['queued', 'preparing', 'registering', 'uploading', 'ready']));
  });

  it('uploads at most three at a time', async () => {
    let live = 0;
    let peak = 0;
    const { set } = setup({
      limits: () => ({ ...limits, maxPerMessage: 6 }),
      put: async () => {
        peak = Math.max(peak, ++live);
        await new Promise((r) => setTimeout(r, 5));
        live--;
      },
    });
    set.add([jpg('1.jpg'), jpg('2.jpg'), jpg('3.jpg'), jpg('4.jpg'), jpg('5.jpg')]);
    await set.whenIdle();
    expect(peak).toBe(3);
    expect(set.readyIds()).toHaveLength(5);
  });

  it('keeps the order the pictures were added in', async () => {
    const { set } = setup();
    set.add([jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')]);
    await set.whenIdle();
    expect(set.getSnapshot().map((p) => p.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(set.readyIds()).toEqual(set.getSnapshot().map((p) => p.attachmentId));
  });

  it('reports progress while uploading', async () => {
    const progress: number[] = [];
    const { set } = setup({
      put: async (_t, _f, onProgress) => {
        onProgress(0.25);
        progress.push(set.getSnapshot()[0]!.progress);
        onProgress(0.75);
        progress.push(set.getSnapshot()[0]!.progress);
      },
    });
    set.add([jpg()]);
    await set.whenIdle();
    expect(progress).toEqual([0.25, 0.75]);
  });

  it('is busy until every upload is done, and has no IDs to send before that', async () => {
    const { set } = setup();
    set.add([jpg('a.jpg'), jpg('b.jpg')]);
    expect(set.busy).toBe(true);
    expect(set.readyIds()).toEqual([]);
    await set.whenIdle();
    expect(set.busy).toBe(false);
    expect(set.readyIds()).toHaveLength(2);
  });

  it('shrinks first when asked to, and uploads the shrunk copy', async () => {
    const small = jpg('small.jpg', 100);
    const { set, registered, puts } = setup({ prepare: async () => small });
    set.add([jpg('huge.jpg', 9000)]);
    await set.whenIdle();
    expect(registered[0]).toMatchObject({ filename: 'small.jpg', size: 100 });
    expect(puts[0]!.file).toBe(small);
  });
});

describe('turning pictures away locally', () => {
  it('refuses a fourth picture, a wrong type and an oversized file, with words for the person', () => {
    const { set } = setup();
    const msgs = set.add([jpg('1.jpg'), jpg('2.jpg'), jpg('3.jpg'), jpg('4.jpg')]);
    expect(msgs).toEqual(['You can attach up to 3 pictures to a message.']);
    expect(set.size).toBe(3);

    const other = setup();
    expect(other.set.add([new File(['x'], 'doc.pdf', { type: 'application/pdf' })])).toEqual(['Use a JPEG, PNG or WebP picture.']);
    expect(other.set.add([new File([new Uint8Array(limits.maxBytes + 1)], 'big.png', { type: 'image/png' })])[0]).toMatch(/over the 20 MB limit/);
    expect(other.set.size).toBe(0);
  });

  it('does nothing when the feature check says pictures are off', () => {
    const { set } = setup({ limits: () => null });
    expect(set.add([jpg()])).toEqual([]);
    expect(set.size).toBe(0);
  });
});

describe('errors from registering', () => {
  it.each([
    ['UNSUPPORTED_IMAGE_TYPE', 400],
    ['IMAGE_TOO_LARGE', 413],
  ])('%s: the picture is marked failed and cannot be retried, with no automatic retry', async (code, status) => {
    const { set, deps } = setup({ register: vi.fn(async () => Promise.reject(apiError(code, status))) });
    set.add([jpg()]);
    await set.whenIdle();
    const p = set.getSnapshot()[0]!;
    expect(p.phase).toBe('failed');
    expect(p.retryable).toBe(false);
    expect(p.problem?.code).toBe(code);
    expect(p.problem?.requestId).toBe('req_1');
    expect(deps.register).toHaveBeenCalledTimes(1);
    set.retry(p.key); // nothing to retry
    expect(set.getSnapshot()[0]!.phase).toBe('failed');
  });

  it('PLAN_LIMIT_REACHED with image_input: tells the page to hide the control', async () => {
    const onUnavailable = vi.fn();
    const { set } = setup({ register: async () => Promise.reject(apiError('PLAN_LIMIT_REACHED', 403, { limit: 'image_input' })), onUnavailable });
    set.add([jpg()]);
    await set.whenIdle();
    expect(onUnavailable).toHaveBeenCalledWith(expect.objectContaining({ offReason: 'plan' }));
  });

  it('FEATURE_UNAVAILABLE: tells the page no model can read pictures', async () => {
    const onUnavailable = vi.fn();
    const { set } = setup({ register: async () => Promise.reject(apiError('FEATURE_UNAVAILABLE', 400)), onUnavailable });
    set.add([jpg()]);
    await set.whenIdle();
    expect(onUnavailable).toHaveBeenCalledWith(expect.objectContaining({ offReason: 'no_vision_model' }));
  });

  it('another plan limit is an ordinary failure the person can retry', async () => {
    const onUnavailable = vi.fn();
    const { set } = setup({ register: async () => Promise.reject(apiError('PLAN_LIMIT_REACHED', 429, { limit: 'replies_per_month' })), onUnavailable });
    set.add([jpg()]);
    await set.whenIdle();
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(set.getSnapshot()[0]).toMatchObject({ phase: 'failed', retryable: true });
  });
});

describe('a dropped connection mid-PUT', () => {
  it('is retried twice with backoff and then succeeds', async () => {
    const put = vi.fn().mockRejectedValueOnce(new PutError(0, 'cut off')).mockRejectedValueOnce(new PutError(502, 'bad gateway')).mockResolvedValue(undefined);
    const { set, deps } = setup({ put });
    set.add([jpg()]);
    await set.whenIdle();
    expect(put).toHaveBeenCalledTimes(3);
    expect(deps.register).toHaveBeenCalledTimes(1); // same registration, same URL
    expect(set.getSnapshot()[0]!.phase).toBe('ready');
  });

  it('fails after the retries, and Retry registers again for a fresh URL', async () => {
    const put = vi.fn().mockRejectedValue(new PutError(0, 'The upload was interrupted. Check your connection.'));
    const { set, deps } = setup({ put });
    set.add([jpg()]);
    await set.whenIdle();
    expect(put).toHaveBeenCalledTimes(3);
    const failed = set.getSnapshot()[0]!;
    expect(failed).toMatchObject({ phase: 'failed', retryable: true });
    expect(failed.problem?.title).toBe('Upload failed');

    put.mockReset();
    put.mockResolvedValue(undefined);
    set.retry(failed.key);
    await set.whenIdle();
    expect(deps.register).toHaveBeenCalledTimes(2);
    expect(deps.hash).toHaveBeenCalledTimes(1); // the hash is kept
    expect(set.getSnapshot()[0]!.phase).toBe('ready');
  });
});

describe('removing, clearing and handing over', () => {
  it('removing a picture mid-upload cancels it and revokes its preview', async () => {
    let signal: AbortSignal | undefined;
    const { set, revoked } = setup({
      put: (_t, _f, _p, s) =>
        new Promise((_resolve, reject) => {
          signal = s;
          s?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    });
    set.add([jpg()]);
    await vi.waitFor(() => expect(set.getSnapshot()[0]?.phase).toBe('uploading'));
    set.remove(set.getSnapshot()[0]!.key);
    expect(signal!.aborted).toBe(true);
    expect(set.size).toBe(0);
    expect(revoked).toEqual(['blob:preview-1']);
    await set.whenIdle();
    expect(set.getSnapshot()).toEqual([]);
  });

  it('clear() ("new chat", leaving the page) drops every picture and revokes every preview', async () => {
    const { set, revoked, created } = setup();
    set.add([jpg('a.jpg'), jpg('b.jpg')]);
    await set.whenIdle();
    set.clear();
    expect(set.getSnapshot()).toEqual([]);
    expect(set.readyIds()).toEqual([]);
    expect(revoked.sort()).toEqual([...created].sort());
  });

  it('take() hands the pictures over without revoking; release() revokes them afterwards', async () => {
    const { set, revoked } = setup();
    set.add([jpg('a.jpg')]);
    await set.whenIdle();
    const sent = set.take();
    expect(sent).toEqual([{ key: expect.any(String), name: 'a.jpg', previewUrl: 'blob:preview-1' }]);
    expect(set.size).toBe(0);
    expect(revoked).toEqual([]);
    set.release(sent);
    expect(revoked).toEqual(['blob:preview-1']);
  });

  it('a clear() while pictures are still uploading does not leave them running or ready', async () => {
    const { set } = setup({ put: () => new Promise(() => {}) });
    set.add([jpg()]);
    await vi.waitFor(() => expect(set.getSnapshot()[0]?.phase).toBe('uploading'));
    set.clear();
    await set.whenIdle();
    expect(set.size).toBe(0);
  });
});

describe('sending with pictures', () => {
  const ready = async (n = 1) => {
    const ctx = setup();
    ctx.set.add(Array.from({ length: n }, (_, i) => jpg(`p${i}.jpg`)));
    await ctx.set.whenIdle();
    return ctx;
  };

  it('sends the IDs of the pictures once, and returns the result', async () => {
    const { set } = await ready(2);
    const ids = set.readyIds();
    const send = vi.fn(async (a: string[]) => ({ ok: a }));
    await expect(sendWithPictures(set, send)).resolves.toEqual({ ok: ids });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ATTACHMENT_NOT_FOUND: uploads the pictures again, then sends with the new IDs', async () => {
    const { set, deps } = await ready(2);
    const old = set.readyIds();
    const send = vi.fn(async (ids: string[]) => {
      if (send.mock.calls.length === 1) throw apiError('ATTACHMENT_NOT_FOUND', 404);
      return ids;
    });
    const sent = await sendWithPictures(set, send);
    expect(deps.register).toHaveBeenCalledTimes(4);
    expect(sent).toHaveLength(2);
    expect(sent).not.toEqual(old);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('ATTACHMENT_NOT_UPLOADED: waits for uploads to finish, then sends again once', async () => {
    const { set } = await ready();
    const send = vi.fn(async (ids: string[]) => {
      if (send.mock.calls.length === 1) throw apiError('ATTACHMENT_NOT_UPLOADED', 409);
      return ids;
    });
    await expect(sendWithPictures(set, send, 0)).resolves.toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a second failure is thrown, not retried forever', async () => {
    const { set } = await ready();
    const send = vi.fn(async () => {
      throw apiError('ATTACHMENT_NOT_FOUND', 404);
    });
    await expect(sendWithPictures(set, send)).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['INVALID_IMAGE', 400],
    ['UNSUPPORTED_IMAGE_TYPE', 400],
    ['IMAGE_TOO_LARGE', 413],
  ])('%s is never retried automatically', async (code, status) => {
    const { set } = await ready();
    const send = vi.fn(async () => {
      throw apiError(code, status);
    });
    await expect(sendWithPictures(set, send)).rejects.toMatchObject({ code });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('shows the original problem when re-uploading itself fails', async () => {
    const { set, deps } = await ready();
    (deps.register as ReturnType<typeof vi.fn>).mockRejectedValue(apiError('IMAGE_TOO_LARGE', 413));
    const send = vi.fn(async () => {
      throw apiError('ATTACHMENT_NOT_FOUND', 404);
    });
    await expect(sendWithPictures(set, send)).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('invalidate() sends every picture back to "upload again" when the failing file is not named', async () => {
    const { set } = await ready(2);
    set.invalidate();
    expect(set.getSnapshot().every((p) => p.phase === 'failed' && p.retryable)).toBe(true);
    expect(set.readyIds()).toEqual([]);
    await set.reupload();
    expect(set.readyIds()).toHaveLength(2);
  });
});

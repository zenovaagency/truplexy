// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATTACHMENT_ERROR_CODES, describeImage, putImage, TruplexyUploadError, uploadImage, type UploadTarget } from '../src';

const target: UploadTarget = { attachmentId: 'att_1', url: 'https://r2.example/att_1?sig=abc', headers: { 'Content-Type': 'image/png', 'x-amz-meta-sig': 'zzz' } };
const png = () => new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])], 'Screen Shot.PNG', { type: 'image/png' });
const ok = () => new Response('', { status: 200 });
const noWait = { backoffMs: [0, 0] } as const;

describe('describeImage', () => {
  it('hashes the file and describes it for registration', async () => {
    const d = await describeImage(png());
    expect(d).toEqual({ filename: 'Screen Shot.png', content_type: 'image/png', size: 8, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const direct = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await png().arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(d.sha256).toBe(direct);
  });

  it('names and types a file that has neither', async () => {
    expect(await describeImage(new Blob([new Uint8Array(4)], { type: 'image/webp' }))).toMatchObject({ filename: 'image.webp', content_type: 'image/webp' });
    expect(await describeImage(new Blob([new Uint8Array(4)]), 'camera.jpeg')).toMatchObject({ filename: 'camera.jpeg', content_type: 'image/jpeg' });
    expect(await describeImage(new Blob([new Uint8Array(4)], { type: 'image/png' }), 'wrong.jpg')).toMatchObject({ filename: 'wrong.png' });
  });

  it('leaves a type the API does not take for the API to refuse', async () => {
    expect((await describeImage(new File([new Uint8Array(4)], 'a.gif', { type: 'image/gif' }))).content_type).toBe('image/gif');
  });
});

describe('putImage with fetch', () => {
  it('PUTs the file to the URL with exactly the returned headers, no credentials and no Authorization', async () => {
    const fetch = vi.fn(async (..._args: Parameters<typeof globalThis.fetch>) => ok());
    const file = png();
    await putImage(file, target, { fetch: fetch as typeof globalThis.fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(target.url);
    expect(init).toMatchObject({ method: 'PUT', body: file, credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(init!.headers).toEqual(target.headers);
    expect(Object.keys(init!.headers as object).map((k) => k.toLowerCase())).not.toContain('authorization');
  });

  it('retries a network error and a 5xx, up to twice', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new TypeError('failed')).mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValue(ok());
    await putImage(png(), target, { fetch, ...noWait });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after the second retry, with a TruplexyUploadError carrying code UPLOAD_FAILED', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('', { status: 500 }));
    const error = await putImage(png(), target, { fetch, ...noWait }).catch((e) => e);
    expect(error).toBeInstanceOf(TruplexyUploadError);
    expect(error).toMatchObject({ code: 'UPLOAD_FAILED', status: 500 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 403 (expired link or mismatched signature)', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('', { status: 403 }));
    await expect(putImage(png(), target, { fetch, ...noWait })).rejects.toMatchObject({ code: 'UPLOAD_FAILED', status: 403 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops when aborted, including while waiting to retry', async () => {
    const ctl = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('failed'));
    const run = putImage(png(), target, { fetch, signal: ctl.signal, backoffMs: [60_000, 60_000] });
    await new Promise((r) => setTimeout(r, 20));
    ctl.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('passes an abort from fetch itself straight through', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new DOMException('x', 'AbortError'));
    await expect(putImage(png(), target, { fetch, ...noWait })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

/** Records what the browser would send over XMLHttpRequest. */
class FakeXhr {
  static sent: FakeXhr[] = [];
  static answer: (xhr: FakeXhr) => number = () => 200;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  withCredentials = false;
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body: unknown) {
    this.body = body;
    FakeXhr.sent.push(this);
    this.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 8 });
    queueMicrotask(() => {
      this.status = FakeXhr.answer(this);
      if (this.status === 0) this.onerror?.();
      else this.onload?.();
    });
  }
  abort() {
    this.onabort?.();
  }
}

describe('putImage with progress (XMLHttpRequest)', () => {
  const realXhr = globalThis.XMLHttpRequest;
  afterEach(() => {
    globalThis.XMLHttpRequest = realXhr;
    FakeXhr.sent = [];
    FakeXhr.answer = () => 200;
  });
  const install = () => (globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest);

  it('reports byte-level progress and sends only the returned headers, with no credentials', async () => {
    install();
    const progress: number[] = [];
    await putImage(png(), target, { onProgress: (p) => progress.push(p) });
    const [x] = FakeXhr.sent;
    expect(x).toMatchObject({ method: 'PUT', url: target.url, withCredentials: false });
    expect(x!.headers).toEqual(target.headers);
    expect(Object.keys(x!.headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(progress).toEqual([0, 0.5]);
  });

  it('retries a dropped connection twice, then reports it', async () => {
    install();
    FakeXhr.answer = () => 0;
    const error = await putImage(png(), target, { onProgress: () => {}, ...noWait }).catch((e) => e);
    expect(error).toMatchObject({ code: 'UPLOAD_FAILED', status: 0 });
    expect(FakeXhr.sent).toHaveLength(3);
  });

  it('does not retry a 403', async () => {
    install();
    FakeXhr.answer = () => 403;
    await expect(putImage(png(), target, { onProgress: () => {}, ...noWait })).rejects.toMatchObject({ status: 403 });
    expect(FakeXhr.sent).toHaveLength(1);
  });
});

describe('uploadImage: the browser side in one call', () => {
  it('describes the file, asks the server to register it, PUTs it and resolves to the ID', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(ok());
    const register = vi.fn(async () => target);
    const id = await uploadImage(png(), register, { fetch });
    expect(id).toBe('att_1');
    expect(register).toHaveBeenCalledWith({ filename: 'Screen Shot.png', content_type: 'image/png', size: 8, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }, undefined);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not upload when the server refuses to register it', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(uploadImage(png(), async () => Promise.reject(new Error('IMAGE_TOO_LARGE')), { fetch })).rejects.toThrow('IMAGE_TOO_LARGE');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes the abort signal on to registration', async () => {
    const ctl = new AbortController();
    const register = vi.fn(async (_d: unknown, _s?: AbortSignal) => target);
    await uploadImage(png(), register, { fetch: vi.fn().mockResolvedValue(ok()) as unknown as typeof fetch, signal: ctl.signal });
    expect(register.mock.calls[0]![1]).toBe(ctl.signal);
  });
});

describe('error codes', () => {
  it('exports the codes a route passes on', () => {
    expect([...ATTACHMENT_ERROR_CODES].sort()).toEqual(['ATTACHMENT_NOT_FOUND', 'ATTACHMENT_NOT_UPLOADED', 'IMAGE_TOO_LARGE', 'INVALID_IMAGE', 'UNSUPPORTED_IMAGE_TYPE']);
  });
});

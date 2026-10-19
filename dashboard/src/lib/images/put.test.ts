import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import { createPlaygroundAttachment } from '@/lib/api/endpoints/playground';
import { isAbort, putObject, putWithRetry, PutError, type PutFn, type PutTarget } from './put';

const target: PutTarget = { url: 'https://r2.example/bucket/att_1?sig=abc', method: 'PUT', headers: { 'Content-Type': 'image/png', 'x-amz-checksum-sha256': 'zzz' } };
const file = new Blob(['pixels'], { type: 'image/png' });
const noWait = [0, 0] as const;

describe('putWithRetry', () => {
  it('succeeds on the first try without retrying', async () => {
    const put = vi.fn<PutFn>(async () => {});
    await putWithRetry(put, target, file, () => {}, undefined, noWait);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('retries a dropped connection and a 5xx, up to twice', async () => {
    const put = vi.fn<PutFn>().mockRejectedValueOnce(new PutError(0, 'cut off')).mockRejectedValueOnce(new PutError(503, 'busy')).mockResolvedValue(undefined);
    await putWithRetry(put, target, file, () => {}, undefined, noWait);
    expect(put).toHaveBeenCalledTimes(3);
  });

  it('gives up after the second retry and reports the last failure', async () => {
    const put = vi.fn<PutFn>().mockRejectedValue(new PutError(0, 'cut off'));
    await expect(putWithRetry(put, target, file, () => {}, undefined, noWait)).rejects.toMatchObject({ status: 0 });
    expect(put).toHaveBeenCalledTimes(3);
  });

  it('does not retry an answer from storage like 403 (an expired or mismatched signature)', async () => {
    const put = vi.fn<PutFn>().mockRejectedValue(new PutError(403, 'denied'));
    await expect(putWithRetry(put, target, file, () => {}, undefined, noWait)).rejects.toMatchObject({ status: 403 });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('backs off between attempts', async () => {
    vi.useFakeTimers();
    try {
      const put = vi.fn<PutFn>().mockRejectedValueOnce(new PutError(0, 'x')).mockRejectedValueOnce(new PutError(0, 'x')).mockResolvedValue(undefined);
      const done = putWithRetry(put, target, file, () => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(put).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(put).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1500);
      expect(put).toHaveBeenCalledTimes(3);
      await done;
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops at once when aborted, even while waiting to retry', async () => {
    const ctl = new AbortController();
    const put = vi.fn<PutFn>().mockRejectedValue(new PutError(0, 'x'));
    const run = putWithRetry(put, target, file, () => {}, ctl.signal, [10_000, 10_000]);
    await Promise.resolve();
    ctl.abort();
    await expect(run).rejects.toSatisfy(isAbort);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('passes the target and file through untouched', async () => {
    const put = vi.fn<PutFn>(async () => {});
    await putWithRetry(put, target, file, () => {}, undefined, noWait);
    expect(put.mock.calls[0]![0]).toBe(target);
    expect(put.mock.calls[0]![1]).toBe(file);
  });
});

/** A stand-in XMLHttpRequest that records exactly what the browser would send. */
class FakeXhr {
  static last: FakeXhr | undefined;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown;
  status = 200;
  withCredentials = false;
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body: unknown) {
    this.body = body;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 6 });
    queueMicrotask(() => this.onload?.());
  }
  abort() {
    this.onabort?.();
  }
}

describe('putObject (the request to R2)', () => {
  const realXhr = globalThis.XMLHttpRequest;
  afterEach(() => {
    globalThis.XMLHttpRequest = realXhr;
    configureApi({ transport: (req) => fetch(req), getToken: async () => null });
  });

  it('sends exactly the returned headers, to the returned URL, and no Authorization header', async () => {
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    // Sign-in is configured, as it is in the app: the token must still stay out of the R2 request.
    configureApi({ getToken: async () => 'secret-access-token' });
    const progress = vi.fn();
    await putObject(target, file, progress);
    const sent = FakeXhr.last!;
    expect(sent.method).toBe('PUT');
    expect(sent.url).toBe(target.url);
    expect(sent.headers).toEqual(target.headers);
    expect(Object.keys(sent.headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(sent.withCredentials).toBe(false);
    expect(sent.body).toBe(file);
    expect(progress).toHaveBeenCalledWith(0.5);
  });

  it('never goes through the API client, which is what adds the token', async () => {
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    const transport = vi.fn(async () => new Response('{}'));
    configureApi({ transport, getToken: async () => 'secret-access-token' });
    await putObject(target, file, () => {});
    expect(transport).not.toHaveBeenCalled();
  });

  it('turns a non-2xx answer into a PutError carrying the status', async () => {
    class Refusing extends FakeXhr {
      status = 403;
    }
    globalThis.XMLHttpRequest = Refusing as unknown as typeof XMLHttpRequest;
    await expect(putObject(target, file, () => {})).rejects.toMatchObject({ name: 'PutError', status: 403 });
  });

  it('is cancelled by the abort signal', async () => {
    class Hanging extends FakeXhr {
      send() {}
    }
    globalThis.XMLHttpRequest = Hanging as unknown as typeof XMLHttpRequest;
    const ctl = new AbortController();
    const run = putObject(target, file, () => {}, ctl.signal);
    ctl.abort();
    await expect(run).rejects.toSatisfy(isAbort);
  });
});

describe('registering is an API call, with the sign-in token', () => {
  afterEach(() => configureApi({ transport: (req) => fetch(req), getToken: async () => null }));

  it('POSTs the four declared details to /playground/attachments with the scope headers', async () => {
    let seen: Request | undefined;
    configureApi({
      getToken: async () => 'tok',
      transport: async (req) => {
        seen = req.clone();
        return new Response(JSON.stringify({ attachment: { id: 'att_x', status: 'pending', filename: 'a.png', content_type: 'image/png', size: 6 }, url: 'https://r2/x', method: 'PUT', headers: {}, expires_at: '2026-10-19T12:15:00Z' }), { status: 201 });
      },
    });
    const body = { filename: 'a.png', content_type: 'image/png', size: 6, sha256: 'a'.repeat(64) };
    const res = await createPlaygroundAttachment({ tenant: 'acme', bot: 'support' }, body);
    expect(res.attachment.id).toBe('att_x');
    expect(seen!.method).toBe('POST');
    expect(new URL(seen!.url).pathname.endsWith('/playground/attachments')).toBe(true);
    expect(seen!.headers.get('Authorization')).toBe('Bearer tok');
    expect(seen!.headers.get('X-Truplexy-Tenant')).toBe('acme');
    expect(await seen!.json()).toEqual(body);
  });
});

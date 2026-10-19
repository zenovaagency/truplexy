/**
 * The `PUT` of a picture to R2. This request goes to storage, not to the API:
 * it carries exactly the headers the registration returned and nothing else.
 * In particular it never carries the app's `Authorization` header, which is
 * added only by `lib/api/client`, so nothing here may route through it.
 */

export class PutError extends Error {
  constructor(
    /** HTTP status; 0 when the request never got an answer (offline, CORS, reset). */
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PutError';
  }
  get network() {
    return this.status === 0;
  }
}

export interface PutTarget {
  url: string;
  method: string;
  headers: Record<string, string>;
}

export type PutFn = (target: PutTarget, file: Blob, onProgress: (fraction: number) => void, signal?: AbortSignal) => Promise<void>;

const abortError = () => new DOMException('Aborted', 'AbortError');

/** `XMLHttpRequest`, because `fetch` can't report upload progress. Mock mode intercepts mock:// URLs. */
export const putObject: PutFn = async (target, file, onProgress, signal) => {
  if (import.meta.env.VITE_USE_MOCKS === 'true' && target.url.startsWith('mock://')) {
    const { mockPutImage } = await import('@/lib/api/mock/transport');
    return mockPutImage(target.url, file, onProgress, signal);
  }
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new PutError(xhr.status, `Storage answered ${xhr.status}`)));
    xhr.onerror = () => reject(new PutError(0, 'The upload was interrupted. Check your connection.'));
    xhr.onabort = () => reject(abortError());
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
};

export const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError';

/** A dropped connection or a storage hiccup is worth another go; an answer like 403 (expired or mismatched signature) is not. */
const worthRetrying = (e: unknown) => e instanceof PutError && (e.network || e.status >= 500);

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(abortError());
      },
      { once: true },
    );
  });

/** Tries the `PUT`, then up to twice more with backoff when the failure looks temporary. */
export async function putWithRetry(
  put: PutFn,
  target: PutTarget,
  file: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
  backoffMs: readonly number[] = [500, 1500],
) {
  for (let attempt = 0; ; attempt++) {
    try {
      onProgress(0);
      return await put(target, file, onProgress, signal);
    } catch (e) {
      if (isAbort(e) || !worthRetrying(e) || attempt >= backoffMs.length) throw e;
      await wait(backoffMs[attempt]!, signal);
    }
  }
}

/**
 * Image input (planned: the API doesn't serve it yet; see the `attachments` entry of your route's `profile`).
 *
 * A browser never holds the chat key, so it never talks to the chat API's picture endpoints. Your
 * server does that: it registers the picture and hands the browser `{ attachmentId, url, headers }`.
 * The browser `PUT`s the file straight to storage with these helpers, then your server sends the message.
 *
 *   const id = await uploadImage(file, (details) => fetch("/api/pictures", { method: "POST", body: JSON.stringify(details) }).then((r) => r.json()));
 */

/** What the API answers to a picture that can't be used (`error.code`), as your route passes them on. */
export const ATTACHMENT_ERROR_CODES = ['IMAGE_TOO_LARGE', 'UNSUPPORTED_IMAGE_TYPE', 'INVALID_IMAGE', 'ATTACHMENT_NOT_FOUND', 'ATTACHMENT_NOT_UPLOADED'] as const;

/** The picture's details, which your server registers. Computed here so the file itself never has to pass through your server. */
export interface ImageDetails {
  filename: string;
  content_type: string;
  size: number;
  /** 64 lowercase hex characters. */
  sha256: string;
}

/** Where to put one picture: what your server got back from registering it. */
export interface UploadTarget {
  attachmentId: string;
  url: string;
  method?: string;
  /** Sent exactly, and nothing else. */
  headers: Record<string, string>;
}

export interface PutImageOptions {
  signal?: AbortSignal;
  /** 0–1. Byte-level when the browser supports it (it uses XMLHttpRequest for this); otherwise not called. */
  onProgress?: (fraction: number) => void;
  /** Waits before each retry of a network error or 5xx. Default 500 ms, then 1500 ms: two retries. */
  backoffMs?: readonly number[];
  fetch?: typeof fetch;
}

/** The picture couldn't be put in storage. Match on `code`, as with every Truplexy error. */
export class TruplexyUploadError extends Error {
  readonly code = 'UPLOAD_FAILED';
  constructor(
    message: string,
    /** Storage's HTTP status; 0 when there was no answer. */
    readonly status = 0,
  ) {
    super(message);
    this.name = 'TruplexyUploadError';
  }
}

const TYPE_EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const EXTENSION_TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function nameFor(file: Blob, type: string, filename?: string) {
  const wanted = TYPE_EXTENSION[type] ?? 'jpg';
  const base = (filename ?? (file as { name?: string }).name ?? '').split(/[\\/]/).pop()?.trim() ?? '';
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  const stem = (dot > 0 ? base.slice(0, dot) : base) || 'image';
  return `${stem.slice(0, 260 - wanted.length - 1)}.${EXTENSION_TYPE[ext] === type ? ext : wanted}`.slice(0, 260);
}

/** Hashes a picture and describes it for registration. The type is the file's own; the server reads the real bytes and has the last word. */
export async function describeImage(file: Blob, filename?: string): Promise<ImageDetails> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const type = (file.type || EXTENSION_TYPE[(filename ?? (file as { name?: string }).name ?? '').split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream').toLowerCase();
  return {
    filename: nameFor(file, type, filename),
    content_type: type,
    size: file.size,
    sha256: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''),
  };
}

const abortError = () => new DOMException('The upload was aborted.', 'AbortError');

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(abortError())), { once: true });
  });
}

function putOnce(file: Blob, target: UploadTarget, { signal, onProgress, fetch: doFetch }: PutImageOptions): Promise<void> {
  const method = target.method ?? 'PUT';
  // Byte-level progress needs XMLHttpRequest, which has no credentials unless asked for.
  if (onProgress && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const xhr = new XMLHttpRequest();
      xhr.open(method, target.url);
      for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new TruplexyUploadError(`Storage answered ${xhr.status}.`, xhr.status)));
      xhr.onerror = () => reject(new TruplexyUploadError('The upload could not reach storage.'));
      xhr.onabort = () => reject(abortError());
      signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(file);
    });
  }
  return (doFetch ?? fetch)(target.url, {
    method,
    headers: { ...target.headers },
    body: file,
    signal,
    // A signed URL is a bearer link: no cookies, no Referer.
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  }).then(
    (res) => {
      if (!res.ok) throw new TruplexyUploadError(`Storage answered ${res.status}.`, res.status);
    },
    (e) => {
      throw (e as { name?: string })?.name === 'AbortError' ? e : new TruplexyUploadError('The upload could not reach storage.');
    },
  );
}

/**
 * `PUT`s the picture to storage with exactly the headers your server got back, and nothing else: no
 * cookies, no `Authorization`. Retries a network error or a 5xx twice; an answer like 403 (the link
 * expired, or the picture isn't the one that was registered) is final. The storage bucket's CORS rule
 * must allow `PUT` and `Content-Type` from your site's origin.
 */
export async function putImage(file: Blob, target: UploadTarget, options: PutImageOptions = {}): Promise<void> {
  const backoff = options.backoffMs ?? [500, 1500];
  for (let attempt = 0; ; attempt++) {
    try {
      options.onProgress?.(0);
      return await putOnce(file, target, options);
    } catch (e) {
      const temporary = e instanceof TruplexyUploadError && (e.status === 0 || e.status >= 500);
      if (!temporary || options.signal?.aborted || attempt >= backoff.length) throw e;
      await wait(backoff[attempt]!, options.signal);
    }
  }
}

/**
 * The whole browser side in one call: describe the picture, have your server register it, `PUT` it,
 * and resolve to the attachment ID. Your server then sends the message with that ID.
 */
export async function uploadImage(
  file: Blob,
  register: (details: ImageDetails, signal?: AbortSignal) => Promise<UploadTarget>,
  options: PutImageOptions & { filename?: string } = {},
): Promise<string> {
  const target = await register(await describeImage(file, options.filename), options.signal);
  await putImage(file, target, options);
  return target.attachmentId;
}

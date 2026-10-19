/**
 * Image input (planned: the API doesn't serve it yet; see `getAttachmentConfig()`).
 *
 * Pictures never pass through the API's JSON bodies. Each one is registered
 * (`POST /conversations/{id}/attachments`), `PUT` to the presigned R2 URL the
 * registration returns, and named by ID in the message. These helpers do the
 * hashing and the `PUT`; `client.ts` does the API calls.
 */

export interface Attachment {
  id: string;
  /** Always the stored copy's type, whatever was uploaded. */
  content_type: 'image/jpeg';
  /** Pixels and bytes of the stored copy (shrunk, metadata removed), never of the file you uploaded. */
  width: number;
  height: number;
  size: number;
  /** A signed link for showing the picture, valid for 1 hour. Never store it, and don't log it. */
  url: string;
  url_expires_at: string;
}

/** What `GET /profile` reports as `attachments`. The limits are present when `enabled` is true. */
export interface AttachmentConfig {
  /** false: don't offer an attach button. */
  enabled: boolean;
  max_bytes?: number;
  max_per_message?: number;
  content_types?: string[];
}

export interface AttachmentRegistration {
  /** Up to 260 characters, no slashes, ending in .jpg, .jpeg, .png or .webp. */
  filename: string;
  content_type: string;
  /** Bytes. */
  size: number;
  /** 64 lowercase hex characters; the upload must match. */
  sha256: string;
}

export interface AttachmentUpload {
  attachment: { id: string; status: 'pending'; filename: string; content_type: string; size: number };
  /** The presigned R2 URL. `PUT` the raw file here within 15 minutes. */
  url: string;
  method: 'PUT';
  /** Send exactly these with the `PUT`, and nothing else. */
  headers: Record<string, string>;
  expires_at: string;
}

/** What a browser needs to put one picture in R2. Hand it to the browser; never the chat key. */
export interface UploadTarget {
  attachmentId: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

/** A picture to upload: a `File` or `Blob`, or its bytes (then name `filename`, and `contentType` if the bytes aren't a JPEG, PNG or WebP). */
export type ImageSource = Blob | ArrayBuffer | ArrayBufferView;

export interface ImageUploadOptions {
  /** Defaults to the `File`'s name, else `image.jpg`, `image.png` or `image.webp` to match the type. */
  filename?: string;
  /** Defaults to the `Blob`'s type, else what the first bytes say. */
  contentType?: string;
  signal?: AbortSignal;
  /**
   * Called as the work moves along. `fetch` can't report upload progress, so `uploading` is
   * reported at its start (`loaded: 0`) and end (`loaded: total`); a browser gets byte-level
   * progress from `putImage()` in `@truplexy/web`.
   */
  onProgress?: (progress: UploadProgress) => void;
  /** Waits before each retry of a failed `PUT` (network error or 5xx). Default 500 ms, then 1500 ms: two retries. */
  backoffMs?: readonly number[];
}

export interface UploadProgress {
  phase: 'hashing' | 'registering' | 'uploading' | 'done';
  loaded: number;
  total: number;
}

/** What the API answers to a picture that can't be used, and what `sendMessage` raises for one. */
export const ATTACHMENT_ERROR_CODES = ['IMAGE_TOO_LARGE', 'UNSUPPORTED_IMAGE_TYPE', 'INVALID_IMAGE', 'ATTACHMENT_NOT_FOUND', 'ATTACHMENT_NOT_UPLOADED'] as const;
export type AttachmentErrorCode = (typeof ATTACHMENT_ERROR_CODES)[number];

/** Raised when a picture could not be put in R2. Not an answer from the API. */
export const UPLOAD_FAILED = 'UPLOAD_FAILED';

const TYPE_EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const EXTENSION_TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** JPEG, PNG or WebP from the first bytes, or undefined. The server reads the real bytes too, so this only fills in a missing type. */
export function sniffImageType(b: Uint8Array): string | undefined {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return undefined;
}

/** A name the API accepts, kept from the original when it is already good. */
export function registrationName(name: string | undefined, type: string): string {
  const wanted = TYPE_EXTENSION[type] ?? 'jpg';
  const base = (name ?? '').split(/[\\/]/).pop()?.trim() ?? '';
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  const stem = (dot > 0 ? base.slice(0, dot) : base) || 'image';
  return `${stem.slice(0, 260 - wanted.length - 1)}.${EXTENSION_TYPE[ext] === type ? ext : wanted}`.slice(0, 260);
}

export interface ImageBytes {
  bytes: Uint8Array;
  type: string;
  filename: string;
}

/** Reads a `File`, `Blob` or bytes into what registration needs. */
export async function readImage(image: ImageSource, options: Pick<ImageUploadOptions, 'filename' | 'contentType'> = {}): Promise<ImageBytes> {
  let bytes: Uint8Array;
  let declared: string | undefined;
  let name: string | undefined;
  if (typeof Blob !== 'undefined' && image instanceof Blob) {
    bytes = new Uint8Array(await image.arrayBuffer());
    declared = image.type || undefined;
    name = (image as { name?: string }).name;
  } else if (ArrayBuffer.isView(image)) {
    bytes = new Uint8Array(image.buffer, image.byteOffset, image.byteLength);
  } else {
    bytes = new Uint8Array(image as ArrayBuffer);
  }
  // A type the API doesn't take is sent as is: the API answers UNSUPPORTED_IMAGE_TYPE, so no list of types is kept here.
  const type = (options.contentType ?? declared ?? sniffImageType(bytes) ?? 'application/octet-stream').toLowerCase();
  return { bytes, type, filename: registrationName(options.filename ?? name, type) };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const abortError = () => new DOMException('The request was aborted.', 'AbortError');
export const isAbortError = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError';

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(abortError())), { once: true });
  });
}

/** What a failed `PUT` looked like; the caller turns it into its own error type. */
export class PutFailure extends Error {
  constructor(
    /** 0 when there was no answer (offline, reset, blocked). */
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * `PUT`s the bytes to R2 with exactly the returned headers: no `Authorization` and nothing
 * else, because the request goes to storage, not to the API. Retries a network error or a
 * 5xx up to `backoffMs.length` times (two by default); any other answer, like 403 for an
 * expired signature, is final. An abort stops it at once, even while it waits to retry.
 */
export async function putToUrl(
  doFetch: typeof fetch,
  target: { url: string; method?: string; headers: Record<string, string> },
  bytes: Uint8Array,
  { signal, backoffMs = [500, 1500] }: { signal?: AbortSignal; backoffMs?: readonly number[] } = {},
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw abortError();
    let failure: PutFailure;
    try {
      const res = await doFetch(target.url, {
        method: target.method ?? 'PUT',
        headers: { ...target.headers },
        body: bytes as unknown as BodyInit,
        signal,
        // A signed URL is a bearer link: no cookies, no Referer.
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (res.ok) return;
      await res.body?.cancel().catch(() => {});
      failure = new PutFailure(res.status, `Storage answered ${res.status}.`);
    } catch (e) {
      if (isAbortError(e) || signal?.aborted) throw isAbortError(e) ? e : abortError();
      failure = new PutFailure(0, 'The upload could not reach storage.');
    }
    const temporary = failure.status === 0 || failure.status >= 500;
    if (!temporary || attempt >= backoffMs.length) throw failure;
    await wait(backoffMs[attempt]!, signal);
  }
}

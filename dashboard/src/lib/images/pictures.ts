import { isApiError } from '@/lib/api/client';
import type { AttachmentUpload } from '@/lib/api/types';
import { describePictureError, type PictureProblem } from './errors';
import type { PictureLimits } from './feature';
import { isAbort, PutError, putWithRetry, type PutFn } from './put';
import { checkPicture, pictureType, registrationName } from './validate';

/**
 * The pictures on a message being written. Each is uploaded as soon as it is
 * picked (hash, register, `PUT` to R2), three at a time, so Send only waits
 * for what is still running. No React in here: the composer reads it with
 * `useSyncExternalStore`, and tests drive it with fakes.
 */

export type PicturePhase = 'queued' | 'preparing' | 'registering' | 'uploading' | 'ready' | 'failed';

export interface Picture {
  /** Local key, stable for the picture's life in the composer. */
  key: string;
  name: string;
  size: number;
  /** An object URL of the original file, for the thumbnail. Revoked when the picture goes. */
  previewUrl: string;
  phase: PicturePhase;
  /** 0–1 within `uploading`. */
  progress: number;
  /** The `att_…` ID to send, once `ready`. */
  attachmentId?: string;
  /** Why it failed. */
  problem?: PictureProblem;
  /** A failed picture the person can try again; false when the file itself is the problem. */
  retryable?: boolean;
}

export interface PictureDeps {
  register: (body: { filename: string; content_type: string; size: number; sha256: string }, signal?: AbortSignal) => Promise<AttachmentUpload>;
  put: PutFn;
  hash: (file: Blob) => Promise<string>;
  /** Optional shrink-before-upload step; return the file to upload. */
  prepare?: (file: File) => Promise<File>;
  /** The server's current limits, or null when pictures are off. */
  limits: () => PictureLimits | null;
  /** The server said pictures are off (plan or no model): the control should go. */
  onUnavailable?: (problem: PictureProblem) => void;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  /** Waits before each of the up to two `PUT` retries. */
  backoffMs?: readonly number[];
  concurrency?: number;
}

interface Entry {
  pic: Picture;
  /** What is uploaded (the original, or its shrunk copy). */
  file: File;
  original: File;
  sha256?: string;
  abort?: AbortController;
}

const BUSY: ReadonlySet<PicturePhase> = new Set(['queued', 'preparing', 'registering', 'uploading']);

let seq = 0;

export class PictureSet {
  private records: Entry[] = [];
  private snapshot: readonly Picture[] = [];
  private readonly listeners = new Set<() => void>();
  private running = 0;
  private idle: (() => void)[] = [];
  private readonly concurrency: number;
  private readonly createUrl: (b: Blob) => string;
  private readonly revokeUrl: (u: string) => void;

  constructor(private readonly deps: PictureDeps) {
    this.concurrency = deps.concurrency ?? 3;
    this.createUrl = deps.createObjectURL ?? ((b) => URL.createObjectURL(b));
    this.revokeUrl = deps.revokeObjectURL ?? ((u) => URL.revokeObjectURL(u));
  }

  /* ---- reading (for useSyncExternalStore) ---- */

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;

  /** Anything still being prepared or uploaded: Send waits. */
  get busy() {
    return this.records.some((r) => BUSY.has(r.pic.phase));
  }
  get failed() {
    return this.records.some((r) => r.pic.phase === 'failed');
  }
  get size() {
    return this.records.length;
  }
  /** The IDs to send, in the order the pictures were added. Empty until every picture is ready. */
  readyIds() {
    return this.records.every((r) => r.pic.phase === 'ready') ? this.records.map((r) => r.pic.attachmentId!) : [];
  }

  /* ---- changing ---- */

  /** Queues what passes the local checks; returns what was turned away, in words for the person. */
  add(files: File[]): string[] {
    const turnedAway: string[] = [];
    const limits = this.deps.limits();
    if (!limits) return turnedAway;
    for (const file of files) {
      const problem = checkPicture(file, limits, this.records.length);
      if (problem) {
        turnedAway.push(problem);
        continue;
      }
      const key = `pic_${++seq}`;
      this.records.push({
        pic: { key, name: file.name || 'Picture', size: file.size, previewUrl: this.createUrl(file), phase: 'queued', progress: 0 },
        file,
        original: file,
      });
    }
    this.emit();
    this.pump();
    return turnedAway;
  }

  remove(key: string) {
    const i = this.records.findIndex((r) => r.pic.key === key);
    if (i < 0) return;
    const [rec] = this.records.splice(i, 1);
    rec!.abort?.abort();
    this.revokeUrl(rec!.pic.previewUrl);
    this.emit();
    this.pump();
  }

  /** Registers and uploads a failed picture again (a new registration, so a fresh URL). */
  retry(key: string) {
    const rec = this.records.find((r) => r.pic.key === key);
    if (rec?.pic.phase !== 'failed' || !rec.pic.retryable) return;
    this.requeue(rec);
    this.emit();
    this.pump();
  }

  /**
   * Registers and uploads every picture again, as for attachments that expired or
   * were used up by a failed send. Resolves when nothing is running any more.
   */
  reupload(): Promise<void> {
    for (const rec of this.records) if (rec.pic.phase === 'ready' || (rec.pic.phase === 'failed' && rec.pic.retryable)) this.requeue(rec);
    this.emit();
    this.pump();
    return this.whenIdle();
  }

  whenIdle(): Promise<void> {
    return this.busy ? new Promise((resolve) => this.idle.push(resolve)) : Promise.resolve();
  }

  /**
   * After a send that failed on a picture the server didn't name: which file is at fault is unknown,
   * and the failed attachment can't be reused. Every picture goes back to "upload again" so the person
   * can drop the bad one and send the rest.
   */
  invalidate() {
    for (const rec of this.records) {
      if (rec.pic.phase !== 'ready') continue;
      rec.pic = {
        ...rec.pic,
        phase: 'failed',
        attachmentId: undefined,
        retryable: true,
        problem: { title: 'Check this picture', detail: 'Remove it, or upload it again.', action: 'retry' },
      };
    }
    this.emit();
  }

  /**
   * Hands the pictures over for the message being sent and empties the set,
   * without revoking their previews: the sent message still shows them until
   * the stored copy arrives. The caller revokes them with `release`.
   */
  take(): Pick<Picture, 'key' | 'name' | 'previewUrl'>[] {
    const out = this.records.map((r) => ({ key: r.pic.key, name: r.pic.name, previewUrl: r.pic.previewUrl }));
    this.records = [];
    this.emit();
    return out;
  }

  release(pictures: Pick<Picture, 'previewUrl'>[]) {
    for (const p of pictures) this.revokeUrl(p.previewUrl);
  }

  /** Drops every picture and revokes the previews ("new chat", leaving the page). */
  clear() {
    for (const rec of this.records) {
      rec.abort?.abort();
      this.revokeUrl(rec.pic.previewUrl);
    }
    this.records = [];
    this.emit();
    this.pump();
  }

  /* ---- the pipeline ---- */

  private requeue(rec: Entry) {
    rec.abort?.abort();
    rec.pic = { ...rec.pic, phase: 'queued', progress: 0, attachmentId: undefined, problem: undefined, retryable: undefined };
  }

  private set(rec: Entry, patch: Partial<Picture>) {
    rec.pic = { ...rec.pic, ...patch };
    this.emit();
  }

  private emit() {
    this.snapshot = this.records.map((r) => r.pic);
    for (const l of this.listeners) l();
  }

  private pump() {
    for (const rec of this.records) {
      if (this.running >= this.concurrency) break;
      if (rec.pic.phase !== 'queued') continue;
      this.running++;
      void this.run(rec).finally(() => {
        this.running--;
        this.pump();
      });
    }
    if (this.running === 0 && !this.busy) {
      const waiting = this.idle.splice(0);
      for (const resolve of waiting) resolve();
    }
  }

  private async run(rec: Entry) {
    const abort = (rec.abort = new AbortController());
    const gone = () => abort.signal.aborted || !this.records.includes(rec);
    try {
      this.set(rec, { phase: 'preparing', progress: 0 });
      if (this.deps.prepare && !rec.sha256) rec.file = await this.deps.prepare(rec.original);
      rec.sha256 ??= await this.deps.hash(rec.file);
      if (gone()) return;

      this.set(rec, { phase: 'registering' });
      const reg = await this.deps.register(
        { filename: registrationName(rec.file), content_type: pictureType(rec.file), size: rec.file.size, sha256: rec.sha256 },
        abort.signal,
      );
      if (gone()) return;

      this.set(rec, { phase: 'uploading', progress: 0 });
      await putWithRetry(
        this.deps.put,
        { url: reg.url, method: reg.method, headers: reg.headers },
        rec.file,
        (p) => !gone() && this.set(rec, { progress: p }),
        abort.signal,
        this.deps.backoffMs,
      );
      if (gone()) return;
      this.set(rec, { phase: 'ready', progress: 1, attachmentId: reg.attachment.id });
    } catch (e) {
      if (isAbort(e) || gone()) return;
      const problem: PictureProblem =
        e instanceof PutError
          ? { title: 'Upload failed', detail: e.network ? e.message : 'The picture storage refused the upload. Try again.', action: 'retry' }
          : describePictureError(e);
      // Whatever the file is, "remove" means the file itself can't be used; the rest might work next time.
      this.set(rec, { phase: 'failed', problem, retryable: problem.action !== 'remove' && problem.action !== 'hide' });
      if (problem.action === 'hide' && isApiError(e)) this.deps.onUnavailable?.(problem);
    }
  }
}

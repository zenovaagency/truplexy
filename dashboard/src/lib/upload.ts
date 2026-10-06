import { isApiError, type Scope } from '@/lib/api/client';
import { processUntilDone, registerUpload } from '@/lib/api/endpoints/knowledge';
import type { DocMetadata, KnowledgeDocument } from '@/lib/api/types';

/**
 * The knowledge upload flow from API_REFERENCE.md: hash in the browser,
 * register, PUT the bytes straight to R2, then process until indexed.
 * Files never pass through the API.
 */

export type UploadPhase = 'queued' | 'hashing' | 'registering' | 'uploading' | 'processing' | 'indexed' | 'failed' | 'duplicate';

export interface UploadState {
  phase: UploadPhase;
  /** 0–1 within the current phase. */
  progress: number;
  document?: KnowledgeDocument;
  error?: string;
  duplicateOf?: string;
}

export async function sha256Hex(file: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** PUT with upload progress (fetch can't report it). Mock mode intercepts mock:// URLs. */
async function putObject(url: string, headers: Record<string, string>, file: File, onProgress: (p: number) => void) {
  if (import.meta.env.VITE_USE_MOCKS === 'true' && url.startsWith('mock://')) {
    const { mockPutObject } = await import('@/lib/api/mock/transport');
    return mockPutObject(url, file, onProgress);
  }
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage answered ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check that the storage bucket allows this origin (CORS).'));
    xhr.send(file);
  });
}

export async function uploadOne(
  scope: Scope,
  file: File,
  meta: DocMetadata & { title?: string },
  onState: (s: UploadState) => void,
) {
  try {
    onState({ phase: 'hashing', progress: 0 });
    const sha256 = await sha256Hex(file);

    onState({ phase: 'registering', progress: 0 });
    const reg = await registerUpload(scope, { filename: file.name, size: file.size, sha256, ...meta });

    onState({ phase: 'uploading', progress: 0, document: reg.document });
    await putObject(reg.url, reg.headers, file, (p) => onState({ phase: 'uploading', progress: p, document: reg.document }));

    onState({ phase: 'processing', progress: 0, document: reg.document });
    const doc = await processUntilDone(scope, reg.document.id, (d) =>
      onState({ phase: 'processing', progress: d.chunk_count ? d.embedded_count / d.chunk_count : 0, document: d }),
    );
    onState(
      doc.status === 'indexed'
        ? { phase: 'indexed', progress: 1, document: doc }
        : { phase: 'failed', progress: 1, document: doc, error: doc.error ?? 'Indexing failed.' },
    );
  } catch (e) {
    if (isApiError(e) && e.code === 'DUPLICATE_DOCUMENT') {
      onState({ phase: 'duplicate', progress: 1, duplicateOf: e.documentId, error: 'Already in the knowledge base.' });
    } else {
      onState({ phase: 'failed', progress: 1, error: e instanceof Error ? e.message : 'Upload failed.' });
    }
  }
}

/** Uploads files three at a time, as the reference recommends. */
export async function uploadMany(
  scope: Scope,
  files: { key: string; file: File }[],
  meta: DocMetadata,
  onState: (key: string, s: UploadState) => void,
  concurrency = 3,
) {
  const queue = [...files];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const { key, file } = item;
      await uploadOne(scope, file, meta, (s) => onState(key, s));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
}

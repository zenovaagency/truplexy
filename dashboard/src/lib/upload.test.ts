import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/client';
import type { KnowledgeDocument } from '@/lib/api/types';
import { uploadOne, type UploadState } from './upload';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const doc = (over: Partial<KnowledgeDocument> = {}): KnowledgeDocument => ({
  id: 'doc_1',
  title: 'Pricing',
  source_type: 'file',
  source_name: 'pricing.md',
  byte_size: 10,
  status: 'indexed',
  chunk_count: 1,
  embedded_count: 1,
  token_count: 3,
  created_at: '',
  updated_at: '',
  ...over,
});

/** Stands in for the browser's PUT to R2. */
class FakeXhr {
  upload: { onprogress?: (e: ProgressEvent) => void } = {};
  status = 200;
  onload?: () => void;
  onerror?: () => void;
  open() {}
  setRequestHeader() {}
  send() {
    setTimeout(() => this.onload?.(), 0);
  }
}

interface Seen {
  path: string;
  body?: Record<string, unknown>;
}

function fakeApi(process: () => Response) {
  const seen: Seen[] = [];
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const path = new URL(req.url).pathname.replace(/^\/v3/, '');
      const text = await req.text();
      seen.push({ path, body: text ? JSON.parse(text) : undefined });
      if (path === '/knowledge/uploads' || path.endsWith('/replace')) {
        return json(201, { document: doc({ replace_pending: true }), url: 'https://r2.test/x', method: 'PUT', headers: {}, expires_at: '', replaced: true });
      }
      if (path.endsWith('/process')) return process();
      return json(404, { error: { code: 'NOT_FOUND', message: 'No.' } });
    },
  });
  return seen;
}

async function run(opts?: { replaceId?: string }) {
  const states: UploadState[] = [];
  await uploadOne({ tenant: 'acme', bot: 'support' }, new File(['new prices'], 'pricing.md'), { locale: 'en' }, (s) => states.push(s), opts);
  return states.at(-1)!;
}

beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXhr));
afterEach(() => {
  vi.unstubAllGlobals();
  configureApi({ transport: (req) => fetch(req) });
});

describe('uploadOne', () => {
  it('asks to replace a file with the same name', async () => {
    const seen = fakeApi(() => json(200, doc()));
    expect(await run()).toMatchObject({ phase: 'indexed', replaced: true });
    expect(seen[0]).toMatchObject({ path: '/knowledge/uploads', body: { filename: 'pricing.md', replace_existing: true, locale: 'en' } });
  });

  it('replaces one document without sending metadata', async () => {
    const seen = fakeApi(() => json(200, doc()));
    expect(await run({ replaceId: 'doc_1' })).toMatchObject({ phase: 'indexed', replaced: true });
    expect(seen[0]!.path).toBe('/knowledge/documents/doc_1/replace');
    expect(seen[0]!.body).not.toHaveProperty('locale');
  });

  it('fails when the new file never got read', async () => {
    fakeApi(() => json(200, doc({ replace_pending: true })));
    expect(await run({ replaceId: 'doc_1' })).toMatchObject({ phase: 'failed', error: expect.stringContaining('current version is still in use') });
  });

  it('shows why the new file was dropped', async () => {
    fakeApi(() => json(400, { error: { code: 'INVALID_REQUEST', message: "pricing.md couldn't replace the current file: no readable text was found." } }));
    expect(await run({ replaceId: 'doc_1' })).toMatchObject({ phase: 'failed', error: expect.stringContaining('no readable text') });
  });
});

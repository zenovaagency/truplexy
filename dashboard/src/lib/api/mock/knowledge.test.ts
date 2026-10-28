import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError, pendingObjects } from './handlers';

/** The in-app mock API (demo mode) for replacing knowledge base files. */
let db: MockDb;
const scoped = new Headers({ Authorization: 'Bearer demo', 'X-Truplexy-Tenant': 'acme', 'X-Truplexy-Bot': 'support' });

beforeEach(() => {
  localStorage.clear();
  pendingObjects.clear();
  db = loadDb(seedDb);
});

const call = (method: string, path: string, body?: unknown, query = new URLSearchParams()) => dispatch(db, { method, path, query, headers: scoped, body }).body as any;
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MockHttpError) return { status: e.status, code: e.code };
    throw e;
  }
  throw new Error('expected an error');
};
const sha = (n: number) => n.toString(16).padStart(64, '0');
/** "Uploads" text where a registration's URL points. */
const put = (url: string, text: string) => pendingObjects.set(url.replace('mock://r2/', ''), text);

function indexedFile(name: string, text: string, n: number) {
  const reg = call('POST', '/knowledge/uploads', { filename: name, size: text.length, sha256: sha(n) });
  put(reg.url, text);
  let doc = call('POST', `/knowledge/documents/${reg.document.id}/process`);
  while (doc.status === 'processing') doc = call('POST', `/knowledge/documents/${reg.document.id}/process`);
  return doc;
}

describe('replacing knowledge files', () => {
  it('replaces a file with the same name, keeping the document', () => {
    const doc = indexedFile('Returns.md', '# Returns\n\n30 days.', 1);
    const reg = call('POST', '/knowledge/uploads', { filename: 'returns.md', size: 20, sha256: sha(2), replace_existing: true });
    expect(reg).toMatchObject({ replaced: true, document: { id: doc.id, replace_pending: true } });
    // Until the new file arrives, the current version stays.
    expect(call('POST', `/knowledge/documents/${doc.id}/process`)).toMatchObject({ status: 'indexed', replace_pending: true, source_name: 'Returns.md' });
    put(reg.url, '# Returns\n\n60 days.');
    let next = call('POST', `/knowledge/documents/${doc.id}/process`);
    while (next.status === 'processing') next = call('POST', `/knowledge/documents/${doc.id}/process`);
    expect(next).toMatchObject({ id: doc.id, status: 'indexed', source_name: 'returns.md' });
    expect(next.replace_pending).toBeUndefined();
    expect(call('GET', `/knowledge/documents/${doc.id}`).content).toContain('60 days');
    const byName = call('GET', '/knowledge/documents', undefined, new URLSearchParams({ source_name: 'RETURNS.md' }));
    expect(byName.data.map((d: any) => d.id)).toEqual([doc.id]);
  });

  it('refuses the same file, another document’s file and articles', () => {
    const doc = indexedFile('a.md', 'A', 3);
    const other = indexedFile('b.md', 'B', 4);
    expect(fails(() => call('POST', `/knowledge/documents/${doc.id}/replace`, { filename: 'a.md', size: 1, sha256: sha(3) }))).toEqual({ status: 409, code: 'DUPLICATE_DOCUMENT' });
    expect(fails(() => call('POST', `/knowledge/documents/${doc.id}/replace`, { filename: 'a.md', size: 1, sha256: sha(4) }))).toEqual({ status: 409, code: 'DUPLICATE_DOCUMENT' });
    const article = call('POST', '/knowledge/documents', { title: 'Hours', content: 'Open 9 to 5.' });
    expect(fails(() => call('POST', `/knowledge/documents/${article.id}/replace`, { filename: 'h.md', size: 1, sha256: sha(5) }))).toEqual({ status: 400, code: 'INVALID_REQUEST' });
    expect(other.id).not.toBe(doc.id);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError, pendingImages } from './handlers';

/**
 * The in-app mock API (demo mode) for image input: off by default so it answers like the real API does
 * today, and switchable with localStorage 'truplexy.mock.imageInput'.
 */
let db: MockDb;
let headers: Headers;
const sha = 'e'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  db = loadDb(seedDb);
  const m = db.memberships.find((x) => x.user_id === db.currentUserId && x.role === 'owner')!;
  const bot = db.bots.find((b) => b.tenant_id === m.tenant_id)!;
  headers = new Headers({ Authorization: 'Bearer demo', 'X-Truplexy-Tenant': m.tenant_id, 'X-Truplexy-Bot': bot.id });
  pendingImages.clear();
});
afterEach(() => localStorage.clear());

const call = (method: string, path: string, body?: unknown) => dispatch(db, { method, path, query: new URLSearchParams(), headers, body });
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MockHttpError) return { status: e.status, code: e.code, extra: e.extra };
    throw e;
  }
  throw new Error('expected an error');
};
const mode = (m: string) => localStorage.setItem('truplexy.mock.imageInput', m);
const register = (over: object = {}) => call('POST', '/playground/attachments', { filename: 'a.png', content_type: 'image/png', size: 1000, sha256: sha, ...over }).body as any;
const upload = (id: string, over: object = {}) => (pendingImages.get(id)!.uploaded = { thumb: 'data:image/webp;base64,AAAA', width: 2000, height: 1000, size: 800_000, ...over });
const conversation = () => (call('POST', '/playground/conversations').body as any).id as string;
const run = (body: object) => call('POST', '/playground/run', { max_output_tokens: 100, ...body });

describe('mock image input, off (the default): like the API today', () => {
  it('answers 404 NOT_FOUND to the config and the registration routes', () => {
    expect(fails(() => call('GET', '/playground/attachments/config'))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(fails(() => register())).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('refuses `attachments` as an unknown field', () => {
    const conv = conversation();
    expect(fails(() => run({ message: 'hi', conversation_id: conv, attachments: [`att_${'0'.repeat(32)}`] }))).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  });

  it('keeps messages and tickets free of attachments', () => {
    const t = (call('GET', '/tickets').body as any).data[0];
    const detail = call('GET', `/tickets/${t.id}`).body as any;
    expect(detail.messages.every((m: any) => !('attachments' in m))).toBe(true);
  });
});

describe('mock image input, on', () => {
  beforeEach(() => mode('on'));

  it('serves the config with the contract’s limits', () => {
    expect(call('GET', '/playground/attachments/config').body).toEqual({ enabled: true, max_bytes: 20_971_520, max_per_message: 3, content_types: ['image/jpeg', 'image/png', 'image/webp'] });
  });

  it('plan and no_vision modes say why it is off', () => {
    mode('plan');
    expect(call('GET', '/playground/attachments/config').body).toMatchObject({ enabled: false, reason: 'plan' });
    expect(fails(() => register())).toMatchObject({ status: 403, code: 'PLAN_LIMIT_REACHED', extra: { limit: 'image_input' } });
    mode('no_vision');
    expect(call('GET', '/playground/attachments/config').body).toMatchObject({ enabled: false, reason: 'no_vision_model' });
    expect(fails(() => register())).toMatchObject({ status: 400, code: 'FEATURE_UNAVAILABLE' });
  });

  it('registers with a presigned URL, the exact headers and a 15 minute window', () => {
    const r = call('POST', '/playground/attachments', { filename: 'a.png', content_type: 'image/png', size: 1000, sha256: sha });
    expect(r.status).toBe(201);
    const body = r.body as any;
    expect(body.attachment).toMatchObject({ status: 'pending', filename: 'a.png', content_type: 'image/png', size: 1000 });
    expect(body.attachment.id).toMatch(/^att_[0-9a-f]{32}$/);
    expect(body).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/png' } });
    expect(Date.parse(body.expires_at) - Date.now()).toBeGreaterThan(14 * 60_000);
  });

  it.each([
    [{ content_type: 'image/gif' }, 400, 'UNSUPPORTED_IMAGE_TYPE'],
    [{ size: 20_971_521 }, 413, 'IMAGE_TOO_LARGE'],
    [{ size: 0 }, 400, 'INVALID_REQUEST'],
    [{ filename: 'a/b.png' }, 400, 'INVALID_REQUEST'],
    [{ filename: 'a.gif' }, 400, 'INVALID_REQUEST'],
    [{ sha256: 'xyz' }, 400, 'INVALID_REQUEST'],
    [{ extra: 1 }, 400, 'INVALID_REQUEST'],
  ])('refuses a registration with %j', (over, status, code) => {
    expect(fails(() => register(over))).toMatchObject({ status, code });
  });

  it('sends pictures with no text, stores them on the user message and signs their links', () => {
    const conv = conversation();
    const a = register();
    upload(a.attachment.id);
    const r = run({ message: '', conversation_id: conv, attachments: [a.attachment.id] }).body as any;
    expect(r.status).toBe('answered');
    expect(r.user_message.content).toBe('');
    expect(r.user_message.attachments).toHaveLength(1);
    expect(r.user_message.attachments[0]).toMatchObject({ id: a.attachment.id, content_type: 'image/jpeg', width: 1280, height: 640, url: 'data:image/webp;base64,AAAA' });
    expect(Date.parse(r.user_message.attachments[0].url_expires_at) - Date.now()).toBeGreaterThan(59 * 60_000);
    expect(r.user_message.attachments[0].thumb).toBeUndefined();
    // The stored conversation shows them too, with fresh links.
    const current = (call('GET', '/playground/conversations/current').body as any).conversation;
    expect(current.messages[0].attachments[0].id).toBe(a.attachment.id);
  });

  it('an attachment is single-use', () => {
    const conv = conversation();
    const a = register();
    upload(a.attachment.id);
    run({ message: 'once', conversation_id: conv, attachments: [a.attachment.id] });
    expect(fails(() => run({ message: 'twice', conversation_id: conv, attachments: [a.attachment.id] }))).toMatchObject({ status: 404, code: 'ATTACHMENT_NOT_FOUND' });
  });

  it('refuses a send before the PUT has finished', () => {
    const conv = conversation();
    const a = register();
    expect(fails(() => run({ message: 'x', conversation_id: conv, attachments: [a.attachment.id] }))).toMatchObject({ status: 409, code: 'ATTACHMENT_NOT_UPLOADED' });
  });

  it('refuses a registration that expired after an hour', () => {
    const conv = conversation();
    const a = register();
    upload(a.attachment.id);
    pendingImages.get(a.attachment.id)!.at = Date.now() - 61 * 60_000;
    expect(fails(() => run({ message: 'x', conversation_id: conv, attachments: [a.attachment.id] }))).toMatchObject({ status: 404, code: 'ATTACHMENT_NOT_FOUND' });
  });

  it('validates the id list: 1–3 distinct ids, and not with resend', () => {
    const conv = conversation();
    expect(fails(() => run({ message: 'x', conversation_id: conv, attachments: [] })).code).toBe('INVALID_REQUEST');
    const id = `att_${'1'.repeat(32)}`;
    expect(fails(() => run({ message: 'x', conversation_id: conv, attachments: [id, id] })).code).toBe('INVALID_REQUEST');
    expect(fails(() => run({ message: 'x', conversation_id: conv, attachments: [id], resend: true })).code).toBe('INVALID_REQUEST');
    expect(fails(() => run({ message: '', conversation_id: conv })).code).toBe('INVALID_REQUEST'); // empty text needs pictures
  });

  it('reads the file when the message is sent: an unreadable one is INVALID_IMAGE and is used up', () => {
    const conv = conversation();
    const a = register();
    upload(a.attachment.id, { width: 0, height: 0 });
    expect(fails(() => run({ message: 'x', conversation_id: conv, attachments: [a.attachment.id] }))).toMatchObject({ status: 400, code: 'INVALID_IMAGE' });
    expect(pendingImages.has(a.attachment.id)).toBe(false);
    const tiny = register();
    upload(tiny.attachment.id, { width: 4, height: 4 });
    expect(fails(() => run({ message: 'x', conversation_id: conv, attachments: [tiny.attachment.id] })).code).toBe('INVALID_IMAGE');
  });

  it.each([
    ['not_found', 404, 'ATTACHMENT_NOT_FOUND'],
    ['not_uploaded', 409, 'ATTACHMENT_NOT_UPLOADED'],
    ['invalid', 400, 'INVALID_IMAGE'],
    ['too_large', 413, 'IMAGE_TOO_LARGE'],
    ['unsupported', 400, 'UNSUPPORTED_IMAGE_TYPE'],
  ])('the one-shot failure "%s" fails the next send once', (fail, status, code) => {
    const conv = conversation();
    const a = register();
    upload(a.attachment.id);
    localStorage.setItem('truplexy.mock.imageFail', fail);
    expect(fails(() => run({ message: 'x', conversation_id: conv, attachments: [a.attachment.id] }))).toMatchObject({ status, code });
    expect(localStorage.getItem('truplexy.mock.imageFail')).toBeNull();
  });

  it('on-expired hands out a dead link the first time and a good one afterwards', () => {
    mode('on-expired');
    const conv = conversation();
    const a = register();
    upload(a.attachment.id);
    const first = (run({ message: 'x', conversation_id: conv, attachments: [a.attachment.id] }).body as any).user_message.attachments[0];
    expect(Date.parse(first.url_expires_at)).toBeLessThan(Date.now());
    const later = ((call('GET', '/playground/conversations/current').body as any).conversation.messages[0] as any).attachments[0];
    expect(Date.parse(later.url_expires_at)).toBeGreaterThan(Date.now());
    expect(later.url).toBe('data:image/webp;base64,AAAA');
  });

  it('puts a sample picture on a ticket’s first customer message', () => {
    const t = (call('GET', '/tickets').body as any).data[0];
    const detail = call('GET', `/tickets/${t.id}`).body as any;
    const withPictures = detail.messages.filter((m: any) => m.attachments?.length);
    expect(withPictures).toHaveLength(1);
    expect(withPictures[0].author).toBe('customer');
    expect(withPictures[0].attachments[0]).toMatchObject({ content_type: 'image/jpeg', url: expect.stringContaining('data:image/svg+xml') });
  });
});

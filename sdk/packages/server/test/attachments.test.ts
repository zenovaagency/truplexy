import { describe, expect, it } from 'vitest';
import { mockApi } from '../../../playground/mock-api.mjs';
import { uploadImage as browserUpload } from '../../web/src/upload';
import { ATTACHMENT_ERROR_CODES, createChatClient, TruplexyApiError, UPLOAD_FAILED, type ChatClient } from '../src';

const base = 'https://mock.test/v3';
const R2 = 'https://mock.test/_r2/';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 2, 128]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const TEXT = new TextEncoder().encode('this is plainly not a picture at all');

interface Seen { url: string; method: string; headers: Record<string, string>; body?: unknown }

/** A client on the mock API, recording every request it makes (API calls and the PUT to R2). */
function rig(options: { images?: boolean | 'plan' | 'no_vision'; wrap?: (inner: typeof fetch) => typeof fetch } = {}) {
  const mock = mockApi(base, { latency: 0, replyLatency: 0, autoAgent: false, images: options.images ?? true }) as typeof fetch;
  const wrapped = options.wrap ? options.wrap(mock) : mock;
  const seen: Seen[] = [];
  // Recording sits outside any wrapper, so failed attempts are seen too.
  const recording: typeof fetch = async (url, init) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    seen.push({ url: String(url), method: init?.method ?? 'GET', headers, body: init?.body });
    return wrapped(url, init);
  };
  const chat: ChatClient = createChatClient({ chatKey: 'tpx_secret', apiBase: base, fetch: recording });
  const puts = () => seen.filter((s) => s.url.startsWith(R2));
  const api = (path: string) => seen.filter((s) => s.url === base + path);
  return { chat, seen, puts, api, fetch: recording };
}

const newConversation = async (chat: ChatClient) => (await chat.createConversation()).id;
const fast = { backoffMs: [0, 0] } as const;

describe('sending pictures: the happy path', () => {
  it('uploads each picture, then sends the message with their IDs', async () => {
    const { chat, puts, api } = rig();
    const id = await newConversation(chat);
    const r = await chat.sendMessage(id, { text: 'This error appears when I log in', images: [PNG, JPEG] });

    // Two registrations with the declared details, two PUTs, one message naming both IDs.
    const regs = api(`/conversations/${id}/attachments`);
    expect(regs).toHaveLength(2);
    expect(JSON.parse(regs[0]!.body as string)).toEqual({ filename: 'image.png', content_type: 'image/png', size: PNG.length, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(JSON.parse(regs[1]!.body as string)).toMatchObject({ filename: 'image.jpg', content_type: 'image/jpeg' });
    expect(puts()).toHaveLength(2);
    const send = JSON.parse(api(`/conversations/${id}/messages`)[0]!.body as string);
    expect(send.message).toBe('This error appears when I log in');
    expect(send.attachments).toHaveLength(2);
    expect(send.attachments.every((a: string) => /^att_[0-9a-f]{32}$/.test(a))).toBe(true);

    expect(r.status).toBe('answered');
    expect(r.reply).toContain('2 pictures');
    expect(r.message.attachments).toHaveLength(2);
    expect(r.message.attachments![0]).toMatchObject({ content_type: 'image/jpeg', width: 640, height: 480, url: expect.stringContaining('/_r2/'), url_expires_at: expect.any(String) });
  });

  it('sends pictures with no text', async () => {
    const { chat, api } = rig();
    const id = await newConversation(chat);
    const r = await chat.sendMessage(id, { images: [WEBP] });
    expect(JSON.parse(api(`/conversations/${id}/messages`)[0]!.body as string).message).toBe('');
    expect(r.status).toBe('answered');
  });

  it('the conversation shows the pictures on the customer message', async () => {
    const { chat } = rig();
    const id = await newConversation(chat);
    await chat.sendMessage(id, { text: 'look', images: [JPEG] });
    const conv = await chat.getConversation(id);
    const user = conv.messages.find((m) => m.role === 'user')!;
    expect(user.attachments).toHaveLength(1);
    expect(conv.messages.find((m) => m.role === 'assistant')!.attachments).toBeUndefined();
  });

  it('takes a File, a Blob, an ArrayBuffer or bytes, and works the type and name out', async () => {
    const { chat, api } = rig();
    const id = await newConversation(chat);
    const file = new File([PNG], 'Screenshot 2026-10-19.PNG', { type: 'image/png' });
    const blob = new Blob([JPEG], { type: 'image/jpeg' });
    const buffer = WEBP.buffer.slice(WEBP.byteOffset, WEBP.byteOffset + WEBP.byteLength) as ArrayBuffer;
    await chat.sendMessage(id, { text: 'x', images: [file, blob, buffer] });
    const bodies = api(`/conversations/${id}/attachments`).map((r) => JSON.parse(r.body as string));
    // The uploads run in parallel, so the registrations may arrive in any order.
    expect(bodies.map((b) => `${b.filename} ${b.content_type}`).sort()).toEqual(['Screenshot 2026-10-19.png image/png', 'image.jpg image/jpeg', 'image.webp image/webp']);
  });

  it('lets bytes carry their own name and type', async () => {
    const { chat, api } = rig();
    const id = await newConversation(chat);
    await chat.sendMessage(id, { images: [{ data: JPEG, filename: 'receipt', contentType: 'image/jpeg' }] });
    expect(JSON.parse(api(`/conversations/${id}/attachments`)[0]!.body as string)).toMatchObject({ filename: 'receipt.jpg', content_type: 'image/jpeg' });
  });

  it('uploadImage resolves to the attachment ID, which sendMessage can then use', async () => {
    const { chat, api } = rig();
    const id = await newConversation(chat);
    const attachment = await chat.uploadImage(id, JPEG);
    expect(attachment).toMatch(/^att_[0-9a-f]{32}$/);
    const r = await chat.sendMessage(id, { text: 'here', attachments: [attachment] });
    expect(r.message.attachments).toHaveLength(1);
    expect(JSON.parse(api(`/conversations/${id}/messages`)[0]!.body as string).attachments).toEqual([attachment]);
  });

  it('reports progress through its phases', async () => {
    const { chat } = rig();
    const id = await newConversation(chat);
    const phases: string[] = [];
    await chat.uploadImage(id, PNG, { onProgress: (p) => phases.push(`${p.phase}:${p.loaded}/${p.total}`) });
    expect(phases).toEqual([`hashing:0/${PNG.length}`, `registering:0/${PNG.length}`, `uploading:0/${PNG.length}`, `done:${PNG.length}/${PNG.length}`]);
  });
});

describe('the request to R2', () => {
  it('carries exactly the returned headers and never the chat key', async () => {
    const { chat, puts, api } = rig();
    const id = await newConversation(chat);
    await chat.uploadImage(id, PNG);
    const [put] = puts();
    expect(put!.method).toBe('PUT');
    expect(Object.keys(put!.headers).sort()).toEqual(['content-type', 'x-mock-signature']);
    expect(put!.headers['content-type']).toBe('image/png');
    expect(put!.headers.authorization).toBeUndefined();
    expect(JSON.stringify(put)).not.toContain('tpx_secret');
    // ...while the API calls do carry it.
    expect(api(`/conversations/${id}/attachments`)[0]!.headers.authorization).toBe('Bearer tpx_secret');
  });

  it('sends the real bytes, whose sha256 and size match the registration (the mock refuses otherwise)', async () => {
    const { chat } = rig();
    const id = await newConversation(chat);
    await expect(chat.uploadImage(id, JPEG)).resolves.toMatch(/^att_/);
  });
});

describe('registering for a browser widget', () => {
  it('registerImage returns { attachmentId, url, headers } and uploads nothing', async () => {
    const { chat, puts } = rig();
    const id = await newConversation(chat);
    const target = await chat.registerImage(id, PNG);
    expect(target).toEqual({ attachmentId: expect.stringMatching(/^att_/), url: expect.stringContaining('/_r2/'), method: 'PUT', headers: { 'Content-Type': 'image/png', 'x-mock-signature': expect.any(String) }, expiresAt: expect.any(String) });
    expect(puts()).toHaveLength(0);
  });

  it('takes the details the browser computed, so the file never reaches your server', async () => {
    const { chat, api, puts } = rig();
    const id = await newConversation(chat);
    const details = { filename: 'photo.jpg', content_type: 'image/jpeg', size: JPEG.length, sha256: 'a'.repeat(64) };
    const target = await chat.registerImage(id, details);
    expect(JSON.parse(api(`/conversations/${id}/attachments`)[0]!.body as string)).toEqual(details);
    expect(target.attachmentId).toMatch(/^att_/);
    expect(puts()).toHaveLength(0);
  });

  it('then the browser PUTs with putImage, and the server sends the message with the ID', async () => {
    const { chat, fetch: viaMock, puts, api } = rig();
    const id = await newConversation(chat);
    // In the browser: describe the file, ask the server to register it.
    const file = new Blob([JPEG], { type: 'image/jpeg' });
    const attachmentId = await browserUpload(file, async (details) => chat.registerImage(id, details), { fetch: viaMock });
    // On the server again: send the message.
    const r = await chat.sendMessage(id, { text: 'from the widget', attachments: [attachmentId] });
    expect(r.message.attachments).toHaveLength(1);
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.headers.authorization).toBeUndefined();
    // The chat key only ever went to the API, never to the browser's PUT.
    expect(api(`/conversations/${id}/attachments`)[0]!.headers.authorization).toBe('Bearer tpx_secret');
  });
});

describe('errors', () => {
  it('lists the new codes', () => {
    expect([...ATTACHMENT_ERROR_CODES].sort()).toEqual(['ATTACHMENT_NOT_FOUND', 'ATTACHMENT_NOT_UPLOADED', 'IMAGE_TOO_LARGE', 'INVALID_IMAGE', 'UNSUPPORTED_IMAGE_TYPE']);
  });

  it('UNSUPPORTED_IMAGE_TYPE: bytes that are no picture are refused when registered, and nothing is sent', async () => {
    const { chat, api, puts } = rig();
    const id = await newConversation(chat);
    await expect(chat.sendMessage(id, { text: 'x', images: [TEXT] })).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE_TYPE', status: 400 });
    expect(puts()).toHaveLength(0);
    expect(api(`/conversations/${id}/messages`)).toHaveLength(0);
  });

  it('IMAGE_TOO_LARGE: a registration over the limit is refused (413), and the limit is the server\'s to state', async () => {
    const { chat } = rig();
    const id = await newConversation(chat);
    await expect(chat.registerImage(id, { filename: 'huge.jpg', content_type: 'image/jpeg', size: 20_971_521, sha256: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE', status: 413 });
  });

  it('INVALID_IMAGE: a file the server cannot read fails the send, with the request ID', async () => {
    const { chat } = rig();
    const id = await newConversation(chat);
    const tiny = Uint8Array.from([1, 2, 3]);
    const error = await chat.sendMessage(id, { text: 'x', images: [{ data: tiny, contentType: 'image/png' }] }).catch((e) => e);
    expect(error).toBeInstanceOf(TruplexyApiError);
    expect(error).toMatchObject({ code: 'INVALID_IMAGE', status: 400 });
    expect(error.requestId).toMatch(/^req_/);
  });

  it('ATTACHMENT_NOT_FOUND: an attachment is single-use', async () => {
    const { chat } = rig();
    const id = await newConversation(chat);
    const attachment = await chat.uploadImage(id, PNG);
    await chat.sendMessage(id, { text: 'once', attachments: [attachment] });
    await expect(chat.sendMessage(id, { text: 'twice', attachments: [attachment] })).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND', status: 404 });
  });

  it('ATTACHMENT_NOT_UPLOADED: sending before the PUT has finished', async () => {
    const { chat } = rig();
    const id = await newConversation(chat);
    const { attachmentId } = await chat.registerImage(id, PNG);
    await expect(chat.sendMessage(id, { text: 'too soon', attachments: [attachmentId] })).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_UPLOADED', status: 409 });
  });

  it('a failed picture error leaves nothing stored', async () => {
    const { chat } = rig();
    const id = await newConversation(chat);
    await chat.sendMessage(id, { text: 'x', images: [TEXT] }).catch(() => {});
    expect((await chat.getConversation(id)).messages).toEqual([]);
  });

  it('PLAN_LIMIT_REACHED with limit image_input', async () => {
    const { chat } = rig({ images: 'plan' });
    const id = await newConversation(chat);
    const error = await chat.sendMessage(id, { text: 'x', images: [PNG] }).catch((e) => e);
    expect(error).toMatchObject({ code: 'PLAN_LIMIT_REACHED', status: 403, limit: 'image_input' });
  });

  it('FEATURE_UNAVAILABLE when no model can read pictures', async () => {
    const { chat } = rig({ images: 'no_vision' });
    const id = await newConversation(chat);
    await expect(chat.sendMessage(id, { text: 'x', images: [PNG] })).rejects.toMatchObject({ code: 'FEATURE_UNAVAILABLE' });
  });

  it('another PLAN_LIMIT_REACHED limit is still reported as its own', async () => {
    const { chat } = rig();
    const id = await newConversation(chat);
    const error = await chat.sendMessage(id, 'a limit please').catch((e) => e);
    expect(error).toMatchObject({ code: 'PLAN_LIMIT_REACHED', limit: 'replies_per_month' });
  });
});

describe('a PUT that goes wrong', () => {
  /** Fails the first `n` PUTs to R2, with a network error or a status. */
  const failing = (failures: ('network' | number)[]) => (inner: typeof fetch): typeof fetch => {
    const left = [...failures];
    return async (url, init) => {
      if (String(url).startsWith(R2) && left.length) {
        const next = left.shift()!;
        if (next === 'network') throw new TypeError('fetch failed');
        return new Response('', { status: next });
      }
      return inner(url, init);
    };
  };

  it('is retried twice with backoff after a network error and a 503, then succeeds without registering again', async () => {
    const { chat, api, seen } = rig({ wrap: failing(['network', 503]) });
    const id = await newConversation(chat);
    const attachment = await chat.uploadImage(id, PNG, fast);
    expect(attachment).toMatch(/^att_/);
    expect(seen.filter((s) => s.url.startsWith(R2))).toHaveLength(3);
    expect(api(`/conversations/${id}/attachments`)).toHaveLength(1);
  });

  it('gives up after the second retry with UPLOAD_FAILED', async () => {
    const { chat, seen } = rig({ wrap: failing(['network', 502, 500, 500]) });
    const id = await newConversation(chat);
    const error = await chat.uploadImage(id, PNG, fast).catch((e) => e);
    expect(error).toMatchObject({ code: UPLOAD_FAILED, status: 500 });
    expect(seen.filter((s) => s.url.startsWith(R2))).toHaveLength(3);
  });

  it('does not retry a 403: the link expired or the signature does not match', async () => {
    const { chat, seen } = rig({ wrap: failing([403]) });
    const id = await newConversation(chat);
    await expect(chat.uploadImage(id, PNG, fast)).rejects.toMatchObject({ code: UPLOAD_FAILED, status: 403 });
    expect(seen.filter((s) => s.url.startsWith(R2))).toHaveLength(1);
  });

  it('waits the backoff between attempts', async () => {
    const { chat } = rig({ wrap: failing(['network']) });
    const id = await newConversation(chat);
    const started = Date.now();
    await chat.uploadImage(id, PNG, { backoffMs: [120, 0] });
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });

  it('a send is not attempted when an upload failed', async () => {
    const { chat, api } = rig({ wrap: failing([404]) });
    const id = await newConversation(chat);
    await expect(chat.sendMessage(id, { text: 'x', images: [PNG] })).rejects.toMatchObject({ code: UPLOAD_FAILED });
    expect(api(`/conversations/${id}/messages`)).toHaveLength(0);
  });
});

describe('aborting', () => {
  it('stops an upload in flight and rejects with AbortError, not an API error', async () => {
    const ctl = new AbortController();
    const hang = (inner: typeof fetch): typeof fetch => (url, init) => {
      if (!String(url).startsWith(R2)) return inner(url, init);
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    };
    const { chat, api } = rig({ wrap: hang });
    const id = await newConversation(chat);
    const run = chat.sendMessage(id, { text: 'x', images: [PNG], signal: ctl.signal });
    await new Promise((r) => setTimeout(r, 20));
    ctl.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(api(`/conversations/${id}/messages`)).toHaveLength(0);
  });

  it('stops while waiting to retry', async () => {
    const ctl = new AbortController();
    const down = (inner: typeof fetch): typeof fetch => async (url, init) => {
      if (String(url).startsWith(R2)) throw new TypeError('fetch failed');
      return inner(url, init);
    };
    const { chat, seen } = rig({ wrap: down });
    const id = await newConversation(chat);
    const run = chat.uploadImage(id, PNG, { signal: ctl.signal, backoffMs: [60_000, 60_000] });
    await new Promise((r) => setTimeout(r, 30));
    ctl.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen.filter((s) => s.url.startsWith(R2))).toHaveLength(1);
  });

  it('an already-aborted signal makes no request at all', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const { chat, seen } = rig();
    const id = await newConversation(chat);
    const before = seen.length;
    await expect(chat.uploadImage(id, PNG, { signal: ctl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen.slice(before).filter((s) => s.url.includes('/attachments') || s.url.startsWith(R2))).toHaveLength(0);
  });
});

describe('against an API that predates image input', () => {
  it('getAttachmentConfig() resolves to { enabled: false }', async () => {
    const { chat } = rig({ images: false });
    await expect(chat.getAttachmentConfig()).resolves.toEqual({ enabled: false });
    expect((await chat.getProfile()).attachments).toBeUndefined();
  });

  it('getAttachmentConfig() reads the limits when the API serves them', async () => {
    const { chat } = rig({ images: true });
    await expect(chat.getAttachmentConfig()).resolves.toEqual({ enabled: true, max_bytes: 20_971_520, max_per_message: 3, content_types: ['image/jpeg', 'image/png', 'image/webp'] });
  });

  it('a plan or model that cannot read pictures reads as disabled, with no reason revealed', async () => {
    for (const images of ['plan', 'no_vision'] as const) {
      await expect(rig({ images }).chat.getAttachmentConfig()).resolves.toEqual({ enabled: false });
    }
  });

  it('registering answers 404 NOT_FOUND, and the picture flow fails cleanly', async () => {
    const { chat, api } = rig({ images: false });
    const id = await newConversation(chat);
    await expect(chat.createAttachment(id, { filename: 'a.png', content_type: 'image/png', size: 1, sha256: 'c'.repeat(64) })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await expect(chat.sendMessage(id, { text: 'x', images: [PNG] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(api(`/conversations/${id}/messages`)).toHaveLength(0);
  });

  it('nothing else changes: a plain text message is the same request as before', async () => {
    const { chat, api } = rig({ images: false });
    const id = await newConversation(chat);
    const r = await chat.sendMessage(id, 'Where is my order?');
    expect(r.status).toBe('answered');
    const [req] = api(`/conversations/${id}/messages`);
    expect(JSON.parse(req!.body as string)).toEqual({ message: 'Where is my order?' });
    expect(Object.keys(req!.headers).sort()).toEqual(['authorization', 'content-type']);
    // The object form with only text is the same request too, and an unknown `attachments` field is never sent.
    await chat.sendMessage(id, { text: 'again' });
    expect(JSON.parse(api(`/conversations/${id}/messages`)[1]!.body as string)).toEqual({ message: 'again' });
  });
});

describe('Idempotency-Key', () => {
  it('is sent on the message when given, and not otherwise', async () => {
    const { chat, api } = rig();
    const id = await newConversation(chat);
    await chat.sendMessage(id, { text: 'one', idempotencyKey: 'order-42-msg-1' });
    await chat.sendMessage(id, { text: 'two' });
    const [a, b] = api(`/conversations/${id}/messages`);
    expect(a!.headers['idempotency-key']).toBe('order-42-msg-1');
    expect(b!.headers['idempotency-key']).toBeUndefined();
  });
});

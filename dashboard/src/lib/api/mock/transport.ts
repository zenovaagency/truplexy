import type { Role } from '@/lib/api/types';
import { env } from '@/lib/env';
import type { LiveEvent } from '@/lib/realtime';
import { activeTopics, emit, subscribe } from './bus';
import { clearDb, loadDb, newId, nowIso, saveDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { PutError } from '@/lib/images/put';
import { dispatch, MockHttpError, pendingImages, pendingObjects } from './handlers';

/**
 * Mock mode: answers the dashboard's API calls in the browser from a seeded,
 * persisted sample dataset, with realistic latency, the API's permission
 * table and its error shapes. Loaded only when VITE_USE_MOCKS=true.
 */

let db: MockDb = loadDb(seedDb);

const basePath = new URL(env.apiBaseUrl, window.location.origin).pathname.replace(/\/$/, '');

const sleep = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

/** Demo mode keeps pictures as small data URLs, so they survive a reload without filling storage. */
async function readImage(req: Request, contentType: string): Promise<{ type: string; bytes: number; width: number; height: number; url: string } | null> {
  let blob: Blob | null = null;
  if (/^multipart\/form-data/.test(contentType)) {
    const f = (await req.formData()).get('file');
    blob = f instanceof Blob ? f : null;
  } else {
    blob = await req.blob();
  }
  if (!blob || !blob.size) return null;
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return { type: blob.type, bytes: blob.size, width: 0, height: 0, url: '' };
  }
  const side = 128;
  const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const out = { type: blob.type, bytes: blob.size, width: bmp.width, height: bmp.height, url: canvas.toDataURL('image/webp', 0.85) };
  bmp.close();
  return out;
}

export async function mockTransport(req: Request): Promise<Response> {
  const url = new URL(req.url, window.location.origin);
  const path = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) || '/' : url.pathname;
  const contentType = req.headers.get('Content-Type') ?? '';
  const isImage = /^multipart\/form-data/.test(contentType) || /^image\//.test(contentType);
  const text = req.method === 'GET' || isImage ? '' : await req.text();
  const requestId = `req_${crypto.randomUUID().replace(/-/g, '')}`;

  const slow = path === '/playground/run' ? 900 + Math.random() * 900 : path === '/knowledge/search' ? 400 : 0;
  await sleep(110 + Math.random() * 260 + slow, req.signal);

  const headers = { 'Content-Type': 'application/json', 'X-Request-ID': requestId };
  try {
    let body: unknown = undefined;
    if (isImage) {
      body = { __image: await readImage(req, contentType) };
    } else if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new MockHttpError(400, 'INVALID_REQUEST', 'The body must be one JSON object.');
      }
    }
    const out = dispatch(db, { method: req.method, path, query: url.searchParams, headers: req.headers, body });
    if (out.status === 204) return new Response(null, { status: 204, headers: { 'X-Request-ID': requestId } });
    return new Response(JSON.stringify(out.body), { status: out.status, headers });
  } catch (e) {
    if (e instanceof MockHttpError) {
      return new Response(JSON.stringify({ error: { code: e.code, message: e.message, request_id: requestId, ...e.extra } }), { status: e.status, headers });
    }
    console.error('[mock api]', e);
    return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: String(e), request_id: requestId } }), { status: 500, headers });
  }
}

/** Stands in for the browser's PUT to R2: progress, then the bytes are "stored". */
export async function mockPutObject(url: string, file: File, onProgress: (p: number) => void) {
  const id = url.replace('mock://r2/', '');
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await sleep(60 + Math.min(file.size / 40_000, 120));
    onProgress(i / steps);
  }
  const textual = /\.(md|markdown|txt|text|csv|json|html?)$/i.test(file.name);
  pendingObjects.set(id, textual ? (await file.text()).slice(0, 50_000) : '');
}

/** A small stand-in for the stored copy of a picture: what the server would have read, and a thumbnail to show. */
async function imageThumb(blob: Blob): Promise<{ thumb: string; width: number; height: number }> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return { thumb: '', width: 0, height: 0 };
  }
  const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * k));
  canvas.height = Math.max(1, Math.round(bmp.height * k));
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const out = { thumb: canvas.toDataURL('image/webp', 0.8), width: bmp.width, height: bmp.height };
  bmp.close();
  return out;
}

const droppedOnce = new Set<string>();

/**
 * Stands in for the browser's PUT of a picture to R2. With
 * `localStorage.setItem('truplexy.mock.imageFlaky', '1')` the first attempt of each file is cut off
 * halfway, to see the retry.
 */
export async function mockPutImage(url: string, file: Blob, onProgress: (p: number) => void, signal?: AbortSignal) {
  const id = url.replace('mock://r2/', '');
  const steps = 8;
  let flaky = false;
  try {
    flaky = localStorage.getItem('truplexy.mock.imageFlaky') === '1' && !droppedOnce.has(id);
  } catch {
    /* no storage */
  }
  for (let i = 1; i <= steps; i++) {
    await sleep(60 + Math.min(file.size / 40_000, 120), signal);
    onProgress(i / steps);
    if (flaky && i === 4) {
      droppedOnce.add(id);
      throw new PutError(0, 'The upload was interrupted. Check your connection.');
    }
  }
  const reg = pendingImages.get(id);
  if (!reg) throw new PutError(403, 'Storage answered 403');
  reg.uploaded = { ...(await imageThumb(file)), size: file.size };
}

/* ------------------------------------------------------------------ */
/* Live updates: a local bus, plus a "customer" who occasionally writes */
/* ------------------------------------------------------------------ */

const FOLLOW_UPS = [
  'Any update on this?',
  'Thanks — just checking where we are with this.',
  'I sent the details you asked for.',
  'Is there anything else you need from me?',
  'Still waiting on a reply, could someone take a look?',
];

let simulator = 0;
function startSimulator() {
  if (simulator) return;
  simulator = window.setInterval(() => {
    const topic = activeTopics()[0];
    if (!topic || document.hidden) return;
    const [, tenant, bot] = topic.split(':');
    const candidates = db.tickets.filter((t) => t.tenant_id === tenant && t.bot_id === bot && t.status === 'open');
    const t = candidates[Math.floor(Math.random() * candidates.length)];
    const conv = t && db.conversations.find((c) => c.id === t.conversation_id);
    if (!t || !conv) return;
    const now = nowIso();
    const message = { id: newId('msg'), role: 'user' as const, content: FOLLOW_UPS[Math.floor(Math.random() * FOLLOW_UPS.length)]!, author: 'customer' as const, created_at: now };
    conv.messages.push(message);
    conv.updated_at = now;
    t.last_customer_at = now;
    t.updated_at = now;
    saveDb(db);
    emit(t.tenant_id, t.bot_id, 'message.created', { conversation_id: conv.id, ticket_id: t.id, message });
    emit(t.tenant_id, t.bot_id, 'ticket.updated', { conversation_id: conv.id, ticket: { id: t.id, subject: t.subject, status: t.status, priority: t.priority, escalated: t.escalated } });
  }, 45_000);
}

export function subscribeMockEvents(topic: string, handler: (e: LiveEvent) => void) {
  startSimulator();
  return subscribe(topic, handler);
}

/* ------------------------------------------------------------------ */
/* Demo controls (user menu → Preview as)                               */
/* ------------------------------------------------------------------ */

export function mockRoleIn(tenant: string): Role | null {
  return db.memberships.find((m) => m.tenant_id === tenant && m.user_id === db.currentUserId)?.role ?? null;
}

export function mockIsPlatformAdmin() {
  return db.users.find((u) => u.id === db.currentUserId)?.platform_admin ?? false;
}

export function setMockRole(tenant: string, role: Role) {
  const m = db.memberships.find((x) => x.tenant_id === tenant && x.user_id === db.currentUserId);
  if (m) m.role = role;
  saveDb(db);
}

export function setMockPlatformAdmin(on: boolean) {
  const u = db.users.find((x) => x.id === db.currentUserId);
  if (u) u.platform_admin = on;
  saveDb(db);
}

export function resetMockData() {
  clearDb();
  db = loadDb(seedDb);
}

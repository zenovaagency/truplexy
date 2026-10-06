import type { Role } from '@/lib/api/types';
import { env } from '@/lib/env';
import type { LiveEvent } from '@/lib/realtime';
import { activeTopics, emit, subscribe } from './bus';
import { clearDb, loadDb, newId, nowIso, saveDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError, pendingObjects } from './handlers';

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

export async function mockTransport(req: Request): Promise<Response> {
  const url = new URL(req.url, window.location.origin);
  const path = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) || '/' : url.pathname;
  const text = req.method === 'GET' ? '' : await req.text();
  const requestId = `req_${crypto.randomUUID().replace(/-/g, '')}`;

  const slow = path === '/playground/run' ? 900 + Math.random() * 900 : path === '/knowledge/search' ? 400 : 0;
  await sleep(110 + Math.random() * 260 + slow, req.signal);

  const headers = { 'Content-Type': 'application/json', 'X-Request-ID': requestId };
  try {
    let body: unknown = undefined;
    if (text) {
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
    const candidates = db.tickets.filter((t) => t.tenant_id === tenant && t.bot_id === bot && ['open', 'in_progress', 'waiting_customer'].includes(t.status));
    const t = candidates[Math.floor(Math.random() * candidates.length)];
    const conv = t && db.conversations.find((c) => c.id === t.conversation_id);
    if (!t || !conv) return;
    const now = nowIso();
    const message = { id: newId('msg'), role: 'user' as const, content: FOLLOW_UPS[Math.floor(Math.random() * FOLLOW_UPS.length)]!, author: 'customer' as const, created_at: now };
    conv.messages.push(message);
    conv.updated_at = now;
    t.last_customer_at = now;
    t.updated_at = now;
    if (t.status === 'waiting_customer') t.status = 'open';
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

import { signSession, verifySession } from './session';

export const DEFAULT_API_BASE = 'https://api.truplexy.com/v2';

export interface HandlerOptions {
  /** The chat key (`tpx_…`). Defaults to the `TRUPLEXY_CHAT_KEY` environment variable, read on each request. */
  chatKey?: string;
  /** Signs visitor sessions. Defaults to `TRUPLEXY_SESSION_SECRET`, then the chat key. */
  sessionSecret?: string;
  /** How long a visitor keeps their conversation after their last message, in seconds. Default 30 days. */
  sessionTtl?: number;
  /** The Truplexy API. Defaults to `TRUPLEXY_API_BASE`, then production. */
  apiBase?: string;
  /** Start conversations on this channel instead of the one the chat key is bound to. */
  channelId?: string;
  /**
   * Browser origins allowed to call this route from another origin, such as
   * `["https://www.example.com"]`. Same-origin calls need nothing.
   */
  allowedOrigins?: string[];
  /**
   * Runs before every request. Return `false` to refuse it (403), or a
   * Response to send instead. Rate limiting and sign-in checks go here.
   */
  authorize?: (request: Request) => boolean | Response | Promise<boolean | Response>;
  /**
   * Background the assistant should know, such as who the visitor is. Sent
   * once, as a `[Context only]` message, when a conversation starts.
   */
  context?: (request: Request) => string | null | undefined | Promise<string | null | undefined>;
  /** Called with server-side failures. Defaults to `console.error`. Never receives the chat key. */
  onError?: (error: TruplexyError) => void;
  /** A custom fetch, for tests or proxies. */
  fetch?: typeof fetch;
}

export type Handler = (request: Request) => Promise<Response>;

/** A failure the widget is told about. `message` is safe to show visitors. */
export class TruplexyError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'TruplexyError';
  }
}

const MAX_BODY = 16 * 1024;
const MAX_NAME = 80;
const MAX_EMAIL = 254;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 4000;
const CONTEXT_PREFIX = '[Context only';

/** API failures the widget can explain; everything else becomes UPSTREAM_ERROR. */
const PASSED_ON: Record<string, [number, string]> = {
  CHANNEL_DISABLED: [503, 'Chat is turned off right now.'],
  TENANT_SUSPENDED: [503, 'Chat is turned off right now.'],
  PLAN_LIMIT_REACHED: [503, "The assistant can't reply right now. Please try again later."],
  LLM_RATE_LIMITED: [429, 'The assistant is busy. Please try again in a moment.'],
  LLM_TIMEOUT: [504, 'The reply took too long. Please try again.'],
  TIMEOUT: [504, 'The reply took too long. Please try again.'],
};

const env = (name: string): string | undefined => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name] || undefined;

interface Conversation {
  id: string;
  status: string;
  escalated: boolean;
  messages: { id: string; role: string; content: string; author?: string; agent?: string; created_at: string }[];
}

/**
 * The route the widget talks to: one POST endpoint taking `{action, session?, …}`.
 *
 * ```ts
 * // app/api/truplexy/route.ts (Next.js)
 * import { createHandler } from "@truplexy/server";
 * export const POST = createHandler();
 * ```
 */
export function createHandler(options: HandlerOptions = {}): Handler {
  const ttl = options.sessionTtl ?? 30 * 24 * 60 * 60;
  const allowed = options.allowedOrigins?.map((o) => o.replace(/\/$/, ''));
  const report = options.onError ?? ((e: TruplexyError) => console.error(`[truplexy] ${e.code} (${e.status}): ${e.message}${e.requestId ? ` request_id=${e.requestId}` : ''}`));

  return async function truplexy(request: Request): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cors: Record<string, string> = {};
    if (origin && allowed?.includes(origin)) {
      cors['Access-Control-Allow-Origin'] = origin;
      cors['Vary'] = 'Origin';
    }
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
    const fail = (e: TruplexyError) => json({ error: { code: e.code, message: e.message, ...(e.requestId && { request_id: e.requestId }) } }, e.status);

    if (allowed && origin && !cors['Access-Control-Allow-Origin']) {
      return fail(new TruplexyError('FORBIDDEN_ORIGIN', 403, 'This site may not use this chat.'));
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' },
      });
    }
    if (request.method !== 'POST') return fail(new TruplexyError('METHOD_NOT_ALLOWED', 405, 'Use POST.'));

    try {
      const body = await readBody(request);

      if (options.authorize) {
        const verdict = await options.authorize(request);
        if (verdict instanceof Response) return verdict;
        if (!verdict) throw new TruplexyError('FORBIDDEN', 403, 'You may not use this chat.');
      }

      const chatKey = options.chatKey ?? env('TRUPLEXY_CHAT_KEY');
      if (!chatKey) throw new TruplexyError('NOT_CONFIGURED', 500, 'Chat is not set up yet.');
      const secret = options.sessionSecret ?? env('TRUPLEXY_SESSION_SECRET') ?? chatKey;
      const api = createApi(chatKey, (options.apiBase ?? env('TRUPLEXY_API_BASE') ?? DEFAULT_API_BASE).replace(/\/$/, ''), options.fetch ?? fetch);
      const conversationId = await verifySession(body.session, secret, ttl);
      const session = (id: string) => signSession(id, secret);

      // Who is chatting, from the widget's details form. Both fields or neither.
      const customer = parseCustomer(body.customer);
      let ticket: Ticket | undefined;

      const start = async () => {
        // Record who is chatting as a customer of the bot, so the conversation and its ticket are linked to them.
        // The chat works without it if that fails.
        const known = customer && (await api<{ id: string }>('/customer', { name: customer.name, contacts: [{ type: 'email', value: customer.email }] }, 'PUT').catch((e) => (report(e), undefined)));
        const opening = { ...(options.channelId && { channel_id: options.channelId }), ...(known && { customer_id: known.id }) };
        const conv = await api<Conversation>('/conversations', Object.keys(opening).length ? opening : undefined);
        const lines = [customer && `Customer: ${customer.name} <${customer.email}>`, (await options.context?.(request))?.trim()].filter(Boolean);
        if (lines.length) {
          // Background only: stored as history, never answered. A failure here mustn't stop the chat.
          await api(`/conversations/${conv.id}/messages`, { message: `${CONTEXT_PREFIX}] ${lines.join('. ')}`.slice(0, MAX_TEXT) }).catch(report);
        }
        // Every conversation gets a ticket, which carries the customer. Chat still works if it fails.
        ticket = await api<Ticket>(`/conversations/${conv.id}/ticket`, { subject: customer ? `Chat with ${customer.name}` : 'Website chat' }).then(publicTicket, (e) => (report(e), undefined));
        return conv.id;
      };

      switch (body.action) {
        case 'message': {
          const text = typeof body.text === 'string' ? body.text.trim() : '';
          if (!text || text.length > MAX_TEXT) throw new TruplexyError('INVALID_REQUEST', 400, `Messages must be 1–${MAX_TEXT} characters.`);
          if (text.startsWith(CONTEXT_PREFIX)) throw new TruplexyError('INVALID_REQUEST', 400, 'That message can’t be sent.');
          let id = conversationId ?? (await start());
          const ask = () => api<{ message: unknown; reply: string | null; status: string; sources: unknown[] }>(`/conversations/${id}/messages`, { message: text });
          let result;
          try {
            result = await ask();
          } catch (e) {
            // The conversation is gone (deleted, or a different key): start a new one.
            if (!(e instanceof TruplexyError && e.code === 'CONVERSATION_NOT_FOUND') || !conversationId) throw e;
            id = await start();
            result = await ask();
          }
          return json({ session: await session(id), message: result.message, reply: result.reply, status: result.status, sources: result.sources ?? [], ...(ticket && { ticket }) });
        }

        case 'history': {
          if (!conversationId) return json({ session: null });
          try {
            const conv = await api<Conversation>(`/conversations/${conversationId}`, undefined, 'GET');
            return json({ session: await session(conversationId), conversation: publicConversation(conv) });
          } catch (e) {
            if (e instanceof TruplexyError && e.code === 'CONVERSATION_NOT_FOUND') return json({ session: null });
            throw e;
          }
        }

        case 'handoff': {
          if (!conversationId) throw new TruplexyError('NO_SESSION', 400, 'Send a message first.');
          const conv = await api<Conversation>(`/conversations/${conversationId}/handoff`);
          return json({ session: await session(conversationId), conversation: publicConversation(conv) });
        }

        case 'live': {
          if (!conversationId) return json({});
          try {
            const live = await api<{ url: string; publishable_key: string; conversation_topic?: string }>('/realtime/token', { conversation_id: conversationId });
            // Only the conversation's own topic: the bot topic carries every customer's messages.
            return json(live.conversation_topic ? { url: live.url, publishable_key: live.publishable_key, conversation_topic: live.conversation_topic } : {});
          } catch (e) {
            if (e instanceof TruplexyError && e.status === 503) return json({});
            throw e;
          }
        }

        case 'profile': {
          // The business and bot name and picture, read with the chat key. Needs no session.
          const p = await api<Profile>('/profile', undefined, 'GET');
          return json(publicProfile(p));
        }

        default:
          throw new TruplexyError('INVALID_REQUEST', 400, 'Unknown action.');
      }
    } catch (e) {
      const error = e instanceof TruplexyError ? e : new TruplexyError('INTERNAL_ERROR', 500, 'Something went wrong.');
      if (error.status >= 500) report(e instanceof TruplexyError ? e : Object.assign(error, { cause: e }));
      return fail(error);
    }
  };
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) throw new TruplexyError('BODY_TOO_LARGE', 413, 'That message is too long.');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new TruplexyError('BODY_TOO_LARGE', 413, 'That message is too long.');
  try {
    const body = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {
    // fall through
  }
  throw new TruplexyError('INVALID_REQUEST', 400, 'Send a JSON object.');
}

function createApi(chatKey: string, base: string, doFetch: typeof fetch) {
  return async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${chatKey}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new TruplexyError('UPSTREAM_ERROR', 502, 'Chat is unavailable right now.');
    }
    const data = await res.json().catch(() => null);
    if (res.ok) return data as T;

    const code: string = data?.error?.code ?? 'UPSTREAM_ERROR';
    const requestId: string | undefined = data?.error?.request_id ?? res.headers.get('X-Request-ID') ?? undefined;
    if (code === 'CONVERSATION_NOT_FOUND') throw new TruplexyError(code, 404, 'That conversation has ended.', requestId);
    if (res.status === 401) throw new TruplexyError('NOT_CONFIGURED', 500, 'Chat is not set up correctly.', requestId);
    if (res.status === 503) throw new TruplexyError(PASSED_ON[code] ? code : 'UNAVAILABLE', 503, PASSED_ON[code]?.[1] ?? 'Chat is unavailable right now.', requestId);
    const known = PASSED_ON[code];
    if (known) throw new TruplexyError(code, known[0], known[1], requestId);
    throw new TruplexyError('UPSTREAM_ERROR', 502, 'Chat is unavailable right now.', requestId);
  };
}

interface Ticket {
  id: string;
  subject?: string;
  status?: string;
}

const publicTicket = (t: Ticket): Ticket => ({ id: t.id, subject: t.subject, status: t.status });

/** `{name, email}` from the widget, or undefined. Throws when it is present but not usable. */
function parseCustomer(raw: unknown): { name: string; email: string } | undefined {
  if (raw === undefined || raw === null) return undefined;
  const c = raw as { name?: unknown; email?: unknown };
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  const email = typeof c.email === 'string' ? c.email.trim() : '';
  if (!name || name.length > MAX_NAME || !email || email.length > MAX_EMAIL || !EMAIL.test(email)) {
    throw new TruplexyError('INVALID_REQUEST', 400, 'Enter your name and a valid email address.');
  }
  return { name, email };
}

interface Profile {
  business?: { name?: string; logo_url?: string };
  bot?: { id?: string; name?: string; avatar_url?: string };
}

/** Only the names and pictures: nothing else the API might add later. */
function publicProfile(p: Profile) {
  return {
    business: { name: p.business?.name, logo_url: p.business?.logo_url },
    bot: { id: p.bot?.id, name: p.bot?.name, avatar_url: p.bot?.avatar_url },
  };
}

/** What the visitor may see: their messages and the team's, never background context. */
function publicConversation(conv: Conversation) {
  return {
    status: conv.status,
    escalated: conv.escalated,
    messages: (conv.messages ?? [])
      .filter((m) => !(m.role === 'user' && m.content.startsWith(CONTEXT_PREFIX)))
      .map(({ id, role, content, author, agent, created_at }) => ({ id, role, content, author, agent, created_at })),
  };
}

import { signSession, verifySession } from './session';

import { createChatClient, TruplexyApiError, type CustomerInput, type Conversation, type Profile, type WidgetLook } from './client';
export { DEFAULT_API_BASE } from './client';

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
  /**
   * Stop the tickets this route opens from closing on their own after a quiet
   * spell (the business's auto-close time). Default false.
   */
  keepTicketsOpen?: boolean;
  /** Trusted identity for a new conversation. Null/undefined falls back to the visitor form. */
  customer?: (request: Request) => CustomerInput | null | undefined | Promise<CustomerInput | null | undefined>;
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
const MAX_NAME = 120;
const MAX_EMAIL = 254;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 4000;
const CONTEXT_PREFIX = '[Context only';

/** API failures the widget can explain; everything else becomes UPSTREAM_ERROR. */
const PASSED_ON: Record<string, [number, string]> = {
  CUSTOMER_CONFLICT: [409, 'Your contact details could not be linked. Please contact support.'],
  CUSTOMER_EXISTS: [409, 'Your contact details could not be saved. Please try again.'],
  CUSTOMER_NOT_FOUND: [404, 'Your customer profile is unavailable. Please try again.'],
  REALTIME_NOT_CONFIGURED: [503, 'Live updates are unavailable.'],
  INVALID_REQUEST: [400, 'Check your message and customer details.'],
  TICKET_CLOSED: [409, 'This conversation is closed. Start a new one.'],
  CHANNEL_DISABLED: [503, 'Chat is turned off right now.'],
  TENANT_SUSPENDED: [503, 'Chat is turned off right now.'],
  PLAN_LIMIT_REACHED: [503, "The assistant can't reply right now. Please try again later."],
  LLM_RATE_LIMITED: [429, 'The assistant is busy. Please try again in a moment.'],
  LLM_TIMEOUT: [504, 'The reply took too long. Please try again.'],
  TIMEOUT: [504, 'The reply took too long. Please try again.'],
};

const env = (name: string): string | undefined => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name] || undefined;

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
      const api = createChatClient({ chatKey, apiBase: options.apiBase, fetch: options.fetch });
      const conversationId = await verifySession(body.session, secret, ttl);
      const session = (id: string) => signSession(id, secret);

      let ticket: Ticket | undefined;

      const start = async () => {
        const trusted = await options.customer?.(request);
        const visitor = trusted == null ? parseCustomer(body.customer) : undefined;
        const identity = trusted ?? (visitor && { name: visitor.name, contacts: [{ type: 'email', value: visitor.email }] });
        // Linking is required when identity is supplied. upsertCustomer retries a contact race once.
        const known = identity ? await api.upsertCustomer(identity) : undefined;
        if (identity && (typeof known?.id !== 'string' || !known.id)) {
          throw new TruplexyApiError('UPSTREAM_ERROR', 502, 'The chat API returned no customer ID.');
        }
        const opening = { ...(options.channelId && { channel_id: options.channelId }), ...(known && { customer_id: known.id }) };
        const conv = await api.createConversation(Object.keys(opening).length ? opening : undefined);
        const name = known?.name || identity?.name;
        try {
          const lines = [visitor ? `Customer: ${visitor.name} <${visitor.email}>` : name && `Customer: ${name}`, (await options.context?.(request))?.trim()].filter(Boolean);
          if (lines.length) await api.sendMessage(conv.id, `${CONTEXT_PREFIX}] ${lines.join('. ')}`.slice(0, MAX_TEXT));
        } catch (e) { report(safeError(e)); }
        // Background and automatic ticket creation remain best effort.
        ticket = await api.createTicket(conv.id, { subject: name ? `Chat with ${name}` : 'Website chat', ...(options.keepTicketsOpen && { keep_open: true }) })
          .then(publicTicket, (e) => (report(safeError(e)), undefined));
        return conv.id;
      };

      switch (body.action) {
        case 'message': {
          const text = typeof body.text === 'string' ? body.text.trim() : '';
          if (!text || text.length > MAX_TEXT) throw new TruplexyError('INVALID_REQUEST', 400, `Messages must be 1–${MAX_TEXT} characters.`);
          if (text.startsWith(CONTEXT_PREFIX)) throw new TruplexyError('INVALID_REQUEST', 400, 'That message can’t be sent.');
          let id = conversationId ?? (await start());
          // A closed ticket ends the chat: the widget starts a new one, never this one again.
          // (A conversation made just now has an open ticket, or none.)
          let existing = Boolean(conversationId);
          const ask = () => api.sendMessage(id, existing ? { text, ifTicketClosed: 'reject' } : text);
          let result;
          try {
            result = await ask();
          } catch (e) {
            // The conversation is gone (deleted, or a different key): start a new one.
            if (!(e instanceof TruplexyApiError && e.code === 'CONVERSATION_NOT_FOUND') || !conversationId) throw e;
            id = await start();
            existing = false;
            result = await ask();
          }
          return json({ session: await session(id), message: result.message, reply: result.reply, status: result.status, sources: result.sources ?? [], ...(ticket && { ticket }) });
        }

        case 'history': {
          if (!conversationId) return json({ session: null });
          try {
            const conv = await api.getConversation(conversationId);
            return json({ session: await session(conversationId), conversation: publicConversation(conv) });
          } catch (e) {
            if (e instanceof TruplexyApiError && e.code === 'CONVERSATION_NOT_FOUND') return json({ session: null });
            throw e;
          }
        }

        case 'handoff': {
          if (!conversationId) throw new TruplexyError('NO_SESSION', 400, 'Send a message first.');
          const conv = await api.handoff(conversationId);
          return json({ session: await session(conversationId), conversation: publicConversation(conv) });
        }

        case 'live': {
          if (!conversationId) return json({});
          try {
            const live = await api.getRealtimeToken(conversationId);
            // Only the conversation's own topic: the bot topic carries every customer's messages.
            return json(live.conversation_topic ? { url: live.url, publishable_key: live.publishable_key, conversation_topic: live.conversation_topic } : {});
          } catch (e) {
            if (e instanceof TruplexyApiError && e.code === 'REALTIME_NOT_CONFIGURED') return json({});
            throw e;
          }
        }

        case 'profile': {
          // The business and bot name and picture, read with the chat key. Needs no session.
          const p = await api.getProfile();
          return json(publicProfile(p));
        }

        default:
          throw new TruplexyError('INVALID_REQUEST', 400, 'Unknown action.');
      }
    } catch (e) {
      const error = safeError(e);
      if (error.status >= 500 || error.code.startsWith('CUSTOMER_')) report(error);
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

function safeError(error: unknown): TruplexyError {
  if (error instanceof TruplexyError) return error;
  if (!(error instanceof TruplexyApiError)) return new TruplexyError('INTERNAL_ERROR', 500, 'Something went wrong.');
  const { code, status, requestId } = error;
  if (status === 401 || code === 'NOT_CONFIGURED') return new TruplexyError('NOT_CONFIGURED', 500, 'Chat is not set up correctly.', requestId);
  const known = PASSED_ON[code];
  if (known) return new TruplexyError(code, known[0], known[1], requestId);
  if (status === 503) return new TruplexyError('UNAVAILABLE', 503, 'Chat is unavailable right now.', requestId);
  return new TruplexyError('UPSTREAM_ERROR', 502, 'Chat is unavailable right now.', requestId);
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

/** Only the names and pictures, and the window's look: nothing else the API might add later. */
function publicProfile(p: Profile) {
  const widget = publicWidget(p.widget);
  return {
    business: { name: p.business?.name, logo_url: p.business?.logo_url },
    bot: { id: p.bot?.id, name: p.bot?.name, avatar_url: p.bot?.avatar_url },
    ...(widget && { widget }),
  };
}

const TEXTS = ['heading', 'subtitle', 'greeting', 'placeholder'] as const;

/** The look the business set in the dashboard, field by field: anything of another type, or not listed here, is dropped. */
function publicWidget(w: unknown): WidgetLook | undefined {
  if (!w || typeof w !== 'object') return undefined;
  const src = w as Record<string, unknown>;
  const out: WidgetLook = {};
  for (const key of TEXTS) if (typeof src[key] === 'string' && src[key]) out[key] = (src[key] as string).slice(0, 400);
  if (typeof src.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(src.accent)) out.accent = src.accent;
  if (src.theme === 'light' || src.theme === 'dark' || src.theme === 'auto') out.theme = src.theme;
  if (src.position === 'right' || src.position === 'left') out.position = src.position;
  if (typeof src.show_sources === 'boolean') out.show_sources = src.show_sources;
  if (src.details === 'ask' || src.details === 'off') out.details = src.details;
  if (typeof src.picture_url === 'string' && /^https:\/\/[^\s"<>]+$/.test(src.picture_url) && src.picture_url.length <= 500) out.picture_url = src.picture_url;
  return Object.keys(out).length ? out : undefined;
}

/** What the visitor may see: their messages and the team's, never background context. */
function publicConversation(conv: Conversation) {
  return {
    status: conv.status,
    escalated: conv.escalated,
    ...(conv.ticket && { ticket: { id: conv.ticket.id, status: conv.ticket.status, ...(conv.ticket.closed_at && { closed_at: conv.ticket.closed_at }) } }),
    messages: (conv.messages ?? [])
      .filter((m) => !(m.role === 'user' && m.content.startsWith(CONTEXT_PREFIX)))
      .map(({ id, role, content, author, agent, created_at }) => ({ id, role, content, author, agent, created_at })),
  };
}

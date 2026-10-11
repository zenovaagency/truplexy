/** Chat-key API client. Import and call this module on your server only. */
export const DEFAULT_API_BASE = 'https://api.truplexy.com/v2';

export interface ContactInput { type: string; value: string; label?: string; primary?: boolean }
export interface Contact extends ContactInput { primary: boolean }
export interface CustomerInput { contacts: ContactInput[]; name?: string; metadata?: Record<string, unknown> }
export interface Customer {
  id: string; tenant_id: string; bot_id: string; name: string; contacts: Contact[];
  metadata: Record<string, unknown>; first_seen_at: string; last_seen_at: string;
  conversations: number; tickets: number; open_tickets: number; created_at: string; updated_at: string;
}
export interface Profile {
  business: { name: string; logo_url?: string };
  bot: { id: string; name: string; avatar_url?: string };
}
export interface Message {
  id: string; role: 'user' | 'assistant'; content: string;
  author?: 'customer' | 'assistant' | 'agent'; agent?: string; created_at: string;
}
export interface Conversation {
  id: string; status: 'open' | 'handoff'; escalated: boolean; channel_id?: string; customer_id?: string;
  created_at: string; updated_at: string; messages: Message[];
}
export interface ConversationInput { channel_id?: string; customer_id?: string }
export type ReplyStatus = 'answered' | 'clarification_required' | 'no_answer' | 'handoff_offered' | 'handoff' | 'escalated' | 'context';
export interface Source { document_id: string; title: string; section?: string; url?: string; score: number }
export interface MessageResult { message: Message; reply: string | null; status: ReplyStatus; sources: Source[] }
export interface TicketInput { subject?: string; priority?: 'low' | 'normal' | 'high' | 'urgent' }
export interface Ticket {
  id: string; subject: string; status: 'open' | 'closed'; priority: NonNullable<TicketInput['priority']>;
  escalated: boolean; channel_id?: string; customer_id?: string; created_at: string;
}
export interface ReplyInput { content: string; author?: string; external_id?: string; escalate?: boolean }
export interface ReplyResult { message: Message; ticket_id: string; escalated: boolean }
export interface RealtimeToken {
  url: string; publishable_key: string; bot_topic: string; conversation_topic?: string; events: string[];
}
export interface ChatClientOptions { chatKey?: string; apiBase?: string; fetch?: typeof fetch }

/** Raw API errors are for server code/logs, never for forwarding to visitors. */
export class TruplexyApiError extends Error {
  constructor(
    readonly code: string, readonly status: number, message: string,
    readonly requestId?: string, readonly details: Record<string, unknown> = {}, readonly retryAfter?: string,
  ) { super(message); this.name = 'TruplexyApiError'; }
}

const env = (name: string) => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name] || undefined;

export function createChatClient(options: ChatClientOptions = {}) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const key = options.chatKey ?? env('TRUPLEXY_CHAT_KEY');
    if (!key) throw new TruplexyApiError('NOT_CONFIGURED', 500, 'TRUPLEXY_CHAT_KEY is required.');
    const base = (options.apiBase ?? env('TRUPLEXY_API_BASE') ?? DEFAULT_API_BASE).replace(/\/+$/, '');
    let res: Response;
    try {
      res = await (options.fetch ?? fetch)(base + path, {
        method, headers: { Authorization: `Bearer ${key}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw new TruplexyApiError('UPSTREAM_ERROR', 502, 'The chat API could not be reached.'); }
    const data = await res.json().catch(() => null);
    const requestId = data?.error?.request_id ?? res.headers.get('X-Request-ID') ?? undefined;
    if (!res.ok) {
      const { code = 'UPSTREAM_ERROR', message = 'The chat API request failed.', request_id: _, ...details } = data?.error ?? {};
      throw new TruplexyApiError(code, res.status, message, requestId, details, res.headers.get('Retry-After') ?? undefined);
    }
    if (data === null) throw new TruplexyApiError('UPSTREAM_ERROR', 502, 'The chat API returned invalid JSON.', requestId);
    return data as T;
  }
  const conversation = (id: string, action = '') => `/conversations/${encodeURIComponent(id)}${action}`;
  return {
    getProfile: () => request<Profile>('GET', '/profile'),
    async upsertCustomer(input: CustomerInput): Promise<Customer> {
      try { return await request<Customer>('PUT', '/customer', input); }
      catch (e) {
        // A concurrent upsert may have claimed the contact. One retry finds its owner.
        if (!(e instanceof TruplexyApiError && e.status === 409 && e.code === 'CUSTOMER_EXISTS')) throw e;
        return request<Customer>('PUT', '/customer', input);
      }
    },
    createConversation: (input?: ConversationInput) => request<Conversation>('POST', '/conversations', input),
    getConversation: (id: string) => request<Conversation>('GET', conversation(id)),
    sendMessage: (id: string, message: string) => request<MessageResult>('POST', conversation(id, '/messages'), { message }),
    handoff: (id: string) => request<Conversation>('POST', conversation(id, '/handoff')),
    escalate: (id: string) => request<Conversation>('POST', conversation(id, '/escalate')),
    resume: (id: string) => request<Conversation>('POST', conversation(id, '/resume')),
    createTicket: (id: string, input?: TicketInput) => request<Ticket>('POST', conversation(id, '/ticket'), input),
    closeTicket: (id: string) => request<Ticket>('POST', conversation(id, '/ticket/close')),
    sendReply: (id: string, input: ReplyInput) => request<ReplyResult>('POST', conversation(id, '/replies'), input),
    getRealtimeToken: (id?: string) => request<RealtimeToken>('POST', '/realtime/token', id === undefined ? undefined : { conversation_id: id }),
  };
}
export type ChatClient = ReturnType<typeof createChatClient>;

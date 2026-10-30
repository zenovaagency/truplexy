import {
  abortError,
  isAbortError,
  putToUrl,
  PutFailure,
  readImage,
  sha256Hex,
  UPLOAD_FAILED,
  type Attachment,
  type AttachmentConfig,
  type AttachmentRegistration,
  type AttachmentUpload,
  type ImageSource,
  type ImageUploadOptions,
  type UploadProgress,
  type UploadTarget,
} from './attachments';

/** Chat-key API client. Import and call this module on your server only. */
export const DEFAULT_API_BASE = 'https://api.truplexy.com/v3';

export interface ContactInput { type: string; value: string; label?: string; primary?: boolean }
export interface Contact extends ContactInput { primary: boolean }
export interface CustomerInput {
  contacts: ContactInput[]; name?: string; metadata?: Record<string, unknown>;
  /** Values of the bot's custom properties by key, merged into the customer's; null clears one. */
  properties?: Record<string, unknown>;
  /** An https link to the person's picture on your platform, copied once per link; "" removes a copied picture. */
  avatar_url?: string;
}
export interface Customer {
  id: string; tenant_id: string; bot_id: string; name: string; contacts: Contact[];
  metadata: Record<string, unknown>;
  /** Custom property values by key; sensitive ones are never returned to a chat key. */
  properties?: Record<string, unknown>;
  /** Keys of sensitive values left out. */
  masked_properties?: string[];
  /** Absent when the customer has no picture. */
  avatar_url?: string; avatar_source?: 'upload' | 'url';
  first_seen_at: string; last_seen_at: string;
  conversations: number; tickets: number; open_tickets: number; created_at: string; updated_at: string;
}
export interface Profile {
  business: { name: string; logo_url?: string };
  bot: { id: string; name: string; avatar_url?: string };
  /** Image input (planned). Absent from an API that predates it: treat that as off. */
  attachments?: AttachmentConfig;
  /** How the business set the chat window to look in the dashboard. Absent from an API that predates it. */
  widget?: WidgetLook;
}
/** The chat window's look (dashboard: Integrations, Chat widget). Texts the business left empty are absent. */
export interface WidgetLook {
  heading?: string; subtitle?: string; greeting?: string; placeholder?: string;
  accent?: string; theme?: 'light' | 'dark' | 'auto'; position?: 'right' | 'left';
  show_sources?: boolean; details?: 'ask' | 'off'; picture_url?: string;
  /** Up to 4 questions a visitor can tap to send before their first message; absent when there are none. */
  suggestions?: string[];
}
export interface Message {
  id: string; role: 'user' | 'assistant'; content: string;
  author?: 'customer' | 'assistant' | 'agent'; agent?: string; created_at: string;
  /** The pictures a customer message carried (image input, planned). Their `url` is signed for 1 hour. */
  attachments?: Attachment[];
}
export interface Conversation {
  id: string; status: 'open' | 'handoff'; escalated: boolean; channel_id?: string; customer_id?: string;
  created_at: string; updated_at: string; messages: Message[];
  /** The current ticket: the open one, else the latest, which is closed. `getConversation` returns it, and `createConversation` the one its `ticket` opened; absent before the conversation has one. */
  ticket?: Ticket;
}
export interface ConversationInput {
  channel_id?: string; customer_id?: string;
  /** Background for the assistant, up to 4000 characters, stored as a `[Context only]` message that gets no reply. Best effort. */
  context?: string;
  /** Opens the conversation's ticket in the same call, as `createTicket` does. Best effort: check the result's `ticket`. */
  ticket?: TicketInput;
}
export type ReplyStatus = 'answered' | 'clarification_required' | 'no_answer' | 'handoff_offered' | 'handoff' | 'escalated' | 'context';
export interface Source {
  /** Web results have kind "web" and a url instead of a document. */
  kind?: 'document' | 'web';
  document_id?: string; title: string; section?: string; url?: string; score?: number;
}
/** A picture for `sendMessage`, with the name and type to register it under when its bytes alone don't say. */
export interface NamedImage { data: ImageSource; filename?: string; contentType?: string }
/** What `sendMessage` takes besides plain text. */
export interface MessageInput {
  /** 1–4000 characters; may be left out when pictures are sent, though text gives better answers. */
  text?: string;
  /** Uploaded first, in parallel, then named in the message. The message is not sent if one fails. */
  images?: (ImageSource | NamedImage)[];
  /** IDs of pictures you already uploaded (`uploadImage`), each used once and within an hour. */
  attachments?: string[];
  /** Makes the send happen once: a retry with the same key returns the first answer. Not for the pictures: each attachment is single-use. */
  idempotencyKey?: string;
  /** `'reject'` refuses the message with `TICKET_CLOSED` (409) when the conversation's ticket is closed. By default it is answered like any other. */
  ifTicketClosed?: 'reject';
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress & { image: number }) => void;
}
/** The limits `PLAN_LIMIT_REACHED` can name in `error.limit`. */
export type PlanLimit = 'bots' | 'documents_per_bot' | 'members' | 'replies_per_month' | 'tokens_per_month' | 'web_search' | 'image_input';
export interface MessageResult { message: Message; reply: string | null; status: ReplyStatus; sources: Source[] }
export interface TicketInput {
  subject?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  /** true stops a new ticket closing on its own after a quiet spell. */
  keep_open?: boolean;
}
export interface Ticket {
  id: string; subject: string; status: 'open' | 'closed'; priority: NonNullable<TicketInput['priority']>;
  escalated: boolean; channel_id?: string; customer_id?: string; created_at: string;
  /** When the ticket was closed; absent while it is open. */
  closed_at?: string;
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
  /** With `PLAN_LIMIT_REACHED`, which limit: `image_input` means the plan has no picture input. */
  get limit(): PlanLimit | undefined { return typeof this.details.limit === 'string' ? (this.details.limit as PlanLimit) : undefined; }
}

const env = (name: string) => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name] || undefined;

export function createChatClient(options: ChatClientOptions = {}) {
  async function request<T>(method: string, path: string, body?: unknown, extra: { signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
    const key = options.chatKey ?? env('TRUPLEXY_CHAT_KEY');
    if (!key) throw new TruplexyApiError('NOT_CONFIGURED', 500, 'TRUPLEXY_CHAT_KEY is required.');
    const base = (options.apiBase ?? env('TRUPLEXY_API_BASE') ?? DEFAULT_API_BASE).replace(/\/+$/, '');
    if (extra.signal?.aborted) throw abortError();
    let res: Response;
    try {
      res = await (options.fetch ?? fetch)(base + path, {
        method, headers: { Authorization: `Bearer ${key}`, ...(body !== undefined && { 'Content-Type': 'application/json' }), ...extra.headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: extra.signal,
      });
    } catch (e) {
      if (isAbortError(e)) throw e;
      throw new TruplexyApiError('UPSTREAM_ERROR', 502, 'The chat API could not be reached.');
    }
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
  const doFetch = (...args: Parameters<typeof fetch>) => (options.fetch ?? fetch)(...args);

  /** Registers one picture's details and returns where to `PUT` it. */
  const createAttachment = (id: string, registration: AttachmentRegistration, extra?: { signal?: AbortSignal }) =>
    request<AttachmentUpload>('POST', conversation(id, '/attachments'), registration, extra);
  const targetOf = (u: AttachmentUpload): UploadTarget => ({ attachmentId: u.attachment.id, url: u.url, method: u.method, headers: u.headers, expiresAt: u.expires_at });
  const isRegistration = (x: unknown): x is AttachmentRegistration =>
    typeof x === 'object' && x !== null && !(typeof Blob !== 'undefined' && x instanceof Blob) && !ArrayBuffer.isView(x) && typeof (x as AttachmentRegistration).sha256 === 'string' && typeof (x as AttachmentRegistration).content_type === 'string';

  async function register(id: string, input: ImageSource | AttachmentRegistration, o: ImageUploadOptions) {
    let registration: AttachmentRegistration;
    let bytes: Uint8Array | undefined;
    if (isRegistration(input)) registration = input;
    else {
      const img = await readImage(input, o);
      o.onProgress?.({ phase: 'hashing', loaded: 0, total: img.bytes.length });
      registration = { filename: img.filename, content_type: img.type, size: img.bytes.length, sha256: await sha256Hex(img.bytes) };
      bytes = img.bytes;
    }
    o.onProgress?.({ phase: 'registering', loaded: 0, total: registration.size });
    return { target: targetOf(await createAttachment(id, registration, { signal: o.signal })), bytes };
  }

  /** Hashes, registers and `PUT`s one picture; resolves to the attachment ID to send. */
  async function uploadImage(id: string, image: ImageSource, o: ImageUploadOptions = {}): Promise<string> {
    const { target, bytes } = await register(id, image, o);
    o.onProgress?.({ phase: 'uploading', loaded: 0, total: bytes!.length });
    try {
      // Exactly the returned headers, and not the chat key: this request goes to storage.
      await putToUrl(doFetch, target, bytes!, { signal: o.signal, backoffMs: o.backoffMs });
    } catch (e) {
      if (e instanceof PutFailure) throw new TruplexyApiError(UPLOAD_FAILED, e.status || 502, e.message);
      throw e;
    }
    o.onProgress?.({ phase: 'done', loaded: bytes!.length, total: bytes!.length });
    return target.attachmentId;
  }

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
    /**
     * Sends a customer message. Plain text works as ever; pass `{ text, images }` to upload pictures first
     * and send them with it (image input, planned: check `getAttachmentConfig()`).
     */
    async sendMessage(id: string, message: string | MessageInput): Promise<MessageResult> {
      if (typeof message === 'string') return request<MessageResult>('POST', conversation(id, '/messages'), { message });
      const uploaded = await Promise.all(
        (message.images ?? []).map((img, image) => {
          const { data, filename, contentType } = 'data' in (img as object) ? (img as NamedImage) : ({ data: img as ImageSource } as NamedImage);
          return uploadImage(id, data, { filename, contentType, signal: message.signal, onProgress: message.onProgress && ((p) => message.onProgress!({ ...p, image })) });
        }),
      );
      const attachments = [...(message.attachments ?? []), ...uploaded];
      return request<MessageResult>(
        'POST', conversation(id, '/messages'),
        { message: message.text ?? '', ...(attachments.length && { attachments }), ...(message.ifTicketClosed && { if_ticket_closed: message.ifTicketClosed }) },
        { signal: message.signal, headers: message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : undefined },
      );
    },
    /** Image input (planned): the limits for this bot from `GET /profile`. `{ enabled: false }` while the API doesn't serve it. */
    async getAttachmentConfig(): Promise<AttachmentConfig> { return (await request<Profile>('GET', '/profile')).attachments ?? { enabled: false }; },
    /** Registers a picture's details and returns the presigned `PUT` target. Low level: see `registerImage` and `uploadImage`. */
    createAttachment: (id: string, registration: AttachmentRegistration) => createAttachment(id, registration),
    uploadImage,
    /**
     * For a browser widget, which must never hold the chat key: registers a picture and returns
     * `{ attachmentId, url, headers }` for the browser to `PUT` straight to R2. Give it the picture's
     * bytes, or the `{ filename, content_type, size, sha256 }` the browser computed, so the file never
     * has to pass through your server. Then send the message with `attachments: [attachmentId]`.
     */
    async registerImage(id: string, image: ImageSource | AttachmentRegistration, o: ImageUploadOptions = {}): Promise<UploadTarget> { return (await register(id, image, o)).target; },
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

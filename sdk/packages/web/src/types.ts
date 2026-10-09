/** How the assistant handled a message (see the Truplexy chat API). */
export type ReplyStatus = 'answered' | 'clarification_required' | 'no_answer' | 'handoff_offered' | 'handoff' | 'escalated' | 'context';

export interface Source {
  document_id: string;
  title: string;
  section?: string;
  url?: string;
  score: number;
}

export interface ChatMessage {
  /** The server's `msg_…` ID, or a local ID until the conversation is next synced. */
  id: string;
  /** `user` is the visitor; `assistant` is the AI or, with `agent` set, a person on the team. */
  role: 'user' | 'assistant';
  content: string;
  /** The team member who wrote it, for a person's reply. */
  agent?: string;
  createdAt: string;
  /** Cited documents, for an answered reply. */
  sources?: Source[];
  /** A visitor message on its way. */
  pending?: boolean;
  /** A visitor message that failed to send; `retry(id)` sends it again. */
  error?: ChatError;
}

export interface ChatError {
  code: string;
  message: string;
  requestId?: string;
}

/** The business and bot behind the chat key, as your server route's `profile` action returns it. Any field can be missing. */
export interface ChatProfile {
  business?: { name?: string; logo_url?: string };
  bot?: { id?: string; name?: string; avatar_url?: string };
}

/** Who is chatting. Asked once, kept in the visitor's browser. */
export interface Customer {
  name: string;
  email: string;
}

/** The ticket opened for the visitor's conversation. */
export interface TicketRef {
  id: string;
  subject?: string;
  status?: string;
}

export interface ChatState {
  /** The visitor's name and email, once given. Saved in the browser. */
  customer: Customer | null;
  /** The ticket opened for this conversation, kept with the session in the browser. */
  ticket: TicketRef | null;
  /** The first message is waiting for the visitor's name and email: call `setCustomer()`, then `send()` again. */
  needsDetails: boolean;
  /** The business's name and logo and the bot's name and picture; null until loaded, or when the server can't provide them. */
  profile: ChatProfile | null;
  messages: ChatMessage[];
  /** Waiting for the assistant's reply. */
  sending: boolean;
  /** The last reply offered a person: show a "Talk to a person" button. */
  offerHandoff: boolean;
  /** The conversation was flagged for the team; the AI keeps replying. */
  handoff: boolean;
  /** A person has taken the conversation over; the AI is silent. */
  escalated: boolean;
  /** Assistant and team messages since the visitor last looked. */
  unread: number;
  /** The last failure that wasn't tied to one message. */
  error: ChatError | null;
  /** True once stored history is loaded (and, with a session, synced). */
  ready: boolean;
}

/** How the client reaches your server route. The default posts JSON to `endpoint`. */
export interface Transport {
  request<T = any>(action: 'message' | 'history' | 'handoff' | 'live' | 'profile', body: Record<string, unknown>): Promise<T>;
  /** Push updates without realtime or polling (used by demo mode). */
  listen?(onChange: () => void): () => void;
}

/** Wire format of a conversation, as your server route returns it. */
export interface WireConversation {
  status: string;
  escalated: boolean;
  messages: { id: string; role: 'user' | 'assistant'; content: string; author?: string; agent?: string; created_at: string }[];
}

export interface WireReply {
  session: string;
  message?: { id?: string; created_at?: string };
  reply: string | null;
  status: ReplyStatus;
  sources?: Source[];
  ticket?: TicketRef;
}

export interface WireLive {
  url?: string;
  publishable_key?: string;
  conversation_topic?: string;
}

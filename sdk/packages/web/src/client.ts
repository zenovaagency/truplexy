import { listenRealtime } from './realtime';
import { localStore, type SessionStore } from './store';
import { DEFAULT_ENDPOINT, fetchTransport, TruplexyRequestError, type FetchTransportOptions } from './transport';
import type { ChatError, ChatMessage, ChatProfile, ChatState, ReplyStatus, Transport, WireConversation, WireLive, WireReply } from './types';

export interface ClientOptions extends FetchTransportOptions {
  /** Replaces the default fetch transport, e.g. to call your server another way. */
  transport?: Transport;
  /** Where the session and recent messages are kept. Default localStorage; `false` keeps them in memory only. */
  store?: SessionStore | false;
  /** The localStorage key. Default `truplexy:<endpoint>`. */
  storageKey?: string;
  /** Listen for team replies (realtime, else polling). Default true. */
  live?: boolean;
}

export interface ClientEvents {
  /** New assistant or team messages arrived. */
  message: ChatMessage[];
  /** How the assistant handled the visitor's last message. */
  status: ReplyStatus;
  error: ChatError;
}

const CONTEXT_PREFIX = '[Context only';

const initialState = (): ChatState => ({
  profile: null,
  messages: [],
  sending: false,
  offerHandoff: false,
  handoff: false,
  escalated: false,
  unread: 0,
  error: null,
  ready: false,
});

const toError = (e: unknown): ChatError =>
  e instanceof TruplexyRequestError
    ? { code: e.code, message: e.message, ...(e.requestId && { requestId: e.requestId }) }
    : { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };

const assistantCount = (messages: ChatMessage[]) => messages.reduce((n, m) => n + (m.role === 'assistant' ? 1 : 0), 0);

/**
 * The headless chat: session, messages, sending, handoff and live team
 * replies. `<truplexy-chat>` is built on it; use it directly for your own UI.
 *
 * ```ts
 * const chat = new TruplexyClient({ endpoint: "/api/truplexy" });
 * chat.subscribe((state) => render(state.messages));
 * await chat.start();
 * await chat.send("Where is my order?");
 * ```
 */
export class TruplexyClient {
  private state = initialState();
  private readonly listeners = new Set<(state: ChatState) => void>();
  private readonly handlers: Partial<Record<keyof ClientEvents, Set<(payload: never) => void>>> = {};
  private readonly transport: Transport;
  private readonly store: SessionStore;
  private readonly live: boolean;
  private session: string | null = null;
  private seen = 0;
  private open = false;
  private started?: Promise<void>;
  private destroyed = false;
  private seq = 0;
  private syncing?: Promise<void>;
  private syncAgain = false;
  private stopLive?: () => void;
  private liveConnected = false;
  private liveAttempts = 0;
  private timers: { poll?: ReturnType<typeof setTimeout>; retry?: ReturnType<typeof setTimeout>; debounce?: ReturnType<typeof setTimeout> } = {};

  constructor(options: ClientOptions = {}) {
    this.transport = options.transport ?? fetchTransport(options);
    const key = options.storageKey ?? `truplexy:${options.endpoint || DEFAULT_ENDPOINT}`;
    this.store = options.store === false ? localStoreInMemory() : (options.store ?? localStore(key));
    this.live = options.live !== false;
  }

  getState(): ChatState {
    return this.state;
  }

  /** Calls `listener` on every change. Returns an unsubscribe function. */
  subscribe(listener: (state: ChatState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  on<K extends keyof ClientEvents>(type: K, handler: (payload: ClientEvents[K]) => void): () => void {
    const set = (this.handlers[type] ??= new Set());
    set.add(handler as (payload: never) => void);
    return () => set.delete(handler as (payload: never) => void);
  }

  /** Loads the saved conversation, syncs it and starts listening. Safe to call more than once. */
  start(): Promise<void> {
    this.started ??= (async () => {
      const saved = this.store.load();
      this.session = saved.session;
      this.seen = saved.seen;
      this.update({ messages: saved.messages.filter((m) => !m.pending) });
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
      void this.loadProfile();
      if (this.session) {
        await this.sync();
        this.connectLive();
      }
      this.update({ ready: true });
    })();
    return this.started;
  }

  /** Reads the business and bot name and picture from your server. Failing is fine: the widget keeps its defaults. */
  private async loadProfile(): Promise<void> {
    try {
      const profile = await this.transport.request<ChatProfile>('profile', {});
      if (!this.destroyed && profile && typeof profile === 'object' && (profile.business || profile.bot)) this.update({ profile });
    } catch {
      // Older server route, or the API is unreachable: no profile.
    }
  }

  /** Sends a visitor message. Resolves when the reply (if any) is in. */
  async send(text: string): Promise<void> {
    const content = text.trim().slice(0, 4000);
    if (!content || this.state.sending) return;
    const local: ChatMessage = { id: `local_${++this.seq}`, role: 'user', content, createdAt: new Date().toISOString(), pending: true };
    this.update({ messages: [...this.state.messages, local], offerHandoff: false, error: null });
    await this.deliver(local);
  }

  /** Sends a failed message again. */
  async retry(id: string): Promise<void> {
    const failed = this.state.messages.find((m) => m.id === id && m.error);
    if (!failed || this.state.sending) return;
    const local = { ...failed, pending: true, error: undefined };
    this.update({ messages: [...this.state.messages.filter((m) => m.id !== id), local], error: null });
    await this.deliver(local);
  }

  /** Flags the conversation for the team (the "Talk to a person" button). */
  async handoff(): Promise<void> {
    if (!this.session) return;
    this.update({ offerHandoff: false, sending: true });
    try {
      const r = await this.transport.request<{ session: string; conversation: WireConversation }>('handoff', { session: this.session });
      this.session = r.session;
      this.update({ sending: false });
      this.apply(r.conversation);
    } catch (e) {
      this.fail(toError(e), { sending: false, offerHandoff: true });
    } finally {
      this.flushSync();
    }
  }

  /** Refetches the conversation from your server. */
  sync(): Promise<void> {
    if (!this.session || this.destroyed) return Promise.resolve();
    if (this.state.sending || this.syncing) {
      this.syncAgain = true;
      return this.syncing ?? Promise.resolve();
    }
    this.syncing = (async () => {
      try {
        const r = await this.transport.request<{ session: string | null; conversation?: WireConversation }>('history', { session: this.session });
        if (!r.session || !r.conversation) {
          // Expired, or the conversation is gone: the next message starts a new one.
          this.session = null;
          this.seen = 0;
          this.disconnectLive();
          this.update({ messages: this.state.messages.filter((m) => m.pending || m.error), escalated: false, handoff: false, offerHandoff: false });
        } else {
          this.session = r.session;
          this.apply(r.conversation);
        }
      } catch {
        // Background refresh: keep what's shown and try again on the next tick.
      } finally {
        this.syncing = undefined;
        this.flushSync();
      }
    })();
    return this.syncing;
  }

  /** Tell the client whether the chat is on screen: it clears unread and polls faster while open. */
  setOpen(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    this.update({});
    if (open && !this.liveConnected) void this.sync();
    this.schedule();
  }

  /** Forgets the conversation; the next message starts a new one. */
  reset(): void {
    this.disconnectLive();
    clearTimeout(this.timers.poll);
    this.store.clear();
    this.session = null;
    this.seen = 0;
    this.state = { ...initialState(), profile: this.state.profile, ready: true };
    this.update({});
  }

  /** Stops timers and connections. */
  destroy(): void {
    this.destroyed = true;
    this.disconnectLive();
    clearTimeout(this.timers.poll);
    clearTimeout(this.timers.debounce);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.listeners.clear();
  }

  /* ---------------------------------------------------------------- */

  private async deliver(local: ChatMessage) {
    this.update({ sending: true });
    const hadSession = Boolean(this.session);
    try {
      const r = await this.transport.request<WireReply>('message', { text: local.content, session: this.session });
      this.session = r.session;
      const messages = this.state.messages.map((m) =>
        m.id === local.id ? { ...m, id: r.message?.id ?? m.id, createdAt: r.message?.created_at ?? m.createdAt, pending: undefined } : m,
      );
      // "escalated" (a person has it) and "context" carry no reply.
      if (r.reply && r.status !== 'escalated' && r.status !== 'context') {
        messages.push({ id: `local_${++this.seq}`, role: 'assistant', content: r.reply, createdAt: new Date().toISOString(), ...(r.sources?.length && { sources: r.sources }) });
      }
      this.update({
        messages,
        sending: false,
        offerHandoff: r.status === 'handoff_offered',
        handoff: this.state.handoff || r.status === 'handoff',
        escalated: this.state.escalated || r.status === 'escalated',
      });
      this.emit('status', r.status);
      if (!hadSession) this.connectLive();
    } catch (e) {
      const error = toError(e);
      this.update({ messages: this.state.messages.map((m) => (m.id === local.id ? { ...m, pending: undefined, error } : m)), sending: false });
      this.emit('error', error);
    } finally {
      this.flushSync();
    }
  }

  /** Takes the server's conversation as the truth, keeping messages still on their way. */
  private apply(conv: WireConversation) {
    const local = this.state.messages;
    const server: ChatMessage[] = conv.messages
      .filter((m) => !(m.role === 'user' && m.content.startsWith(CONTEXT_PREFIX)))
      .map((m) => {
        const msg: ChatMessage = { id: m.id, role: m.role, content: m.content, createdAt: m.created_at };
        if (m.author === 'agent') msg.agent = m.agent || 'Support';
        // History has no sources; keep the ones the reply came with.
        const sources = m.role === 'assistant' && local.find((l) => l.role === 'assistant' && l.sources && l.content === m.content)?.sources;
        if (sources) msg.sources = sources;
        return msg;
      });
    const ids = new Set(server.map((m) => m.id));
    const inFlight = local.filter((m) => (m.pending || m.error) && !ids.has(m.id));
    const handoff = conv.status === 'handoff';
    this.update({
      messages: [...server, ...inFlight],
      escalated: conv.escalated,
      handoff,
      offerHandoff: this.state.offerHandoff && !conv.escalated && !handoff,
    });
  }

  private update(patch: Partial<ChatState>) {
    if (this.destroyed) return;
    const before = assistantCount(this.state.messages);
    const next = { ...this.state, ...patch };
    const count = assistantCount(next.messages);
    if (this.open) this.seen = count;
    next.unread = Math.max(0, count - this.seen);
    this.state = next;
    this.store.save({ session: this.session, messages: next.messages, seen: this.seen });
    for (const listener of this.listeners) listener(next);
    if (count > before && this.state.ready) {
      this.emit('message', next.messages.filter((m) => m.role === 'assistant').slice(before - count));
    }
  }

  private fail(error: ChatError, patch: Partial<ChatState> = {}) {
    this.update({ ...patch, error });
    this.emit('error', error);
  }

  private emit<K extends keyof ClientEvents>(type: K, payload: ClientEvents[K]) {
    for (const handler of this.handlers[type] ?? []) {
      try {
        (handler as (payload: ClientEvents[K]) => void)(payload);
      } catch (e) {
        console.error(e);
      }
    }
  }

  private flushSync() {
    if (this.syncAgain && !this.state.sending && !this.syncing) {
      this.syncAgain = false;
      void this.sync();
    }
  }

  private connectLive() {
    if (!this.live || !this.session || this.stopLive || this.destroyed) return this.schedule();
    if (this.transport.listen) {
      this.stopLive = this.transport.listen(() => this.sync());
      this.liveConnected = true;
      return this.schedule();
    }
    this.schedule();
    this.transport
      .request<WireLive>('live', { session: this.session })
      .then((live) => {
        if (this.destroyed || this.stopLive || !live.url || !live.publishable_key || !live.conversation_topic) return;
        this.stopLive = listenRealtime({
          url: live.url,
          key: live.publishable_key,
          topic: live.conversation_topic,
          onEvent: () => {
            clearTimeout(this.timers.debounce);
            this.timers.debounce = setTimeout(() => void this.sync(), 250);
          },
          onStatus: (up) => {
            this.liveConnected = up;
            if (up) {
              this.liveAttempts = 0;
              void this.sync(); // catch up on anything sent while we weren't listening
            } else {
              this.stopLive?.();
              this.stopLive = undefined;
              clearTimeout(this.timers.retry);
              this.timers.retry = setTimeout(() => this.connectLive(), Math.min(60_000, 1000 * 2 ** this.liveAttempts++));
            }
            this.schedule();
          },
        });
      })
      .catch(() => {
        // No live updates: polling covers it.
      });
  }

  private disconnectLive() {
    clearTimeout(this.timers.retry);
    this.stopLive?.();
    this.stopLive = undefined;
    this.liveConnected = false;
  }

  /** Polls for team replies: often while open, rarely while closed, slowly as a backstop to realtime. */
  private schedule() {
    clearTimeout(this.timers.poll);
    if (!this.live || !this.session || this.destroyed) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const ms = this.liveConnected ? 120_000 : this.open ? 10_000 : 60_000;
    this.timers.poll = setTimeout(() => void this.sync().then(() => this.schedule()), ms);
  }

  private onVisibility = () => {
    if (document.visibilityState === 'visible') void this.sync().then(() => this.schedule());
    else clearTimeout(this.timers.poll);
  };
}

function localStoreInMemory(): SessionStore {
  let saved = { session: null as string | null, messages: [] as ChatMessage[], seen: 0 };
  return {
    load: () => saved,
    save: (s) => (saved = s),
    clear: () => (saved = { session: null, messages: [], seen: 0 }),
  };
}

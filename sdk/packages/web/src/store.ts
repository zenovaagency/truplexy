import type { ChatMessage, Customer, TicketRef } from './types';

export interface Saved {
  session: string | null;
  messages: ChatMessage[];
  /** How many assistant messages the visitor has seen. */
  seen: number;
  /** Kept across conversations, so the visitor is asked only once. */
  customer?: Customer | null;
  /** The ticket of the current conversation. */
  ticket?: TicketRef | null;
}

export interface SessionStore {
  load(): Saved;
  save(saved: Saved): void;
  clear(): void;
}

const EMPTY: Saved = { session: null, messages: [], seen: 0, customer: null, ticket: null };

const customerOf = (v: unknown): Customer | null => {
  const c = v as Partial<Customer> | null;
  return c && typeof c.name === 'string' && typeof c.email === 'string' && c.name && c.email ? { name: c.name, email: c.email } : null;
};
const ticketOf = (v: unknown): TicketRef | null => {
  const t = v as Partial<TicketRef> | null;
  return t && typeof t.id === 'string' && t.id ? { id: t.id, ...(typeof t.subject === 'string' && { subject: t.subject }), ...(typeof t.status === 'string' && { status: t.status }) } : null;
};
const KEEP = 100;

/** localStorage when it works (it can throw in private windows or with storage blocked), memory otherwise. */
export function localStore(key: string): SessionStore {
  let memory: Saved = EMPTY;
  const storage = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  };
  return {
    load() {
      try {
        const raw = storage()?.getItem(key);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Saved>;
          memory = {
            session: typeof saved.session === 'string' ? saved.session : null,
            messages: Array.isArray(saved.messages) ? saved.messages.filter((m) => m && typeof m.content === 'string') : [],
            seen: typeof saved.seen === 'number' ? saved.seen : 0,
            customer: customerOf(saved.customer),
            ticket: ticketOf(saved.ticket),
          };
        }
      } catch {
        // Corrupt or unreadable: start from what's in memory.
      }
      return memory;
    },
    save(saved) {
      memory = { ...saved, messages: saved.messages.filter((m) => !m.pending).slice(-KEEP) };
      try {
        storage()?.setItem(key, JSON.stringify(memory));
      } catch {
        // Full or blocked: memory still has it.
      }
    },
    clear() {
      memory = EMPTY;
      try {
        storage()?.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

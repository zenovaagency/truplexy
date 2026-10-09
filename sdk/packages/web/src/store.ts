import type { ChatMessage } from './types';

export interface Saved {
  session: string | null;
  messages: ChatMessage[];
  /** How many assistant messages the visitor has seen. */
  seen: number;
}

export interface SessionStore {
  load(): Saved;
  save(saved: Saved): void;
  clear(): void;
}

const EMPTY: Saved = { session: null, messages: [], seen: 0 };
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

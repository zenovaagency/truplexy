import { createContext, useContext } from 'react';
import type { Scope } from '@/lib/api/client';
import type { BotRef, Membership, Permission, Role } from '@/lib/api/types';

/** The business and bot every business page acts on, plus what the person may do there. */
export interface ScopeContextValue {
  scope: Scope;
  /** Absent when a platform admin opens a business they don't belong to. */
  membership?: Membership;
  businessName: string;
  businessStatus: 'active' | 'suspended';
  bot: BotRef;
  bots: BotRef[];
  role: Role | null;
  isPlatformAdmin: boolean;
  can: (p: Permission) => boolean;
  /** Path to a tab in this scope, e.g. href('tickets'). */
  href: (path?: string) => string;
}

export const ScopeContext = createContext<ScopeContextValue | null>(null);

export function useScopeCtx() {
  const v = useContext(ScopeContext);
  if (!v) throw new Error('useScopeCtx must be used inside a business scope');
  return v;
}

export const useScope = () => useScopeCtx().scope;
export const useCan = () => useScopeCtx().can;

/** Remembers the last scope, so a new tab can return to it. */
const LAST_SCOPE_KEY = 'truplexy.scope';

function readScope(storage: () => Storage): Scope | null {
  try {
    const v = JSON.parse(storage().getItem(LAST_SCOPE_KEY) ?? 'null');
    return v && typeof v.tenant === 'string' && typeof v.bot === 'string' ? { tenant: v.tenant, bot: v.bot } : null;
  } catch {
    return null;
  }
}

function writeScope(storage: () => Storage, s: Scope) {
  try {
    storage().setItem(LAST_SCOPE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const lastScope = () => readScope(() => localStorage);

/** The scope this tab is on (kept per tab, so two tabs can show different businesses), else the last one used. */
export const activeScope = () => readScope(() => sessionStorage) ?? lastScope();

/** Keeps the tab's scope. Only memberships are remembered for new tabs; a platform admin's visit is not. */
export function setActiveScope(s: Scope, { remember }: { remember: boolean }) {
  writeScope(() => sessionStorage, s);
  if (remember) writeScope(() => localStorage, s);
}

/** Navigation state that moves the tab into another scope. The scope is never in the URL. */
export interface ScopeState {
  scope?: Scope;
}

export const scopeOf = (state: unknown): Scope | undefined => (state as ScopeState | null)?.scope;

/** Whether a navigation moves to a scope other than `current`. */
export const switchesScope = (state: unknown, current?: Scope) => {
  const next = scopeOf(state);
  return Boolean(next && (!current || next.tenant !== current.tenant || next.bot !== current.bot));
};

/** Link to a tab in another scope: pass `to` and `state` to <Link> or navigate(). */
export const scopeLink = (s: Scope, path = 'overview') => ({ to: `/${path}`, state: { scope: s } satisfies ScopeState });

/** A link someone else can open: /t/:tenant/:bot/... selects the scope, then shows the plain URL. */
export const shareUrl = (s: Scope, path = 'overview') => `${window.location.origin}/t/${s.tenant}/${s.bot}/${path}`;

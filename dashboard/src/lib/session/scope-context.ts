import { createContext, useContext } from 'react';
import type { Scope } from '@/lib/api/client';
import type { BotRef, Membership, Permission, Role } from '@/lib/api/types';

/** The business and bot every /t/:tenant/:bot page acts on, plus what the person may do there. */
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

/** Remembers the last scope, so "/" can return to it. */
const LAST_SCOPE_KEY = 'truplexy.scope';

export function rememberScope(s: Scope) {
  try {
    localStorage.setItem(LAST_SCOPE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function lastScope(): Scope | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_SCOPE_KEY) ?? 'null');
    return v && typeof v.tenant === 'string' && typeof v.bot === 'string' ? v : null;
  } catch {
    return null;
  }
}

export const scopePath = (s: Scope, path = 'overview') => `/t/${s.tenant}/${s.bot}/${path}`.replace(/\/$/, '');

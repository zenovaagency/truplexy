import type { Scope } from '@/lib/api/client';

/**
 * React Query keys. Business-wide records are keyed by tenant, bot records
 * by tenant and bot, so switching bots never shows another bot's data and
 * a live event can invalidate exactly one resource.
 */
export const qk = {
  me: ['me'] as const,
  health: ['health'] as const,
  businessTypes: ['business-types'] as const,
  plans: ['plans'] as const,

  tenant: (s: Scope, ...parts: unknown[]) => ['tenant', s.tenant, ...parts] as const,
  bot: (s: Scope, ...parts: unknown[]) => ['bot', s.tenant, s.bot, ...parts] as const,
  platform: (...parts: unknown[]) => ['platform', ...parts] as const,
};

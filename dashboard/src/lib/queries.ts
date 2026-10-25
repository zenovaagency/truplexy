import type { LimitableRole, QueryCategory, QueryEvent, QueryStatus, QueryType } from '@/lib/api/types';
import type { Tone } from '@/components/ui';

/* Queries (API_REFERENCE.md → "Queries (2026-10-25)"). */

export const CATEGORY: Record<QueryCategory, { label: string; tone: Tone; hint: string }> = {
  open: { label: 'Open', tone: 'accent', hint: 'The team has to act.' },
  pending: { label: 'Waiting', tone: 'warn', hint: 'Waiting on the customer or someone else.' },
  done: { label: 'Done', tone: 'live', hint: 'Closed.' },
};

export const LIMITABLE_ROLES: { value: LimitableRole; label: string }[] = [
  { value: 'editor', label: 'Editors' },
  { value: 'agent', label: 'Agents' },
  { value: 'viewer', label: 'Viewers' },
];

/** The statuses a new type starts with, as the API's default. */
export const DEFAULT_STATUSES: QueryStatus[] = [
  { key: 'new', label: 'New', category: 'open' },
  { key: 'in_progress', label: 'In progress', category: 'open' },
  { key: 'waiting_customer', label: 'Waiting on customer', category: 'pending' },
  { key: 'resolved', label: 'Resolved', category: 'done' },
  { key: 'rejected', label: 'Rejected', category: 'done' },
];

/** What's wrong with a list of statuses, as the API checks it. */
export function statusesProblem(statuses: QueryStatus[]): string | undefined {
  if (statuses.length < 2 || statuses.length > 12) return 'Give the type 2–12 statuses.';
  const keys = new Set<string>();
  for (const s of statuses) {
    if (!s.label.trim()) return 'Give every status a name.';
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(s.key)) return `“${s.label}” needs a key of lowercase letters, digits or _.`;
    if (keys.has(s.key)) return `“${s.label}” is listed twice.`;
    keys.add(s.key);
  }
  if (!statuses.some((s) => s.category === 'open') || !statuses.some((s) => s.category === 'done')) return 'Keep at least one open status and one done status.';
  return undefined;
}

export const statusOf = (t: QueryType | undefined, key: string) => t?.statuses.find((s) => s.key === key);

/** Who can see a type, in words. */
export function audience(t: QueryType): string {
  if (!t.visible_roles.length) return 'Everyone';
  return ['Owners', 'admins', ...t.visible_roles.map((r) => `${r}s`)].join(', ').replace(/, ([^,]*)$/, ' and $1');
}

/** One line of a query's history, without who or when. */
export function eventLine(e: QueryEvent, t: QueryType | undefined, names: Record<string, string>): string {
  const label = (k?: string) => (k ? (statusOf(t, k)?.label ?? k) : '');
  switch (e.kind) {
    case 'created':
      return `opened it as ${label(e.to)}`;
    case 'status':
      return `moved it from ${label(e.from)} to ${label(e.to)}`;
    case 'assigned':
      return e.to ? `assigned it to ${names[e.to] ?? 'a member'}` : 'unassigned it';
    case 'fields':
      return `changed ${e.to?.split(',').join(', ')}`;
    case 'note':
      return 'added a note';
  }
}

/** Who did it, in words. */
export const actorName = (e: QueryEvent) => (e.actor_type === 'assistant' ? 'The assistant' : e.actor_type === 'key' ? 'An API key' : e.actor_name || 'Someone');

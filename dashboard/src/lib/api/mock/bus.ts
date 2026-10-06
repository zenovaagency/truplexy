import type { LiveEvent } from '@/lib/realtime';

/** In-browser stand-in for Supabase Realtime Broadcast in mock mode. */
type Listener = (e: LiveEvent) => void;
const topics = new Map<string, Set<Listener>>();

export const topicFor = (tenant: string, bot: string) => `mock:${tenant}:${bot}`;

export function emit(tenant: string, bot: string, event: string, data: Record<string, unknown>) {
  const payload = { id: `evt_${crypto.randomUUID().replace(/-/g, '')}`, type: event, created_at: new Date().toISOString(), data };
  // Deliver after the response, like a real broadcast arriving a moment later.
  setTimeout(() => topics.get(topicFor(tenant, bot))?.forEach((l) => l({ event, payload })), 250);
}

export function subscribe(topic: string, l: Listener) {
  if (!topics.has(topic)) topics.set(topic, new Set());
  topics.get(topic)!.add(l);
  return () => topics.get(topic)?.delete(l);
}

export const activeTopics = () => [...topics.entries()].filter(([, s]) => s.size > 0).map(([t]) => t);

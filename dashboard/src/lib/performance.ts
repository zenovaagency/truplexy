import { useSyncExternalStore } from 'react';
import { isApiError } from '@/lib/api/client';
import type { PerformanceDay, PerformanceStats, StagePerformance } from '@/lib/api/types';

/**
 * Rates colour only past these, compared on the raw fraction. The page also says "High" in words, so
 * colour is never the only signal. 4xx is mostly client mistakes, so the business page tolerates more
 * of it than the platform page tolerates of 5xx.
 */
export const ERROR_RATE_WARN = 0.05;
export const SERVER_ERROR_RATE_WARN = 0.01;

/** `other` over this share of reply time earns a note: older replies carry no prepare/quota/postprocess timings. */
export const OTHER_SHARE_NOTE = 1 / 3;

export const isHigh = (rate: number | null | undefined, limit: number) => rate != null && Number.isFinite(rate) && rate >= limit;

/** "412 ms" under a second, "1.2 s" above. */
export function formatLatency(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Stage names as the API sends them, in words. */
export const STAGE_LABEL: Record<string, string> = {
  prepare: 'Prepare',
  quota: 'Quota',
  retrieval: 'Retrieval',
  web_search: 'Web search',
  llm: 'Model',
  postprocess: 'Post-processing',
  other: 'Other / not itemised',
  rewrite: 'Rewrite',
  embed: 'Embed',
  dense: 'Dense search',
  lexical: 'Lexical search',
  load: 'Load passages',
  rerank: 'Rerank',
};

/** One line per stage, from the API reference's wording. */
export const STAGE_HELP: Record<string, string> = {
  prepare: 'Validating the request and the database reads before the reply starts.',
  quota: "Reserving the reply's place in the plan.",
  retrieval: "Searching the knowledge base. See the breakdown below.",
  web_search: 'Looking up web results, for replies that used them.',
  llm: "The model's time. A repaired reply's second model call is counted here and in post-processing.",
  postprocess: "Everything after the model's first reply: a web retry, checking and repairing the draft, citations.",
  other: 'Time no stage accounts for. Replies recorded before stage timings existed show all of their prepare, quota and post-processing time here.',
  rewrite: 'Rewriting the question for search.',
  embed: 'Turning the question into a vector.',
  dense: 'Meaning-based search. Runs together with lexical search.',
  lexical: 'Keyword search. Runs together with dense search.',
  load: 'Loading the passages found.',
  rerank: 'Ordering the passages by relevance.',
};

export const stageLabel = (stage: string) => STAGE_LABEL[stage] ?? stage;

/** The `other` stage's share of reply time, or 0. */
export const otherShare = (stages: StagePerformance[]) => stages.find((s) => s.stage === 'other')?.share ?? 0;

/** Segments of the stacked bar: only stages with time to show; the API's order is kept. */
export const barStages = (stages: StagePerformance[]) => stages.filter((s) => s.share > 0);

/**
 * One chart row per day. A day with no requests has no latency, so its p95 is a gap (null), not a 0 ms
 * point; requests and errors stay at zero.
 */
export function chartDays(days: PerformanceDay[]) {
  return days.map((d) => ({ ...d, p95: d.requests > 0 ? d.p95_ms : null }));
}

/** Every request, reply and model number is zero because nothing happened, not because nothing was kept. */
export const hasActivity = (s: PerformanceStats) => s.requests.total > 0 || s.pipeline.replies > 0;

/** The share of requests stored, as "25%"; null when everything is. */
export function sampleNote(rate: number): string | null {
  if (!(rate > 0) || rate >= 1) return null;
  const pct = rate * 100;
  return `${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`;
}

/** Rate rows of a count map, largest first: cache hits by kind, degraded stages, confidence. */
export const countRows = (counts: Record<string, number> | undefined) =>
  Object.entries(counts ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

/* ------------------------------------------------------------------ */
/* Is the endpoint there?                                              */
/* ------------------------------------------------------------------ */

/**
 * A server that predates the stats answers 404 NOT_FOUND. That is "not available here", not a failure:
 * the page learns it on first open and then drops out of the menu, with no toast.
 */
type Where = 'platform';
const missing = new Set<Where>();
const listeners = new Set<() => void>();
let snapshot = '';

const publish = () => {
  snapshot = [...missing].sort().join(',');
  listeners.forEach((l) => l());
};

export const isRouteMissing = (e: unknown) => isApiError(e) && e.status === 404 && e.code === 'NOT_FOUND';

export function markPerformance(where: Where, available: boolean) {
  if (available ? !missing.delete(where) : missing.has(where)) return;
  if (!available) missing.add(where);
  publish();
}

/** Tests start from a clean slate. */
export function resetPerformanceAvailability() {
  missing.clear();
  publish();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** True once this server has answered 404 for the page's endpoint. */
export function usePerformanceMissing(where: Where) {
  const s = useSyncExternalStore(subscribe, () => snapshot, () => '');
  return s.split(',').includes(where);
}

/** Runs the request and notes whether the server has the endpoint, passing the result or error on. */
export async function trackAvailability<T>(where: Where, run: () => Promise<T>): Promise<T> {
  try {
    const result = await run();
    markPerformance(where, true);
    return result;
  } catch (e) {
    if (isRouteMissing(e)) markPerformance(where, false);
    throw e;
  }
}

/** Menu entries (sidebar, shortcuts, command palette) drop the Performance page once its endpoint is known to be missing. */
export function usePerformanceNav() {
  const platform = usePerformanceMissing('platform');
  return (item: { needs?: 'platform' }) => !(item.needs === 'platform' && platform);
}

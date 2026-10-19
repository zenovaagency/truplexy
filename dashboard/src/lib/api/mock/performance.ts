import type { LatencyStats, PerformanceStats, RoutePerformance, StagePerformance } from '@/lib/api/types';
import { hashString, rng } from './fixtures';

/**
 * A stand-in for GET /stats/performance and GET /platform/performance (the contract in API_REFERENCE.md,
 * "Performance stats (2026-10-19)"). Which situation it plays is `localStorage 'truplexy.mock.performance'`:
 *
 *   on (default)  everything recorded
 *   off           the routes answer 404, as a server that predates them does
 *   no_http       request statistics are off: requests, latency and by_route are all zero
 *   sampled       a 25% sample is stored
 *   no_models     model calls aren't stored, so models is empty
 *   old           the range starts before stage timings: most reply time is "other"
 *   empty         no requests and no replies
 *   noreplies     requests but no replies: every stage ran for 0 replies
 *   high          a high error rate
 */
export type PerformanceMode = 'on' | 'off' | 'no_http' | 'sampled' | 'no_models' | 'old' | 'empty' | 'noreplies' | 'high';

const MODES: PerformanceMode[] = ['on', 'off', 'no_http', 'sampled', 'no_models', 'old', 'empty', 'noreplies', 'high'];

export function performanceMode(): PerformanceMode {
  try {
    const v = localStorage.getItem('truplexy.mock.performance') as PerformanceMode | null;
    if (v && MODES.includes(v)) return v;
  } catch {
    /* no storage: the default */
  }
  return 'on';
}

const ZERO: LatencyStats = { count: 0, avg_ms: 0, p50_ms: 0, p95_ms: 0, p99_ms: 0, max_ms: 0 };

/** A latency summary around `base` ms; the shape of nearest-rank percentiles, not a real distribution. */
function latency(r: () => number, count: number, base: number): LatencyStats {
  if (count <= 0) return ZERO;
  const p50 = Math.round(base * (0.85 + r() * 0.3));
  const p95 = Math.round(p50 * (2.2 + r() * 1.2));
  const p99 = Math.round(p95 * (1.3 + r() * 0.5));
  return { count, avg_ms: +(p50 * (1.15 + r() * 0.2)).toFixed(1), p50_ms: p50, p95_ms: p95, p99_ms: p99, max_ms: Math.round(p99 * (1.4 + r())) };
}

const ROUTES: [string, string, number, number][] = [
  ['POST', '/conversations/{id}/messages', 0.34, 2400],
  ['GET', '/conversations/{id}/messages', 0.2, 60],
  ['POST', '/conversations', 0.1, 45],
  ['GET', '/profile', 0.08, 12],
  ['GET', '/stats/support', 0.05, 220],
  ['GET', '/tickets', 0.05, 90],
  ['GET', '/tickets/{id}', 0.04, 70],
  ['GET', '/usage/summary', 0.03, 180],
  ['POST', '/playground/run', 0.03, 2600],
  ['GET', '/knowledge/documents', 0.02, 85],
  ['PATCH', '/tickets/{id}', 0.02, 95],
  ['GET', '/me', 0.02, 30],
  ['POST', '/knowledge/search', 0.02, 640],
  ['GET', '/tenant', 0.01, 40],
  ['GET', '/bots', 0.01, 35],
];

const STAGES: [string, number, number][] = [
  // stage, share of the busiest reply's time, base ms
  ['prepare', 0.04, 55],
  ['quota', 0.02, 25],
  ['retrieval', 0.2, 430],
  ['web_search', 0.06, 900],
  ['llm', 0.56, 1500],
  ['postprocess', 0.1, 260],
  ['other', 0.02, 40],
];

const RETRIEVAL: [string, number, number][] = [
  ['rewrite', 0.42, 320],
  ['embed', 0.97, 70],
  ['dense', 0.95, 110],
  ['lexical', 0.95, 85],
  ['load', 0.95, 35],
  ['rerank', 0.7, 150],
];

export interface PerformanceInput {
  from: string;
  to: string;
  scope: PerformanceStats['scope'];
  /** Replies per day in the range. */
  days: { date: string; replies: number }[];
  /** Platform scope: businesses and their replies. */
  tenants?: { tenant_id: string; name: string; replies: number }[];
  mode: PerformanceMode;
}

const RPR = 7; // HTTP requests per reply: the widget polls, loads history, and so on

export function buildPerformance(input: PerformanceInput): PerformanceStats {
  const { mode, scope } = input;
  const r = rng(hashString(`${input.from}${input.to}${scope}${mode}`));
  const empty = mode === 'empty';
  const http = mode !== 'no_http';
  const sampleRate = mode === 'sampled' ? 0.25 : 1;
  const days = input.days.map((d) => ({ date: d.date, replies: empty ? 0 : mode === 'noreplies' ? 0 : d.replies }));
  const replies = days.reduce((n, d) => n + d.replies, 0);
  const requestsOf = (d: { replies: number }) => (empty ? 0 : Math.round(Math.max(d.replies, mode === 'noreplies' ? 40 : 0) * RPR * (0.9 + r() * 0.2)));
  const errorRate = mode === 'high' ? 0.11 : 0.013 + r() * 0.01;
  const serverRate = mode === 'high' ? 0.034 : 0.0019 + r() * 0.002;

  const byDay = days.map((d) => {
    const requests = http ? requestsOf(d) : 0;
    // A day with no requests has no latency.
    const p50 = requests ? Math.round(55 + r() * 40) : 0;
    return {
      date: d.date,
      requests,
      errors: Math.round(requests * errorRate),
      server_errors: Math.round(requests * serverRate),
      p50_ms: p50,
      p95_ms: requests ? Math.round(p50 * (6 + r() * 6)) : 0,
    };
  });
  const total = byDay.reduce((n, d) => n + d.requests, 0);
  const errors = byDay.reduce((n, d) => n + d.errors, 0);
  const serverErrors = byDay.reduce((n, d) => n + d.server_errors, 0);

  const byRoute: RoutePerformance[] = http && total
    ? ROUTES.map(([method, route, share, base]) => {
        const requests = Math.round(total * share);
        const e = Math.round(requests * errorRate * (method === 'POST' ? 1.4 : 0.7));
        const l = latency(r, Math.max(1, Math.round(requests * sampleRate)), base);
        return { method, route, requests, errors: e, server_errors: Math.round(e * 0.15), error_rate: requests ? e / requests : 0, ...l };
      })
    : [];

  const pipelineCount = replies;
  const otherBoost = mode === 'old' ? 0.5 : 0;
  const stages: StagePerformance[] = STAGES.map(([stage, share, base]) => {
    const ran = replies === 0 ? 0 : stage === 'web_search' ? Math.round(replies * 0.06) : stage === 'other' ? replies : Math.round(replies * (stage === 'retrieval' ? 0.78 : 1));
    const old = mode === 'old' && (stage === 'prepare' || stage === 'quota' || stage === 'postprocess');
    return {
      stage,
      ran: old ? 0 : ran,
      share: replies === 0 ? 0 : old ? 0 : stage === 'other' ? share + otherBoost : share * (1 - otherBoost),
      ...(old ? ZERO : latency(r, ran, stage === 'other' && mode === 'old' ? base * 18 : base)),
    };
  });
  const retrievalStages: StagePerformance[] = RETRIEVAL.map(([stage, rate, base]) => {
    const ran = replies === 0 ? 0 : Math.round(replies * 0.78 * rate);
    return { stage, ran, share: replies === 0 ? 0 : +(rate * 0.12).toFixed(3), ...latency(r, ran, base) };
  });

  const models = mode === 'no_models' || replies === 0
    ? []
    : [
        ['google/gemini-3.1-flash-lite', 0.78, 1100, 0.006],
        ['openai/gpt-5-mini', 0.16, 1900, 0.014],
        ['anthropic/claude-haiku-4.5', 0.06, 1500, 0.031],
      ].map(([model, share, base, fail]) => {
        const attempts = Math.round(replies * (share as number) * 1.04);
        const failures = Math.round(attempts * (fail as number));
        return { model: model as string, attempts, failures, failure_rate: attempts ? failures / attempts : 0, ...latency(r, attempts, base as number) };
      });

  const none = replies === 0;
  const answered = none ? 0 : 0.84 + r() * 0.04;
  const out: PerformanceStats = {
    from: input.from,
    to: input.to,
    scope,
    recording: { http, sample_rate: sampleRate, model_attempts: mode !== 'no_models' },
    requests: {
      total: http ? total : 0,
      errors: http ? errors : 0,
      server_errors: http ? serverErrors : 0,
      error_rate: http && total ? errors / total : 0,
      server_error_rate: http && total ? serverErrors / total : 0,
      by_status: http && total ? { '2xx': total - errors, '3xx': 0, '4xx': errors - serverErrors, '5xx': serverErrors } : {},
      by_route: byRoute,
      by_day: byDay,
    },
    latency: http && total ? latency(r, Math.round(total * sampleRate), 90) : ZERO,
    pipeline: { replies: pipelineCount, total: latency(r, replies, 2600), stages, retrieval_stages: retrievalStages },
    rag: {
      replies,
      answered_rate: answered,
      no_answer_rate: none ? 0 : 0.05 + r() * 0.03,
      clarification_rate: none ? 0 : 0.04 + r() * 0.02,
      handoff_rate: none ? 0 : 0.06 + r() * 0.03,
      empty_retrieval_rate: none ? 0 : 0.04 + r() * 0.02,
      cache_hit_rate: none ? 0 : 0.22 + r() * 0.08,
      cache_hits: none ? {} : { semantic: Math.round(replies * 0.17), retrieval: Math.round(replies * 0.07) },
      rewrite_rate: none ? 0 : 0.4 + r() * 0.08,
      degraded_rate: none ? 0 : 0.004,
      degraded: none ? {} : { rerank: Math.max(1, Math.round(replies * 0.003)), web_search: Math.max(1, Math.round(replies * 0.001)) },
      confidence: none ? {} : { high: Math.round(replies * 0.7), low: Math.round(replies * 0.16), none: Math.round(replies * 0.06), unknown: Math.round(replies * 0.08) },
      web_search_rate: none ? 0 : 0.06,
      split_rate: none ? 0 : 0.03,
      avg_candidates: none ? 0 : 38.2,
      avg_passages: none ? 0 : 5.4,
      avg_top_score: none ? 0 : 0.731,
      retrieval: latency(r, none ? 0 : Math.round(replies * 0.78), 430),
    },
    models,
  };
  if (scope === 'platform' && input.tenants) {
    out.tenants = [...input.tenants]
      .sort((a, b) => b.replies - a.replies)
      .slice(0, 20)
      .map((t) => {
        const requests = http && !empty ? Math.round(t.replies * RPR * (0.9 + r() * 0.2)) : 0;
        const server = Math.round(requests * serverRate * (0.4 + r() * 2));
        return { tenant_id: t.tenant_id, name: t.name, requests, server_errors: server, server_error_rate: requests ? server / requests : 0 };
      });
  }
  return out;
}

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { PerformanceStats, SupportStats, UsageSummary } from '@/lib/api/types';
import { trackAvailability } from '@/lib/performance';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

export interface Range {
  from: string;
  to: string;
}

export function useUsageSummary(range: Range, opts: { enabled?: boolean } = {}) {
  const scope = useScope();
  return useQuery({
    enabled: opts.enabled ?? true,
    queryKey: qk.bot(scope, 'usage', range),
    queryFn: ({ signal }) => api<UsageSummary>('/usage/summary', { scope, signal, query: { ...range } }),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useSupportStats(range: Range, statsScope: 'bot' | 'business') {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'support-stats', range, statsScope),
    queryFn: ({ signal }) => api<SupportStats>('/stats/support', { scope, signal, query: { ...range, scope: statsScope } }),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

/** Requests, latency, where a reply's time goes and retrieval quality. A 404 means this server predates it. */
export function usePerformance(range: Range, statsScope: 'bot' | 'business') {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'performance', range, statsScope),
    queryFn: ({ signal }) =>
      trackAvailability('business', () => api<PerformanceStats>('/stats/performance', { scope, signal, query: { ...range, scope: statsScope } })),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

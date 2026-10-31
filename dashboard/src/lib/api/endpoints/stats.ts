import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { SupportStats, UsageSummary } from '@/lib/api/types';
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

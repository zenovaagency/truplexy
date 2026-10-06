import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { PlaygroundConversation, PlaygroundRunInput, PlaygroundRunResult } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

export function useCurrentPlayground() {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'playground'),
    queryFn: ({ signal }) =>
      api<{ conversation: PlaygroundConversation | null }>('/playground/conversations/current', { scope, signal }).then((r) => r.conversation),
    staleTime: Infinity,
  });
}

export function useNewPlayground() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<PlaygroundConversation>('/playground/conversations', { method: 'POST', scope }),
    onSuccess: (c) => qc.setQueryData(qk.bot(scope, 'playground'), c),
  });
}

/** No streaming: the caller shows a pending state and may abort. Tokens may still be spent after a cancel. */
export function useRunPlayground() {
  const scope = useScope();
  return useMutation({
    mutationFn: ({ input, signal }: { input: PlaygroundRunInput; signal?: AbortSignal }) =>
      api<PlaygroundRunResult>('/playground/run', { method: 'POST', body: input, scope, signal }),
    // The page shows run errors inline, and a cancel isn't an error.
    meta: { silent: true },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isApiError, type Scope } from '@/lib/api/client';
import type { AttachmentConfig, AttachmentRegistration, AttachmentUpload, PlaygroundConversation, PlaygroundRunInput, PlaygroundRunResult } from '@/lib/api/types';
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

/** The config, or, from an API that predates image input, `{ enabled: false, unavailable: true }`. */
export type AttachmentConfigResult = AttachmentConfig & { unavailable?: true };

/**
 * Image input (planned): whether the composer may offer pictures, and the limits.
 * An API that predates the feature answers 404 NOT_FOUND, which is not an error
 * to show: it resolves to `{ enabled: false }`, as if the feature were off.
 * `unavailable` tells that apart from a server that has the feature but turned it off.
 */
export async function getPlaygroundAttachmentConfig(scope: Scope, signal?: AbortSignal): Promise<AttachmentConfigResult> {
  try {
    return await api<AttachmentConfig>('/playground/attachments/config', { scope, signal });
  } catch (e) {
    if (isApiError(e) && e.status === 404 && (e.code === 'NOT_FOUND' || e.code === 'HTTP_404')) return { enabled: false, unavailable: true };
    throw e;
  }
}

/** Registers one picture and returns the presigned R2 URL to `PUT` it to. */
export const createPlaygroundAttachment = (scope: Scope, body: AttachmentRegistration, signal?: AbortSignal) =>
  api<AttachmentUpload>('/playground/attachments', { method: 'POST', body, scope, signal });

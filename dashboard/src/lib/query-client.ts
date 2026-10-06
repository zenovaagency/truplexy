import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api/client';
import { notifyError, notifySuccess } from '@/lib/notify';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { silent?: boolean };
    mutationMeta: {
      /** Never toast this mutation's errors; the caller shows them. */
      silent?: boolean;
      /** Error codes the caller handles itself. */
      silentCodes?: string[];
      /** Toast shown on success. */
      success?: string;
    };
  }
}

/** Client errors won't change on retry; network and server errors might. */
function retry(count: number, e: unknown) {
  if (isApiError(e) && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) return false;
  return count < 2;
}

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (e, q) => {
        // Background refetch failures of data already on screen stay quiet.
        if (q.meta?.silent || q.state.data !== undefined) return;
        if (isApiError(e) && (e.status === 403 || e.status === 404)) return; // pages render these inline
        notifyError(e);
      },
    }),
    mutationCache: new MutationCache({
      onError: (e, _v, _c, m) => {
        if (m.meta?.silent) return;
        if (isApiError(e) && m.meta?.silentCodes?.includes(e.code)) return;
        notifyError(e);
      },
      onSuccess: (_d, _v, _c, m) => {
        if (m.meta?.success) notifySuccess(m.meta.success);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        retry,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

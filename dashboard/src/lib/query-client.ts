import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { hasCode, isApiError } from '@/lib/api/client';
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

/** Errors the app answers itself: a disabled account signs out, a lost business redirects. Both notify once. */
const handledElsewhere = (e: unknown) => hasCode(e, 'ACCOUNT_DISABLED', 'TENANT_NOT_FOUND', 'BOT_NOT_FOUND');

/**
 * Client errors won't change on retry; network and server errors might. A rate
 * limit is tried once more, after the wait the API asks for, and not at all if
 * that wait is long: retrying sooner only extends it.
 */
function retry(count: number, e: unknown) {
  if (isApiError(e) && e.code === 'RATE_LIMITED') return count < 1 && (e.retryAfter ?? 5) <= 15;
  if (isApiError(e) && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) return false;
  return count < 2;
}

function retryDelay(count: number, e: unknown) {
  if (isApiError(e) && e.retryAfter) return Math.min(e.retryAfter, 30) * 1000;
  return Math.min(1000 * 2 ** count, 30_000);
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
        if (m.meta?.silent || handledElsewhere(e)) return;
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
        retryDelay,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

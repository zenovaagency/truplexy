import type { ChatError, Transport } from './types';

export class TruplexyRequestError extends Error implements ChatError {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'TruplexyRequestError';
  }
}

export interface FetchTransportOptions {
  /** Your server route. Default `/api/truplexy`. */
  endpoint?: string;
  /** Extra headers, such as a CSRF token your server checks. */
  headers?: Record<string, string>;
  /** Abort a request after this many milliseconds. Default 60 000 (replies can take up to 45 s). */
  timeout?: number;
  fetch?: typeof fetch;
}

export const DEFAULT_ENDPOINT = '/api/truplexy';

/** Posts `{action, …body}` as JSON to your server route. */
export function fetchTransport(options: FetchTransportOptions = {}): Transport {
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  return {
    async request(action, body) {
      const doFetch = options.fetch ?? fetch;
      const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
      const timer = controller && setTimeout(() => controller.abort(), options.timeout ?? 60_000);
      let res: Response;
      try {
        res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...options.headers },
          body: JSON.stringify({ action, ...body }),
          signal: controller?.signal,
        });
      } catch {
        throw new TruplexyRequestError('NETWORK', "Couldn't reach the chat. Check your connection.");
      } finally {
        clearTimeout(timer);
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        const e = data?.error;
        throw new TruplexyRequestError(e?.code ?? 'HTTP_' + res.status, e?.message ?? 'Something went wrong. Please try again.', res.status, e?.request_id);
      }
      return data;
    },
  };
}

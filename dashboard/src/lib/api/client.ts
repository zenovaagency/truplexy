import { env } from '@/lib/env';
import type { ApiErrorBody, Limits } from './types';

/** The business and bot an endpoint acts on, sent as X-Truplexy-* headers. */
export interface Scope {
  tenant: string;
  bot: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly documentId?: string;
  readonly limit?: keyof Limits;

  constructor(init: { code: string; message: string; status: number; requestId?: string; documentId?: string; limit?: keyof Limits }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
    this.documentId = init.documentId;
    this.limit = init.limit;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

export const hasCode = (e: unknown, ...codes: string[]) => isApiError(e) && codes.includes(e.code);

/* ------------------------------------------------------------------ */
/* Pluggable pieces: the auth layer supplies tokens, mock mode swaps   */
/* the transport. Both are set once at boot.                           */
/* ------------------------------------------------------------------ */

type Transport = (req: Request) => Promise<Response>;
type TokenProvider = (opts?: { refresh?: boolean }) => Promise<string | null>;

let transport: Transport = (req) => fetch(req);
let getToken: TokenProvider = async () => null;
let onUnauthorized: () => void = () => {};

export function configureApi(opts: { transport?: Transport; getToken?: TokenProvider; onUnauthorized?: () => void }) {
  if (opts.transport) transport = opts.transport;
  if (opts.getToken) getToken = opts.getToken;
  if (opts.onUnauthorized) onUnauthorized = opts.onUnauthorized;
}

/* ------------------------------------------------------------------ */

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  scope?: Scope;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return `${env.apiBaseUrl}${path}${s ? `?${s}` : ''}`;
}

async function send(path: string, opts: RequestOptions, token: string | null) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
  if (opts.scope) {
    headers.set('X-Truplexy-Tenant', opts.scope.tenant);
    headers.set('X-Truplexy-Bot', opts.scope.bot);
  }
  const req = new Request(buildUrl(path, opts.query), {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  try {
    return await transport(req);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError({ code: 'NETWORK_ERROR', message: "Couldn't reach the Truplexy API. Check your connection.", status: 0 });
  }
}

/**
 * Calls the API. Resolves with the parsed body (undefined for 204) or
 * rejects with an ApiError carrying the API's `code` and request ID.
 * A 401 refreshes the session once and retries before giving up.
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(path, opts, await getToken());
  if (res.status === 401) {
    const fresh = await getToken({ refresh: true });
    if (fresh) res = await send(path, opts, fresh);
  }

  if (res.status === 204) return undefined as T;

  const requestId = res.headers.get('X-Request-ID') ?? undefined;
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    if (res.status === 401) onUnauthorized();
    throw new ApiError({
      code: err?.code ?? `HTTP_${res.status}`,
      message: err?.message ?? `The API answered ${res.status}.`,
      status: res.status,
      requestId: err?.request_id ?? requestId,
      documentId: err?.document_id,
      limit: err?.limit,
    });
  }
  return body as T;
}

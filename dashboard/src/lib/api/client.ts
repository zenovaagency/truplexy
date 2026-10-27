import { env } from '@/lib/env';
import type { ApiErrorBody, LimitName } from './types';

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
  /** ALREADY_COVERED: the draft waiting for review that covers the ticket. */
  readonly suggestionId?: string;
  readonly limit?: LimitName;
  /** SOLE_OWNER: the businesses the person is the only owner of. */
  readonly tenants?: { id: string; name: string }[];
  /** Seconds the API asks the caller to wait (Retry-After): rate limits and busy checkouts. */
  readonly retryAfter?: number;

  constructor(init: {
    code: string;
    message: string;
    status: number;
    requestId?: string;
    documentId?: string;
    suggestionId?: string;
    limit?: LimitName;
    tenants?: { id: string; name: string }[];
    retryAfter?: number;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
    this.documentId = init.documentId;
    this.suggestionId = init.suggestionId;
    this.limit = init.limit;
    this.tenants = init.tenants;
    this.retryAfter = init.retryAfter;
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
/** Why the session ended: it expired, or a platform admin disabled the account. */
export type SignOutReason = 'expired' | 'disabled';
type UnauthorizedHandler = (reason: SignOutReason) => void;

let transport: Transport = (req) => fetch(req);
let getToken: TokenProvider = async () => null;
let onUnauthorized: UnauthorizedHandler = () => {};

export function configureApi(opts: { transport?: Transport; getToken?: TokenProvider; onUnauthorized?: UnauthorizedHandler }) {
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
  /** Extra request headers, such as Idempotency-Key. */
  headers?: Record<string, string>;
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
  for (const [name, value] of Object.entries(opts.headers ?? {})) headers.set(name, value);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // Files go as they are; the browser sets the multipart boundary itself.
  const raw = opts.body instanceof Blob || opts.body instanceof FormData;
  if (opts.body !== undefined && !raw) headers.set('Content-Type', 'application/json');
  if (opts.scope) {
    headers.set('X-Truplexy-Tenant', opts.scope.tenant);
    headers.set('X-Truplexy-Bot', opts.scope.bot);
  }
  const req = new Request(buildUrl(path, opts.query), {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body === undefined ? undefined : raw ? (opts.body as Blob | FormData) : JSON.stringify(opts.body),
    signal: opts.signal,
  });
  try {
    return await transport(req);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError({ code: 'NETWORK_ERROR', message: "Couldn't reach the Truplexy API. Check your connection.", status: 0 });
  }
}

/** Retry-After in whole seconds (it can also be a date, which the API doesn't send). */
function parseRetryAfter(value: string | null) {
  const n = value === null ? NaN : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : undefined;
}

/**
 * Calls the API. Resolves with the parsed body (undefined for 204) or
 * rejects with an ApiError carrying the API's `code` and request ID.
 * A 401 refreshes the session once and retries before giving up; a lasting
 * 401, or a disabled account, signs the person out.
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
    if (res.status === 401) onUnauthorized('expired');
    else if (res.status === 403 && err?.code === 'ACCOUNT_DISABLED') onUnauthorized('disabled');
    throw new ApiError({
      code: err?.code ?? `HTTP_${res.status}`,
      message: err?.message ?? `The API answered ${res.status}.`,
      status: res.status,
      requestId: err?.request_id ?? requestId,
      documentId: err?.document_id,
      suggestionId: err?.suggestion_id,
      limit: err?.limit,
      tenants: err?.tenants,
      retryAfter: parseRetryAfter(res.headers.get('Retry-After')),
    });
  }
  return body as T;
}

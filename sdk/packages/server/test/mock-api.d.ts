// The playground's pretend API is plain JavaScript; this is the part the tests use.
declare module '*/playground/mock-api.mjs' {
  export interface MockApiOptions {
    latency?: number;
    replyLatency?: number;
    autoAgent?: boolean;
    /** Image input (planned): false (default) like the API today, true enabled, 'plan' or 'no_vision' for the two ways it can be off. */
    images?: boolean | 'plan' | 'no_vision';
  }
  export function mockApi(base: string, options?: MockApiOptions): (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

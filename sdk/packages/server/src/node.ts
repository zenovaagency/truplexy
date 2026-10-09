import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHandler, type Handler, type HandlerOptions } from './handler';

type NodeRequest = IncomingMessage & { body?: unknown; originalUrl?: string; protocol?: string };

/**
 * Wraps the Fetch-API handler for Node's `(req, res)` servers: Express,
 * Fastify (via `reply.raw`), Koa (`ctx.req`, `ctx.res`), the Next.js Pages
 * Router and Angular SSR. Works whether or not a body parser ran first.
 *
 * ```js
 * import { createNodeHandler } from "@truplexy/server/node";
 * app.post("/api/truplexy", createNodeHandler());
 * ```
 */
export function toNodeHandler(handler: Handler) {
  return async function truplexy(req: NodeRequest, res: ServerResponse): Promise<void> {
    const host = req.headers.host ?? 'localhost';
    const protocol = req.protocol ?? ((req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http');
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
    }
    let body: string | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      if (typeof req.body === 'string') body = req.body;
      else if (req.body instanceof Uint8Array) body = new TextDecoder().decode(req.body);
      else if (req.body && typeof req.body === 'object') body = JSON.stringify(req.body);
      else body = await readStream(req);
      headers.delete('content-length');
    }

    const response = await handler(new Request(`${protocol}://${host}${req.originalUrl ?? req.url ?? '/'}`, { method: req.method, headers, body }));
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(await response.text());
  };
}

/** `toNodeHandler(createHandler(options))`. */
export const createNodeHandler = (options?: HandlerOptions) => toNodeHandler(createHandler(options));

function readStream(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      // Past the handler's limit: stop buffering; the handler answers 413.
      if (size <= 64 * 1024) chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export { createHandler, type Handler, type HandlerOptions } from './handler';

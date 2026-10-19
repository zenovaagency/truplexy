# @truplexy/server

The typed customer chat API client and the server route the Truplexy chat widget talks to. It keeps your chat key on the server, gives each visitor a signed session (no database), and passes your team's replies to the widget live. It uses only `fetch` and Web Crypto, so it runs on Node 20+, Vercel, Netlify, Cloudflare Workers, Deno and Bun.

```bash
npm i @truplexy/server
```

Set `TRUPLEXY_CHAT_KEY` (from the Truplexy dashboard: Integrations → Website chat) in the server's environment.

## Typed API client

```ts
import { createChatClient } from "@truplexy/server";
const chat = createChatClient();
const customer = await chat.upsertCustomer({ contacts: [{ type: "app", value: "user-42" }] });
const conversation = await chat.createConversation({ customer_id: customer.id });
const result = await chat.sendMessage(conversation.id, "Hello");
```

The [customer chat API guide](https://github.com/zenovaagency/truplexy/blob/main/sdk/CHAT_API.md) documents every method, input and response type, errors, lifecycle controls, contact normalization, webhook delivery and realtime. `chatKey`, `apiBase` and `fetch` configure the client. `TruplexyApiError` preserves the HTTP status, code, request ID and additional error fields for server handling.

## Pictures (coming soon)

Image input isn't served by the API yet; `getAttachmentConfig()` returns `{ enabled: false }` until it is, and plain-text `sendMessage(id, text)` is unchanged. When it is live:

```ts
const chat = createChatClient();
if ((await chat.getAttachmentConfig()).enabled) {
  await chat.sendMessage(conversation.id, { text: "This error appears when I log in", images: [file] });
}
```

`images` takes a `File`, `Blob`, `ArrayBuffer` or bytes. The client hashes each, registers it, `PUT`s it to storage with exactly the returned headers and no chat key (retrying a network error or 5xx twice), then sends the message. `uploadImage()` returns the attachment ID, and `registerImage()` returns `{ attachmentId, url, headers }` for a browser widget to `PUT` itself. `signal` and `idempotencyKey` are options. Errors are `TruplexyApiError`s: match on `code` (`IMAGE_TOO_LARGE`, `UNSUPPORTED_IMAGE_TYPE`, `INVALID_IMAGE`, `ATTACHMENT_NOT_FOUND`, `ATTACHMENT_NOT_UPLOADED`, `UPLOAD_FAILED`), and `error.limit` is `image_input` for a plan without pictures. Everything is in [the guide](https://github.com/zenovaagency/truplexy/blob/main/sdk/CHAT_API.md#sending-pictures-coming-soon); runnable [examples](https://github.com/zenovaagency/truplexy/tree/main/sdk/examples) work against the mock API.

## One line per framework

```ts
// Next.js: app/api/truplexy/route.ts
import { createHandler } from "@truplexy/server";
export const POST = createHandler();
export const maxDuration = 60;
```

```ts
// SvelteKit: src/routes/api/truplexy/+server.ts
const truplexy = createHandler({ chatKey: TRUPLEXY_CHAT_KEY });
export const POST = ({ request }) => truplexy(request);
```

```ts
// Nuxt: server/api/truplexy.post.ts
const truplexy = createHandler({ chatKey: process.env.TRUPLEXY_CHAT_KEY });
export default defineEventHandler((event) => truplexy(toWebRequest(event)));
```

```js
// Express (and Fastify, Koa, the Next.js Pages Router)
import { createNodeHandler } from "@truplexy/server/node";
app.post("/api/truplexy", createNodeHandler());
```

The same pattern works for Remix / React Router (`action`), Astro (`POST: APIRoute`), Hono (`c.req.raw`), Cloudflare Workers and Vercel or Netlify functions. Every framework is covered in [the docs](https://truplexy.com/docs/web-sdk#route).

## Options

| Option | What it does | Default |
| --- | --- | --- |
| `chatKey` | The chat key | `TRUPLEXY_CHAT_KEY` |
| `sessionSecret` | Signs visitor sessions | `TRUPLEXY_SESSION_SECRET`, then the chat key |
| `sessionTtl` | Seconds a visitor keeps their conversation after their last message | 30 days |
| `channelId` | Start conversations on this channel instead of the key's | the key's channel |
| `allowedOrigins` | Sites allowed to call from another origin | same origin only |
| `keepTicketsOpen` | Stop the tickets the route opens from closing on their own after a quiet spell | close per the business's auto-close time |
| `authorize(request)` | Return `false` (403) or a `Response` to refuse: rate limits, sign-in | allow |
| `customer(request)` | Trusted `{contacts, name?, metadata?}` for a new chat; null/undefined falls back to the visitor form | none |
| `context(request)` | Private background for the assistant, sent once per conversation | none |
| `onError(error)` | Server-side failures, never with the key | `console.error` |
| `apiBase` | The Truplexy API | `TRUPLEXY_API_BASE`, then production |
| `fetch` | A custom fetch | global `fetch` |

```ts
export const POST = createHandler({
  authorize: (request) => rateLimit(request.headers.get("x-forwarded-for"), 20),
  customer: async (request) => {
    const user = await getUser(request);
    return user ? { name: user.name, contacts: [{ type: "app", value: String(user.id) }], metadata: { plan: user.plan } } : null;
  },
  context: async (request) => {
    const user = await getUser(request);
    return user && `Signed in as ${user.name}, ${user.plan} plan.`;
  },
});
```

Use `details="off"` when the server supplies identity. A non-null resolver result takes precedence over browser fields. Linking runs only for a new conversation; it does not relink an existing session. Customer errors stop creation, with one retry for `CUSTOMER_EXISTS`; background context and ticket creation remain best effort.

## What it guarantees

- Names allow 120 characters; the API accepts multiple contacts and metadata up to 4 KB.
- Realtime falls back only for `REALTIME_NOT_CONFIGURED`; channel/authentication errors are surfaced.
- The browser never sees the chat key, the bot's realtime topic or background context messages.
- API errors become fixed, safe messages such as `PLAN_LIMIT_REACHED` or `CHANNEL_DISABLED`, with the `request_id` kept for support.
- A tampered or expired session starts a new conversation instead of failing.

`signSession` and `verifySession` are exported for routes that need them elsewhere. The wire protocol is in [PROTOCOL.md](https://truplexy.com/docs/web-sdk#protocol).

MIT licensed.

# Truplexy website SDK

Add the Truplexy chat to any website: a ready-made widget, plus one small route on the site's server that holds the chat key. The full guide, with every framework, is at [zenovasolution.xyz/docs/web-sdk](https://zenovasolution.xyz/docs/web-sdk). The dashboard shows the same recipes under Integrations → Guides → Website chat.

```
<truplexy-chat> (browser) ──POST /api/truplexy──▶ your route (@truplexy/server) ──chat key──▶ Truplexy API
        ▲                                                                                   │
        └─────────────── team replies, live (Supabase Realtime) or by polling ◀─────────────┘
```

## Packages

| Package | For | Size |
| --- | --- | --- |
| [`@truplexy/web`](packages/web) | The `<truplexy-chat>` element, any framework or plain HTML, plus the headless `TruplexyClient`. No dependencies. CDN build: `dist/truplexy.min.js`. | ≈19 KB gzipped (incl. the inline wordmark) |
| [`@truplexy/react`](packages/react) | `<TruplexyChat>` and `useTruplexyChat()` for React 18/19, Next.js, Remix, Gatsby | wrapper |
| [`@truplexy/vue`](packages/vue) | `<TruplexyChat>`, `TruplexyPlugin` and `useTruplexyChat()` for Vue 3 and Nuxt | wrapper |
| [`@truplexy/server`](packages/server) | The route: a Fetch-API handler for Next.js, Nuxt, SvelteKit, Remix, Astro, Hono, Workers, Vercel/Netlify functions, and `createNodeHandler()` for Express | no deps |
| [`wordpress/truplexy-chat`](wordpress/truplexy-chat) | A WordPress/WooCommerce plugin: route, settings page and widget in one file | PHP 7.4+ |

Svelte, Angular, Astro, Solid, Qwik and anything else use the `<truplexy-chat>` element from `@truplexy/web` directly. A server in another language implements [PROTOCOL.md](PROTOCOL.md). The dashboard has tested Python, PHP and Go versions.

## Quick start (Next.js)

```bash
npm i @truplexy/server @truplexy/react
```

```ts
// app/api/truplexy/route.ts. TRUPLEXY_CHAT_KEY is in .env.local
import { createHandler } from "@truplexy/server";
export const POST = createHandler();
export const maxDuration = 60;
```

```tsx
// app/layout.tsx
import { TruplexyChat } from "@truplexy/react";
// …inside <body>:
<TruplexyChat endpoint="/api/truplexy" heading="Support" />
```

## How it works

- **Sessions without a database.** On a visitor's first message, the route starts a Truplexy conversation and returns a signed token naming it. The browser keeps that token in localStorage. The route only reaches conversations whose token verifies, so visitors can't read each other's chats ([format](PROTOCOL.md#sessions)).
- **Team replies without a webhook.** The route hands the browser the conversation's own realtime topic (never the bot topic). The widget listens with a ~1 KB Supabase Realtime client, and polls while the socket is down.
- **Replies render safely.** Markdown is escaped first, and links are limited to http(s) and mailto. The widget lives in a Shadow DOM, so site CSS and widget CSS can't collide.

## Development

```bash
npm install
npm run build        # all packages (server, web, react, vue)
npm test             # vitest: sessions, handler, client state, markdown safety, the element, plugin sync
npm run typecheck
npm run size         # fails if the CDN widget passes 20 KB gzipped
npm run playground   # http://localhost:4300: the CDN widget + the real route against a mock API
TRUPLEXY_CHAT_KEY=tpx_… npm run playground   # the same, against the real API
```

**Testing a route in any language.**

1. Run the mock API: `node playground/mock-api.mjs`, which listens on `http://localhost:4301/v2`.
2. Point the route at the mock API.
3. Run `node scripts/check-route.mjs <route URL> <session secret>`.

It checks the whole protocol and cross-verifies session tokens with `@truplexy/server`.

**The WordPress plugin** is also embedded in the dashboard (`dashboard/src/features/integrations/snippets/wordpress-plugin.ts`). `test/wordpress.test.ts` fails if the two copies differ. Keep the plugin free of backticks and `${`.

## Publishing

Not yet published. Before the first release:

1. Claim the `@truplexy` npm organisation.
2. Run `npm run build && npm test`.
3. Publish `server` and `web` first, then `react` and `vue`: `npm publish --workspaces --access public`.

The CDN URL in the docs (`cdn.jsdelivr.net/npm/@truplexy/web@0/dist/truplexy.min.js`) and the WordPress plugin's default script source go live with the first `@truplexy/web` release.

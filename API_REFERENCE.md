# Truplexy API reference

Every endpoint of the Truplexy API, and how a dashboard or other frontend uses them. The API is the whole product: a dashboard is a separate app that signs people in with Supabase Auth and calls these endpoints from the browser. [`openapi/openapi.yaml`](openapi/openapi.yaml) describes the same API as an OpenAPI 3 contract, which you can use to generate a typed client.

Contents:

0. [Queries (2026-10-25)](#queries-2026-10-25), [Custom properties (2026-10-25)](#custom-properties-2026-10-25), [Shopify stores (2026-10-25)](#shopify-stores-2026-10-25), [Performance stats (2026-10-19)](#performance-stats-2026-10-19), [Image input (2026-10-19)](#image-input-2026-10-19) and [Changes for dashboards (2026-10-18)](#changes-for-dashboards-2026-10-18)
1. [Using the API from a frontend](#1-using-the-api-from-a-frontend)
2. [Roles and permissions](#2-roles-and-permissions)
3. [Endpoint index](#3-endpoint-index)
4. [Endpoints](#4-endpoints)
5. [Which endpoints a dashboard needs where](#5-which-endpoints-a-dashboard-needs-where)
6. [Errors](#6-errors)

## Queries (2026-10-25)

A business defines **query types** — payment issues, order problems, deliveries, appointments — each with its own form (custom properties of entity `query`, scoped to the type), its own statuses and who may see it. Queries of a type are opened by the team or by the assistant in a conversation, and the assistant can tell a customer how *their own* queries stand, never anyone else's. It adds routes, four permissions (`queries.read` for every role, `queries.write` for agents and up, `queries.delete` and `queries.manage` for editors and up), two built-in tools, two live events and error codes; nothing existing changed. Apply migration `0044_queries.sql` first.

**What a dashboard does:**

1. A **Queries** page: [`GET /queries`](#get-queries-v2) with filters by type, status, category, customer, assignee, reference or text, and `property[key]=` with a type. Open one with `GET /queries/{id}` and its history with `GET /queries/{id}/events`; change status, fields and assignee, and add notes, with `PATCH /queries/{id}`.
2. A **query types** settings page: `GET /query-types?archived=true`, add from `GET /query-types/presets?business_type=…` (create the type, then its fields with `POST /properties` and `scope_id` the type's ID), edit statuses, visible roles and whether the assistant handles it.
3. Show a customer's queries with `GET /queries?customer=cus_…`, and a conversation's with `?conversation=`.
4. Reload on the live events `query.created` and `query.updated` (bot topic only; they carry the query's ID and state, never its fields).
5. Let the business turn on `truplexy_open_query` and `truplexy_query_status` in the bot's `tools` ([built-in tools](#built-in-tools-v2)).

## Custom properties (2026-10-25)

A business can define typed fields for its bot's records, the way it needs them: a customer's loyalty tier, a patient's date of birth, a tenant's move-in date. Customers are the first records with properties. It adds routes, two permissions (`properties.read` for every role, `properties.write` for editors and up) and error codes; nothing existing changed. Apply migration `0041_properties.sql` first.

**What a dashboard does:**

1. Add a **Properties** settings page that lists `GET /properties?entity=customer` and lets people with `properties.write` add, edit, reorder and delete them ([Custom properties](#custom-properties-v2)).
2. Offer **suggested** properties from `GET /properties/presets?entity=customer&business_type=<the business's type>`; adding one is a `POST /properties` with the preset's fields.
3. Lock a property's `key` and `type` once it exists. Warn before deleting one: its values are erased from every record.
4. Hide the page when `GET /properties` answers `404` (a server without this feature).

## Shopify stores (2026-10-25)

A business can connect its Shopify store to a bot. Connecting runs Shopify's app install (OAuth), adds a `shopify` channel to the bot, and gives the bot two read-only [built-in tools](#built-in-tools-v2): order status and product search. It adds a route, error codes and a `built_in` field on tools; nothing existing changed.

**What a dashboard does:**

1. Show **Connect** for the `shopify` channel type (`GET /channel-types`) with a field for the store's address. People may type `your-store`, `your-store.myshopify.com` or paste `https://admin.shopify.com/store/your-store`; the API accepts all three.
2. Call [`POST /channels/connect`](#post-channelsconnect-v2) with `{type: "shopify", account, return_to}`, where `return_to` is the dashboard page to come back to. Send the browser to the `url` it answers: `window.location.assign(url)`.
3. The store's owner approves the install on Shopify, and the API sends them back to `return_to` with `?connected=shopify&channel_id=chn_…`, or `?connect_error=<code>&type=shopify`. Read those query parameters, show the result, and reload `GET /channels` and `GET /tools`.
4. Let the business turn on `shopify_order_status` and `shopify_product_search` in the bot's `tools`, like any tool. Neither is turned on automatically.

`503 CHANNEL_CONNECT_UNAVAILABLE` means this server has no Shopify app configured: show the type as unavailable. If someone installs the app from inside Shopify, Shopify sends them to `{DASHBOARD_URL}/integrations/guides?shopify_shop=<store>`; prefill the store field from `shopify_shop` and ask them to press **Connect**.

## Performance stats (2026-10-19)

Two new read-only endpoints report how the API itself performs. They add fields and routes only: nothing existing changed.

- `GET /stats/performance` (`usage.read`, v2): one bot, or with `scope=business` all of a business's bots. For a business's **Performance** page.
- `GET /platform/performance` (platform admins, v2): every business. For the platform console.

Both return the same sections, described under [`GET /stats/performance`](#get-statsperformance): HTTP **requests** (counts, error rates, per-route and per-day), HTTP **latency** (p50/p95/p99), the reply **pipeline** (where a reply's time goes, stage by stage) and **RAG** quality (no-answer, empty retrieval, cache hits, confidence, degraded stages), plus per-**model** call latency and failures.

**What a dashboard must handle:**

- Check `recording` first. `recording.http: false` means the server isn't storing requests (`PERF_HTTP_STATS` is off), so `requests`, `latency` and `by_route` are all zero. Say "request stats are off" rather than showing a flat chart. `recording.model_attempts: false` means `models` is empty for the same reason. The pipeline and RAG sections need no setting.
- Replies recorded before this release have no `prepare`, `quota` or `postprocess` timings; their time shows as `other`. Expect that for ranges that start before the deploy.
- Every percentile is in whole milliseconds. Don't average percentiles across days or routes: use the ones the API gives for the range.

## Image input (2026-10-19)

> **Status: served.** The endpoints, fields and error codes marked *image input* below are live on `/v3` and `/v2` (not `/v1`). A server can still turn the feature off (`IMAGE_INPUT`), and it needs a model that reads pictures and a plan that includes it, so check the feature before showing an attach control. [`openapi/openapi.yaml`](openapi/openapi.yaml) carries the same contract.

Customers (and people testing in the playground) can attach pictures to a message, and the assistant reads them. Pictures never pass through the API's JSON bodies: they go straight to R2 like knowledge files, and the message names them by ID.

**Feature check.** Don't assume the feature exists.

- A dashboard calls `GET /playground/attachments/config`. `404 NOT_FOUND` means the API predates the feature, and `enabled: false` means this business or server can't use it. Either way, hide the attach control.
- A chat widget reads `attachments` in `GET /profile`. It is absent before the feature exists.

**What changes for a dashboard:**

- **Composer.** The playground message box can attach up to 3 pictures. Send them with the three-step flow in [Sending images](#sending-images-image-input), then pass the IDs as `attachments` to `POST /playground/run`.
- **Messages carry `attachments`.** A customer message may now have `attachments: [{id, content_type, width, height, size, url, url_expires_at}]`. Render each `url` in an `<img>`. It is a signed link that works for 1 hour, so reload the conversation (or the ticket) when it expires. Old messages and messages without pictures have no `attachments`. This applies to the playground conversation, `user_message`, the chat API's conversation, ticket messages and the `message.created` event.
- **`message` may be empty** when `attachments` are sent. Text is still best: knowledge retrieval searches on the text.
- **Cost.** A picture costs roughly 250–1,500 input tokens, depending on the model that answers. It is counted in `usage.input_tokens` and the plan's tokens like any other input, so show it nowhere special.
- **Earlier pictures aren't re-read.** The assistant sees a picture only in the reply to the message that carried it. Later turns see a short note that a picture was sent, plus the assistant's own earlier answer. A customer who needs a second look should send it again.
- **New errors:** `IMAGE_TOO_LARGE`, `UNSUPPORTED_IMAGE_TYPE`, `INVALID_IMAGE`, `ATTACHMENT_NOT_FOUND`, `ATTACHMENT_NOT_UPLOADED`, and `PLAN_LIMIT_REACHED` with `limit: "image_input"`. See [Errors](#6-errors).
- **Not included yet:** pictures in a person's reply from a ticket, GIF, HEIC and PDF.

## Changes for dashboards (2026-10-18)

What changed in this release, and what a dashboard should do about it. Nothing was removed from requests or responses: an older dashboard keeps working, it just shows controls that no longer do anything.

**The platform sets how every bot answers.** Businesses no longer configure the model or model settings.

- Remove the model picker and the temperature, max output tokens, passages per message (`topK`), routing, retrieval mode (`knowledge.ragMode`, `maxSubqueries`) and answer verification (`knowledge.verify`) controls from bot configuration. `GET /workspace` reports `modelSelection: "platform"` and `GET /models` returns an empty list.
- `PUT /workspace` from a business keeps those fields as they were saved and drops what was sent, without an error. Send the bot back as loaded. Only a platform admin or the admin key changes them, and replies use the platform's settings anyway.
- Keep: assistant name, prompt template and its variables, `ragEnabled`, tools, web search, and `knowledge.policy` (source policy).
- `POST /playground/run`: `model` is ignored; `max_output_tokens` is still required (send any value from 1 to 32768) but the platform's limit is used; `temperature` and `rag_top_k` are honoured only for platform admins. Hide those playground controls for everyone else.

**New chat clears the playground.** `POST /playground/conversations` now deletes the bot's earlier playground conversations and their messages (except one with a ticket). After calling it, reset the chat view and don't offer a list of old playground chats; `GET /playground/conversations/current` returns the new, empty one.

**Replies are steadier.** No request or response shape changed, but a dashboard may notice:

- Thanks, acknowledgements and emoji ("👍", "okei my bad", "all done") get a short friendly reply with `status: "answered"` and no sources, never the "I couldn't find enough reliable information" no-answer.
- Replies no longer repeat a sentence, echo the customer's question or contain `<knowledge>`/`<source>` markup. A draft that did is rewritten once, which can make that reply slower and its `usage` cover two model calls.
- Model outages and empty model responses are retried on another model, so `502 LLM_PROVIDER_ERROR` is rarer. Keep showing it, with a "send again" (`resend`) action.
- The answering `model` shown on a reply varies by message: routing picks fast, balanced or advanced models from the platform catalog.

**Platform console.** Each model's `routing_tier` (`PATCH /platform/models/{id}`) now decides which messages it answers; see `GET /platform/models`. Show the tier and let platform admins set it, with a warning when a tier has no active model. The admin debug view of a reply (`routing` with `debug`) no longer has `shadow` or classifier cost fields: the classifier is always `rules`.

## 1. Using the API from a frontend

### Base URL and versions

| Environment | Base URL |
| --- | --- |
| Production | `https://api.truplexy.com/v3` |
| Local (`go run ./cmd/server`) | `http://localhost:3000/v3` |

Every path in this document is relative to the base URL, so `GET /me` means `GET https://api.truplexy.com/v3/me`. `/v3` is current. `/v2` answers every endpoint identically and stays for clients that haven't moved yet; see [FRONTEND_V2_TO_V3_GUIDE.md](FRONTEND_V2_TO_V3_GUIDE.md). `/v1` still answers for the endpoints it had before v2 but is deprecated. Its responses carry `Deprecation: true`, a `Link: </v3/…>; rel="successor-version"` header and, once scheduled, a `Sunset` date. Endpoints added in v2 exist only under `/v2` and `/v3`. Build against `/v3`.

### Calling from the browser (CORS)

The API answers browsers only from the origins listed in its `CORS_ALLOWED_ORIGINS` setting (comma-separated, such as `https://dashboard.example.com,http://localhost:5173`). Add your dashboard's local and production origins there, in the API's environment (Vercel project `truplexy-api`), and redeploy. From any other origin, the browser blocks the response.

Origins include the port: `http://localhost:5173` does not permit `http://localhost:5174`. To allow both local dashboards, append `http://localhost:5173,http://localhost:5174` to the API's `CORS_ALLOWED_ORIGINS`, keeping any production origins already listed. When calling `https://api.truplexy.com`, update the Vercel project's Production environment and redeploy; changing a local `.env` only affects `go run ./cmd/server` after a restart. An unallowed preflight to `/v3/me` can return `405` without `Access-Control-Allow-Origin`.

- **Preflight.** Allowed requests may send `Authorization`, `Content-Type`, `X-Truplexy-Tenant` and `X-Truplexy-Bot`, with the methods `GET`, `POST`, `PUT`, `PATCH` and `DELETE`. Preflights are cached for 10 minutes.
- **Readable headers.** Browser code can read `X-Request-ID`, `Deprecation`, `Link`, `Sunset` and `Retry-After`.
- **No cookies.** Credentials mode is never allowed, so don't send `credentials: "include"`. Authentication is a bearer token, below.
- **File uploads** go straight to Cloudflare R2 rather than to the API. Add the same origins to the R2 bucket's CORS rule (see [README → Cloudflare setup](README.md#cloudflare-setup)), with `PUT` allowed and the `Content-Type` header.

### Signing people in

People sign in with [Supabase Auth](https://supabase.com/docs/guides/auth) in the same Supabase project the API trusts (its `SUPABASE_URL`). The API has no sign-in, sign-up or password endpoints of its own. Use supabase-js in the dashboard with the project URL and its **publishable** key (`sb_publishable_…`, Supabase → Project Settings → API Keys), and use any of the sign-in methods the project enables (email and password, magic link, Google). Then send the session's access token on every API call:

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

export async function api<T>(path: string, init: RequestInit = {}, scope?: { tenant: string; bot: string }): Promise<T> {
  const { data } = await supabase.auth.getSession(); // refreshes the token when it is about to expire
  const headers = new Headers(init.headers);
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  if (scope) {
    headers.set("X-Truplexy-Tenant", scope.tenant);
    headers.set("X-Truplexy-Bot", scope.bot);
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error.message), body.error, { status: res.status });
  return body as T;
}
```

- **Token checks.** The API verifies the token against the project's public signing keys (ES256 or RS256; HS256 tokens are refused). An expired or invalid token gets `401 UNAUTHORIZED`: refresh the session, or send the person to sign in.
- **Redirect URLs.** Add the dashboard's URLs to Supabase → Authentication → URL Configuration. Point the email templates at the dashboard page that completes sign-in. That page calls `supabase.auth.verifyOtp({ token_hash, type })` or `exchangeCodeForSession`.
- **Never ship backend keys to the browser.** That means `ADMIN_API_KEY`, `PLAYGROUND_API_KEY`, `CHAT_API_KEY`, issued chat keys and the Supabase secret key. A dashboard needs only the person's access token.

### Choosing the business and bot (scope)

Most endpoints act on one bot of one business, its **scope**. The person's token names who they are, and two headers name the scope:

```http
Authorization: Bearer <access token>
X-Truplexy-Tenant: acme
X-Truplexy-Bot: support
```

Send both headers or neither. The person must be a member of the business, and their role must have the endpoint's permission. Wrong headers fail with these errors:

| Header problem | Status and code |
| --- | --- |
| A scoped endpoint without the headers | `400 SCOPE_REQUIRED` |
| A malformed ID | `400 INVALID_SCOPE` |
| A business the person isn't in (or that doesn't exist) | `404 TENANT_NOT_FOUND` |
| A bot that doesn't exist | `404 BOT_NOT_FOUND` |
| A suspended business | `403 TENANT_SUSPENDED` (platform admins aren't blocked) |

Tenant and bot IDs are 1–31 lowercase letters, digits, `-` or `_`, starting with a letter or digit.

**Bootstrapping a session:**

1. `GET /me` (no scope headers). It returns the person, `platform_admin`, every membership with its role and bots, and `roles`, the permissions of each role.
2. With no membership, offer onboarding: `GET /business-types`, then `POST /tenants` creates a business and its first bot, `support`.
3. Otherwise pick a membership and one of its bots (remember the last choice locally), and send them as the scope headers from then on.
4. Gate the UI with `roles[membership.role]`, the list of permissions such as `tickets.write` (see [Roles and permissions](#2-roles-and-permissions)). Show the platform console only when `platform_admin` is true. The API enforces all of this anyway; the UI only hides what a role can't use.

### Endpoint groups and credentials

| Group | Scope headers | Who can call |
| --- | --- | --- |
| Health | no | anyone |
| Account (`/me`, `/business-types`, `/plans`, `/tenants`, `/invites/preview`, `/invites/accept`) | no | a signed-in person |
| Business and bot (everything with a permission in the index) | yes | a member whose role has the permission; the admin key |
| Playground (`/playground/…`) | yes | a member with `playground.run`; the playground key |
| Platform (`/platform/…`) | no | a platform admin; the admin key |
| Chat API (`/conversations/…`, `/realtime/token`) | no | a chat key only, never a person's token |
| Internal (`/internal/cron/…`) | no | the scheduler's `CRON_SECRET` |

The admin key (`ADMIN_API_KEY`) is a server-side credential with every permission; without scope headers it acts on the `default` bot. The chat key is what websites, apps and messaging platforms use to talk to a bot. It is shown here because a dashboard issues chat keys and shows integrators how to use them.

### Request and response rules

- **JSON.** A body must be one JSON object, sent with `Content-Type: application/json`. Unknown fields are rejected with `400 INVALID_REQUEST`. Bodies are capped at 1 MiB by default (`413 BODY_TOO_LARGE`).
- **Status codes.** `200` returns a result, `201` a created record, `204` no body.
- **Times** are UTC RFC 3339 strings, such as `2026-10-01T10:00:00Z`. Query dates are `YYYY-MM-DD`, read as UTC days.
- **IDs** are a prefix plus 32 lowercase hex characters:

  | Record | Prefix |
  | --- | --- |
  | Conversation | `conv_` |
  | Message | `msg_` |
  | Ticket | `tkt_` |
  | Knowledge document | `doc_` |
  | Chat API key | `key_` |
  | Invitation | `inv_` |
  | Webhook event | `evt_` |
  | Prompt template | `tpl_` |
  | Attachment (image input) | `att_` |

  Member and user IDs are UUIDs. Invitation tokens are `tpi_` plus 48 hex characters. A malformed ID returns the same 404 as an unknown one.
- **Pages.**
  - `GET /knowledge/documents` and `GET /tickets` return `next_cursor` while more results remain; pass it back as `cursor`.
  - `GET /platform/tickets` uses `next_before` and `before` the same way.
  - The field is absent on the last page.
- **Request IDs.** Every response has `X-Request-ID`, and every error repeats it as `error.request_id`. Show it in error messages so people can report it.
- **Caching.** Authenticated responses carry `Cache-Control: no-store`; don't cache them in a service worker either.
- **Errors** share one shape: see [Errors](#6-errors). Match on `error.code`; `error.message` is written for people and may change.
- **200 outcomes that still failed.** Some failures come back as a successful HTTP response. Check the body as well as the status:
  - A tool test that failed: `status: "error"`.
  - A webhook test that failed: `ok: false`.
  - A document that failed to index: `status: "failed"`.

### Rate limits

Every request is counted, and a client that sends too many gets **`429 RATE_LIMITED`** with `Retry-After` (seconds) and the `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` headers, which also describe the allowance on answered requests. Wait `Retry-After` seconds and send again; a dashboard should not retry sooner. The limits are generous, per minute, and the operator can change them (`RATE_LIMIT_*` in `.env.example`):

| What is limited | Default | By |
| --- | --- | --- |
| All requests (not `/health`, Paddle's webhook, scheduled jobs) | 1,200 | client address |
| Credentials the API rejects (`401`); past the limit the address is refused for a while, even with a valid credential | 30 | client address |
| Everything a chat key or playground credential does | 1,200 | credential |
| Starting work with it: `POST /conversations`, `POST /conversations/{id}/messages`, `POST /playground/run`, `POST /playground/conversations` | 300 | credential |
| Reads / writes in a business | 600 / 180 | person (the admin key counts as one per business) |
| Calls that cost money or reach other systems: ticket summaries, tool and webhook tests, knowledge search, reindexing, invitations, new API keys | 20 | business |
| Subscription and balance changes: checkout, change, portal, extra tokens | 10 | business |
| A person's own account and the platform console | as reads / writes | person |

Plan limits (`429 PLAN_LIMIT_REACHED`) and model limits (`429 LLM_RATE_LIMITED`) are different errors with their own causes. IPv6 clients are counted by their /64.

### Long-running work: uploading and indexing knowledge

Files never pass through the API. To add one to the bot's knowledge base:

1. Hash the file in the browser (SHA-256, as 64 lowercase hex characters, with `crypto.subtle.digest`).
2. `POST /knowledge/uploads` with `{filename, size, sha256}` and optional `title`, `source_url` and filter metadata. **201** `{document, url, method: "PUT", headers, expires_at}`.
3. `PUT` the raw file to `url` with exactly `headers`, within 15 minutes. This request goes to R2, not the API.
4. `POST /knowledge/documents/{id}/process`. Each call works for up to about 40 seconds and returns the document with its progress (`status`, `chunk_count`, `embedded_count`). Repeat while `status` is `processing`, and stop at `indexed` or `failed` (`error` says why). If two calls in a row show no progress, wait a couple of seconds before the next.

Notes:
- **Articles.** `POST /knowledge/documents` takes Markdown text directly and indexes it before responding. Continue with `/process` only if it comes back `processing`.
- **Duplicates.** An upload whose content is already in the knowledge base gets `409 DUPLICATE_DOCUMENT` with `document_id`.
- **Abandoned work.** If the client stops mid-way, a daily background job finishes documents left `processing`. Uploads registered but never processed are marked `failed` after an hour.
- **Bulk uploads.** Unpacking a `.zip`, or reading a manifest of titles and metadata, happens entirely in the client: register each file in turn (three at a time works well). [README → Manifest](README.md#manifest) describes the manifest format the old dashboard used.

### Sending images (image input)

A message carries pictures by reference. Each one takes three calls, and the last is the message itself:

1. Hash the file in the browser (SHA-256, as for knowledge uploads) and register it: `POST /playground/attachments` from a dashboard, or `POST /conversations/{id}/attachments` with a chat key. Send `{filename, content_type, size, sha256}`. **201** `{attachment, url, method: "PUT", headers, expires_at}`, with the attachment `pending`.
2. `PUT` the raw file to `url` with exactly `headers`, within 15 minutes. This request goes to R2, not the API, so the R2 bucket's CORS rule needs `PUT` and `Content-Type` for the dashboard's origins (already true if knowledge uploads work).
3. Send the message with `attachments: [id, …]` (1–3 IDs): `POST /playground/run` or `POST /conversations/{id}/messages`. The reply to that call has read the pictures.

```ts
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Registers and uploads one picture. Returns the ID to pass in `attachments`. */
export async function uploadImage(file: File, scope: { tenant: string; bot: string }): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Use a JPEG, PNG or WebP picture.");
  const reg = await api<{ attachment: { id: string }; url: string; method: "PUT"; headers: Record<string, string> }>(
    "/playground/attachments",
    { method: "POST", body: JSON.stringify({ filename: file.name, content_type: file.type, size: file.size, sha256: await sha256Hex(file) }) },
    scope,
  );
  const put = await fetch(reg.url, { method: reg.method, headers: reg.headers, body: file });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return reg.attachment.id;
}
```

- **Big files are fine.** The API accepts pictures up to 20 MB (20,971,520 bytes) and shrinks every one before the assistant sees it. A frontend may downscale first (for example to 2048 px on the long edge with a canvas) to upload faster on a slow connection, but it isn't required.
- **What the server does to each picture.** It trusts the file's bytes, not the declared type. It turns the picture upright using its EXIF orientation, removes all metadata (including location), puts transparency on a white background, scales the long edge to at most 1280 px, and stores a JPEG of at most 1 MiB. The `width`, `height` and `size` in a message's attachment describe that stored copy, never the original.
- **Accepted:** JPEG, PNG and WebP, at least 8 px on each side and at most 16,384 px, and a size that decodes within the server's memory limit. A very large 16-bit PNG can be refused where the same picture as a JPEG isn't. Animated WebP, GIF, SVG and HEIC are refused. Set `accept="image/jpeg,image/png,image/webp"` on the file input; phones then usually convert a HEIC photo to JPEG when picking it.
- **Checked when the message is sent.** Registration checks only the declared details. The picture itself is read, checked and shrunk when the message arrives, so a bad file fails that call (`400 INVALID_IMAGE`, `400 UNSUPPORTED_IMAGE_TYPE` or `413 IMAGE_TOO_LARGE`) **before** anything is stored or any tokens are spent. The failed attachment can't be reused; register a new one.
- **One use.** An attachment belongs to the one message it is sent with. A retry of the same send with the same `Idempotency-Key` is safe and returns the first response.
- **Unsent uploads expire.** An attachment registered but not sent within an hour answers `404 ATTACHMENT_NOT_FOUND`, and a background job removes the file. Sending before the `PUT` finished is `409 ATTACHMENT_NOT_UPLOADED`: finish the upload and send again.
- **Lifetime.** Pictures are deleted with their conversation: when `POST /playground/conversations` clears earlier chats, and when a deleted business is purged. A conversation with a ticket keeps its pictures while the ticket exists.
- **Showing a picture.** `url` works in `<img src>` with no extra setup. Fetching it with `fetch()` (to draw on a canvas, say) needs a `GET` rule in the R2 bucket's CORS.

**A website widget** never holds a chat key. Its integration's server registers the picture, passes `url` and `headers` to the browser, which does the `PUT` straight to R2 (the website's origin needs the same R2 CORS rule), and then the server sends the message with the attachment ID. The file never has to pass through the integration's server.

An integration's server can also do the whole thing itself with its chat key (never from a browser):

```ts
const reg = await chat(`/conversations/${id}/attachments`, { filename: "screenshot.png", content_type: "image/png", size: bytes.length, sha256 });
await fetch(reg.url, { method: "PUT", headers: reg.headers, body: bytes });
const { reply } = await chat(`/conversations/${id}/messages`, { message: "This error appears when I log in", attachments: [reg.attachment.id] });
```

### Live updates

Ticket and conversation changes are pushed through [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast), so a dashboard can update without polling. The API publishes events, and the browser holds the WebSocket to Supabase.

1. `GET /realtime` (scope headers, `tickets.read`) returns `{url, publishable_key, bot_topic, events}`. With live updates off on the server it returns `503 REALTIME_NOT_CONFIGURED`; fall back to polling.
2. Subscribe to `bot_topic` with supabase-js:

   ```ts
   const sub = await api<{ url: string; publishable_key: string; bot_topic: string }>("/realtime", {}, scope);
   const realtime = createClient(sub.url, sub.publishable_key); // or reuse your auth client: it is the same project
   const channel = realtime
     .channel(sub.bot_topic)
     .on("broadcast", { event: "*" }, ({ event, payload }) => {
       // payload is {id, type, created_at, data}; refetch what it names.
       if (event.startsWith("ticket.")) refreshTickets(payload.data.ticket?.id);
       if (event === "message.created") refreshConversation(payload.data.conversation_id);
       if (event === "conversation.updated") refreshHandoffs();
     })
     .subscribe();
   // on scope change or sign-out: realtime.removeChannel(channel)
   ```

3. Treat an event as a prompt to reload through the API, not as the data itself. Keep a slow poll, every two minutes, to catch a dropped connection or a missed event.

**Topics.** The topic names are secret, unguessable strings, and anyone who knows one can listen. The bot topic carries every event of the bot, internal notes included, so keep it in the dashboard. Fetch it again after a reload rather than storing it. Topics change when the server's topic secret is rotated.

| Event | Sent when | `data` |
| --- | --- | --- |
| `message.created` | A customer message, an assistant reply, or a person's reply (from a ticket or an integration). | `{conversation_id, ticket_id?, message: {id, role, content, author?, agent?, attachments?, created_at}}` (`attachments`: image input; their `url` is signed for 1 hour, so reload the conversation rather than keeping it) |
| `ticket.created` | A ticket is opened. | `{conversation_id, ticket: {id, subject, status, priority, escalated, channel_id?}}` |
| `ticket.updated` | Status, priority, assignee, escalation or subject changes; a note is added; the ticket is deleted. | The same as `ticket.created`. A deletion sends `{ticket: {id}, deleted: true}`. |
| `conversation.updated` | A conversation is flagged for the team (handoff). | `{conversation_id, status}` |

**For customers (chat key).** An integration's server calls `POST /realtime/token` with its chat key and optional `{conversation_id}`. **200** `{url, publishable_key, bot_topic, conversation_topic?, events}`. It may hand `conversation_topic` to the customer's browser, because that topic carries only that conversation's messages and ticket changes, never internal notes. `bot_topic` must stay on the integration's server.

### Work a dashboard does itself

The API stays a pure JSON API. These jobs fall to the frontend:

- **Invitations.**
  - `POST /invites` returns a one-time `token`. With the API's `DASHBOARD_URL` set, it also returns the `link`, `{DASHBOARD_URL}/invite/{token}`.
  - With `SUPABASE_SECRET_KEY` set as well, the API emails the invitation through Supabase Auth and reports `emailed: true`. A new address gets the Invite user email, which creates the account; an existing account gets the Magic Link email.
  - Either email signs the person in and lands on `{DASHBOARD_URL}/auth/callback?next=/invite/{token}`. That page must complete sign-in, then open `next`:
    - with `token_hash` and `type` in the query (templates built on `{{ .TokenHash }}`), call `supabase.auth.verifyOtp({ token_hash, type })`;
    - with `access_token` and `refresh_token` in the URL's hash (the default `{{ .ConfirmationURL }}` templates), call `supabase.auth.setSession(...)`. These emails are started by the API, so they can't use PKCE and never arrive with a `code`.
  - When `emailed` is `false` (email off or failed), show the `link` to copy, or build it from the `token` yourself. Inviting the address again sends a new link and cancels the old one.
  - The invite page (`/invite/{token}`) calls `POST /invites/preview` to describe the invitation, then `POST /invites/accept` once the person is signed in with the invited address. Someone signed out there should sign in or sign up, then return to it.
- **Backups.**
  - To export, read `GET /workspace` and each document with `GET /knowledge/documents/{id}`, which includes `content`.
  - To import, `PUT /workspace`, then `POST /knowledge/documents` for each article. Expect `409 DUPLICATE_DOCUMENT` for content already present.
- **Template preview.** Render a prompt template's body in the browser to preview it (see [Models and prompt templates](#models-and-prompt-templates)).
- **An integration guide for customers' developers.** The chat API section below is the source; publish it however you like.

## 2. Roles and permissions

Each member has one role in a business. `GET /me` returns the same table as `roles`.

| Permission | Viewer | Agent | Editor | Admin | Owner |
| --- | :-: | :-: | :-: | :-: | :-: |
| `bot.read`, `knowledge.read`, `tools.read`, `tickets.read`, `usage.read`, `members.read`, `channels.read`, `customers.read`, `properties.read`, `queries.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `playground.run`, `tickets.write`, `customers.write`, `queries.write` | | ✓ | ✓ | ✓ | ✓ |
| `bot.write`, `knowledge.write`, `tools.write`, `tickets.delete`, `integrations.read`, `properties.write`, `queries.delete`, `queries.manage` | | | ✓ | ✓ | ✓ |
| `integrations.write`, `channels.write`, `bots.create`, `members.write`, `business.write`, `billing.write`, `audit.read` | | | | ✓ | ✓ |
| `owners.manage`, `business.delete` | | | | | ✓ |

- **Platform admins and the admin key** pass every permission check, in every business.
- **Owners.** Only an owner (`owners.manage`) can invite, promote, demote or remove an owner. A business always keeps at least one owner (`409 LAST_OWNER`).
- **Deleting the business.** Only an owner (`business.delete`) can ask platform admins to delete it (see [Deleting a business](#deleting-a-business)).
- **Refusals.** A role without the endpoint's permission gets `403 FORBIDDEN`. Role changes take effect within 30 seconds on every server.

## 3. Endpoint index

**Access** is the permission a member needs, or the group from [Endpoint groups](#endpoint-groups-and-credentials). **v2** marks endpoints that `/v1` doesn't have.

| Method | Path | Access | Does |
| --- | --- | --- | --- |
| `GET` | `/health` | anyone | Check that the API is running |
| `GET` | `/me` | account | The signed-in person and their businesses |
| `PUT` | `/me/avatar` | account | v2: Set your own picture |
| `DELETE` | `/me/avatar` | account | v2: Remove your own picture |
| `GET` | `/business-types` | account | Kinds of business and their starting assistants |
| `GET` | `/plans` | account | Plans and their limits |
| `POST` | `/tenants` | account | Create a business |
| `POST` | `/invites/preview` | account | Describe an invitation |
| `POST` | `/invites/accept` | account | Join a business by invitation |
| `GET` | `/tenant` | `members.read` | The business, its limits and usage |
| `PATCH` | `/tenant` | `business.write` | Rename the business, change its type or reply target |
| `POST` | `/tenant/leave` | `members.read` | Leave the business |
| `GET` | `/members` | `members.read` | List members |
| `PATCH` | `/members/{user_id}` | `members.write` | Change a member's role |
| `DELETE` | `/members/{user_id}` | `members.write` | Remove a member |
| `GET` | `/invites` | `members.read` | Pending invitations |
| `POST` | `/invites` | `members.write` | Invite someone |
| `DELETE` | `/invites/{id}` | `members.write` | Cancel an invitation |
| `GET` | `/audit` | `audit.read` | The activity log |
| `GET` | `/tenant/deletion-request` | `members.read` | The business's latest deletion request (v2) |
| `POST` | `/tenant/deletion-request` | `business.delete` | Ask platform admins to delete the business (v2) |
| `DELETE` | `/tenant/deletion-request` | `business.delete` | Withdraw the pending deletion request (v2) |
| `GET` | `/bots` | `bot.read` | List the business's bots |
| `POST` | `/bots` | `bots.create` | Create a bot |
| `GET` | `/api-keys` | `integrations.read` | List chat API keys |
| `POST` | `/api-keys` | `integrations.write` | Issue a chat API key |
| `DELETE` | `/api-keys/{id}` | `integrations.write` | Revoke a chat API key |
| `GET` | `/channel-types` | `channels.read` | Channel types the bot may add (v2) |
| `GET` | `/channels` | `channels.read` | List the bot's channels (v2) |
| `POST` | `/channels` | `channels.write` | Add a channel (v2) |
| `GET` | `/channels/{id}` | `channels.read` | A channel (v2) |
| `PATCH` | `/channels/{id}` | `channels.write` | Change a channel, or turn it off (v2) |
| `DELETE` | `/channels/{id}` | `channels.write` | Delete a channel (v2) |
| `POST` | `/channels/connect` | `channels.write` | Start connecting a channel through its platform, such as a Shopify store (v2) |
| `GET` | `/customers` | `customers.read` | List and search the bot's customers (v2) |
| `POST` | `/customers` | `customers.write` | Add a customer (v2) |
| `GET` | `/customers/{id}` | `customers.read` | A customer with their latest conversations and tickets (v2) |
| `PATCH` | `/customers/{id}` | `customers.write` | Change a customer (v2) |
| `DELETE` | `/customers/{id}` | `customers.write` | Delete a customer (v2) |
| `GET` | `/properties` | `properties.read` | The custom properties of one kind of record (v2) |
| `GET` | `/properties/presets` | `properties.read` | Suggested properties for the business's type (v2) |
| `POST` | `/properties` | `properties.write` | Add a custom property (v2) |
| `PATCH` | `/properties/{id}` | `properties.write` | Change a custom property (v2) |
| `DELETE` | `/properties/{id}` | `properties.write` | Delete a custom property and its values (v2) |
| `GET` | `/query-types` | `queries.read` | The query types the role may see (v2) |
| `GET` | `/query-types/presets` | `queries.read` | Suggested query types (v2) |
| `POST` | `/query-types` | `queries.manage` | Add a query type (v2) |
| `PATCH` | `/query-types/{id}` | `queries.manage` | Change or archive a query type (v2) |
| `DELETE` | `/query-types/{id}` | `queries.manage` | Delete a query type without queries (v2) |
| `GET` | `/queries` | `queries.read` | List queries (v2) |
| `POST` | `/queries` | `queries.write` | Open a query (v2) |
| `GET` | `/queries/{id}` | `queries.read` | A query (v2) |
| `PATCH` | `/queries/{id}` | `queries.write` | Change a query, or add a note (v2) |
| `DELETE` | `/queries/{id}` | `queries.delete` | Delete a query (v2) |
| `GET` | `/queries/{id}/events` | `queries.read` | A query's history (v2) |
| `GET` | `/workspace` | `bot.read` | The bot's configuration and versions |
| `PUT` | `/workspace` | `bot.write` | Save the bot's configuration |
| `GET` | `/models` | `bot.read` | Models the bot may use (v2) |
| `GET` | `/prompt-templates` | `bot.read` | Prompt templates the bot may use (v2) |
| `GET` | `/knowledge/documents` | `knowledge.read` | List knowledge documents |
| `POST` | `/knowledge/documents` | `knowledge.write` | Add an article |
| `GET` | `/knowledge/documents/{id}` | `knowledge.read` | A document with its text |
| `PUT` | `/knowledge/documents/{id}` | `knowledge.write` | Edit a document |
| `DELETE` | `/knowledge/documents/{id}` | `knowledge.write` | Delete a document |
| `POST` | `/knowledge/documents/{id}/process` | `knowledge.write` | Index a document, step by step |
| `POST` | `/knowledge/documents/{id}/reindex` | `knowledge.write` | Rebuild a document's passages |
| `POST` | `/knowledge/uploads` | `knowledge.write` | Register a file upload |
| `POST` | `/knowledge/search` | `knowledge.read` | Test retrieval for a query |
| `GET` | `/tools` | `tools.read` | List the business's API tools |
| `POST` | `/tools` | `tools.write` | Create an API tool |
| `GET` | `/tools/{name}` | `tools.read` | A tool |
| `PUT` | `/tools/{name}` | `tools.write` | Replace a tool |
| `DELETE` | `/tools/{name}` | `tools.write` | Delete a tool |
| `POST` | `/tools/{name}/test` | `tools.write` | Run a tool for real |
| `GET` | `/tickets` | `tickets.read` | List tickets |
| `POST` | `/tickets` | `tickets.write` | Open a ticket |
| `GET` | `/tickets/{id}` | `tickets.read` | A ticket with its conversation |
| `PATCH` | `/tickets/{id}` | `tickets.write` | Change a ticket |
| `DELETE` | `/tickets/{id}` | `tickets.delete` | Delete a ticket |
| `POST` | `/tickets/{id}/replies` | `tickets.write` | Reply to the customer, or add a note |
| `POST` | `/tickets/{id}/summary` | `tickets.write` | Generate the ticket's AI summary (v2) |
| `GET` | `/handoffs` | `tickets.read` | Conversations the assistant flagged |
| `GET` | `/realtime` | `tickets.read` | The bot's live update topic (v2) |
| `GET` | `/webhook` | `integrations.read` | The bot's webhook |
| `PUT` | `/webhook` | `integrations.write` | Set the webhook |
| `DELETE` | `/webhook` | `integrations.write` | Remove the webhook |
| `POST` | `/webhook/secret` | `integrations.write` | Replace the signing secret |
| `POST` | `/webhook/test` | `integrations.write` | Send a test event |
| `GET` | `/webhook/deliveries` | `integrations.read` | List events whose delivery failed and were queued for retry (v2; needs `WEBHOOK_OUTBOX`). Optional `?status=pending|delivered|dead`. |
| `POST` | `/webhook/deliveries/{id}/replay` | `integrations.write` | Put a queued event back in line (v2); answers `202` |
| `GET` | `/usage/summary` | `usage.read` | Model usage, cost and answer quality |
| `GET` | `/stats/support` | `usage.read` | Tickets, response times and cost per ticket (v2) |
| `GET` | `/stats/performance` | `usage.read` | Requests, latency, reply pipeline stages and RAG quality (v2) |
| `GET` | `/billing` | `usage.read` | Balance, this month's tokens and the extra-token slider (v2) |
| `GET` | `/billing/ledger` | `usage.read` | Changes to the balance (v2) |
| `GET` | `/billing/token-addons/quote` | `usage.read` | Price extra tokens for the slider (v2) |
| `POST` | `/billing/token-addons` | `billing.write` | Buy extra tokens for the month from the balance (v2) |
| `POST` | `/playground/run` | `playground.run` | Answer a message with given settings |
| `GET` | `/playground/conversations/current` | `playground.run` | The latest playground conversation |
| `POST` | `/playground/conversations` | `playground.run` | Start a playground conversation, clearing the earlier ones |
| `GET` | `/playground/attachments/config` | `playground.run` | Image input: whether pictures can be attached, and the limits |
| `POST` | `/playground/attachments` | `playground.run` | Image input: register a picture and get a presigned upload URL |
| `GET` | `/platform/overview` | platform | Platform totals and this month's activity (v2) |
| `GET` | `/platform/tenants` | platform | Every business |
| `PATCH` | `/platform/tenants/{id}` | platform | Change a business's plan, status or limits |
| `GET` | `/platform/tenants/{id}/detail` | platform | A business's members, bots and activity (v2) |
| `POST` | `/platform/tenants/{id}/balance` | platform | Credit or debit a business's balance (v2) |
| `DELETE` | `/platform/tenants/{id}` | platform | Delete a business, restorable for 30 days (v2) |
| `POST` | `/platform/tenants/{id}/restore` | platform | Restore a deleted business (v2) |
| `GET` | `/platform/deleted-tenants` | platform | Deleted businesses and their restore deadlines (v2) |
| `GET` | `/platform/deletion-requests` | platform | Owners' deletion requests (v2) |
| `POST` | `/platform/deletion-requests/{id}/approve` | platform | Approve a request, deleting the business (v2) |
| `POST` | `/platform/deletion-requests/{id}/reject` | platform | Reject a request (v2) |
| `GET` | `/platform/users` | platform | Everyone's accounts (v2) |
| `POST` | `/platform/users` | platform | Create an account and invite the person (v2) |
| `GET` | `/platform/users/{id}` | platform | One account and what its person did (v2) |
| `PATCH` | `/platform/users/{id}` | platform | Rename, change email, grant or revoke platform admin, disable or enable (v2) |
| `DELETE` | `/platform/users/{id}` | platform | Delete an account (v2) |
| `GET` | `/platform/tickets` | platform | Tickets across businesses (v2) |
| `GET` | `/platform/tools` | platform | API tools across businesses (v2) |
| `PATCH` | `/platform/tools/{id}` | platform | Turn a tool off or on (v2) |
| `GET` | `/platform/usage` | platform | Usage by business, model or day (v2) |
| `GET` | `/platform/performance` | platform | Requests, latency, reply pipeline stages and RAG quality across businesses (v2) |
| `GET` | `/platform/models` | platform | The model catalog (v2) |
| `POST` | `/platform/models` | platform | Add a model (v2) |
| `PATCH` | `/platform/models/{id}` | platform | Change a model (v2) |
| `POST` | `/platform/models/{id}/refresh-pricing` | platform | Read a model's prices from OpenRouter again (v2) |
| `POST` | `/platform/models/refresh-pricing` | platform | Read every model's prices from OpenRouter again (v2) |
| `GET` | `/platform/prompt-templates` | platform | The prompt templates (v2) |
| `POST` | `/platform/prompt-templates` | platform | Add a prompt template (v2) |
| `PATCH` | `/platform/prompt-templates/{id}` | platform | Change a prompt template (v2) |
| `GET` | `/platform/channel-types` | platform | The channel type catalog (v2) |
| `POST` | `/platform/channel-types` | platform | Add a channel type (v2) |
| `PATCH` | `/platform/channel-types/{id}` | platform | Change or hide a channel type (v2) |
| `GET` | `/platform/channels` | platform | Channels across businesses (v2) |
| `PATCH` | `/platform/channels/{id}` | platform | Turn a business's channel off or back on (v2) |
| `GET` | `/platform/customers` | platform | Customers across businesses (v2) |
| `POST` | `/conversations` | chat key | Start a conversation |
| `GET` | `/conversations/{id}` | chat key | A conversation with its latest messages |
| `POST` | `/conversations/{id}/messages` | chat key | Send a customer message, get the reply |
| `POST` | `/conversations/{id}/escalate` | chat key | Hand the conversation to a person |
| `POST` | `/conversations/{id}/resume` | chat key | Hand the conversation back to the AI |
| `POST` | `/conversations/{id}/handoff` | chat key | Accept an offered handoff |
| `POST` | `/conversations/{id}/ticket` | chat key | Open a ticket without escalating |
| `POST` | `/conversations/{id}/ticket/close` | chat key | Close the conversation's ticket |
| `POST` | `/conversations/{id}/replies` | chat key | Record a reply written on the integration's platform |
| `GET` | `/profile` | chat key | The business and bot names and pictures, for a widget header (v2); image input adds `attachments` |
| `POST` | `/conversations/{id}/attachments` | chat key | Image input: register a picture and get a presigned upload URL |
| `PUT` | `/customer` | chat key | Find or create the customer your platform knows, by any contact: email, phone, platform user ID (v2) |
| `POST` | `/realtime/token` | chat key | Live update topics for an integration (v2) |
| `GET` | `/internal/cron/knowledge` | `CRON_SECRET` | Finish stalled indexing (v2; not for frontends) |
| `GET` | `/internal/cron/purge` | `CRON_SECRET` | Erase businesses deleted over 30 days ago (v2; not for frontends) |
| `GET` | `/internal/cron/billing` | `CRON_SECRET` | Cancel deleted businesses' subscriptions; compare Paddle with the database (v2; not for frontends) |
| `GET` | `/internal/cron/tickets` | `CRON_SECRET` | Close tickets left without activity (v2; not for frontends) |

## 4. Endpoints

### Health

#### `GET /health`

No credentials. **200** `{"status": "ok"}` while the API is running. It doesn't check the database or model provider.

### Account and onboarding

A signed-in person's token, no scope headers. These fail with `503 SIGN_IN_NOT_CONFIGURED` when the server has no `SUPABASE_URL`.

#### `GET /me`

Records the person's email and name from their token. **200**:

```json
{
  "user": {"id": "6f1c…-uuid", "email": "owner@example.com", "name": "Owner"},
  "platform_admin": false,
  "memberships": [
    {
      "tenant_id": "acme", "name": "Acme", "business_type": "saas",
      "plan": "free", "status": "active", "role": "owner",
      "bots": [{"id": "support", "name": "Support assistant"}]
    }
  ],
  "roles": {"viewer": ["bot.read", "knowledge.read", "tools.read", "tickets.read", "usage.read", "members.read"], "agent": ["…"], "editor": ["…"], "admin": ["…"], "owner": ["…"]}
}
```

#### `GET /business-types`

**200** `{data: [{id, label, description, assistant_name, knowledge_topics, tool_ideas}]}`. The `id`s are `ecommerce`, `saas`, `healthcare`, `real_estate`, `hospitality`, `education`, `professional_services` and `other`. `knowledge_topics` and `tool_ideas` are suggestions to show during setup.

#### `GET /plans`

**200** `{data: [{id, name, limits: {bots, documents_per_bot, members, replies_per_month, tokens_per_month}, token_addon}]}`. A limit of 0 means unlimited. The plans are Free, Starter, Pro and Enterprise, assigned by platform admins. `token_addon` prices the extra tokens a plan sells, or is `null`; see [Billing](#billing-balance-and-extra-tokens).

#### `POST /tenants`

Creates a business: `{name, business_type}`. `name` is 1–80 characters, and `business_type` is an `id` from `GET /business-types`.
- The caller becomes the owner.
- The business ID comes from the name, with a suffix if it is taken.
- The plan is Free.
- The first bot, `support`, starts from the type's assistant.

**201** `{tenant: Business, bot_id: "support"}`. **Errors:** `403 BUSINESS_LIMIT_REACHED`: the person already owns 3 businesses (platform admins aren't limited).

#### `POST /invites/preview`

`{token}`. **200** `{tenant_id, business_name, email, role, expires_at}`.

**Errors:**
- `404 INVITE_NOT_FOUND`
- `409 INVITE_USED`
- `410 INVITE_REVOKED`
- `410 INVITE_EXPIRED`

#### `POST /invites/accept`

`{token}`. Adds the person with the invitation's role; someone already a member keeps their role. **200** the same shape as the preview. **Errors:** as the preview, plus `403 INVITE_EMAIL_MISMATCH` when the person is signed in with a different address.

### Business, members, invitations and activity

Scope headers. These act on the business the headers name.

**Business:**

```text
{
  id, name, business_type, plan, status,         // status: active | suspended
  created_at,
  reply_target_hours,                            // tickets needing a reply longer than this are overdue
  auto_close_hours,                              // open tickets close after this long without activity (v2); 0 = never
  limits: {bots, documents_per_bot, members, replies_per_month, tokens_per_month,
           web_search, web_searches_per_month,
           image_input},                    // the plan's, with overrides; 0 = unlimited; web_search and image_input are on or off
  limit_overrides: {…},                          // only what a platform admin overrode
  usage: {bots, members, replies_this_month, tokens_this_month},   // members includes pending invitations
  balance,                                       // USD; see GET /billing
  deleted_at?                                    // only on deleted businesses, which only platform admins see
}
```

#### `GET /tenant`

`members.read`. **200** the Business.

#### `PATCH /tenant`

`business.write`. Send any of these; leave out what doesn't change:
- `name`: 1–80 characters.
- `business_type`.
- `reply_target_hours`: 1–720.
- `auto_close_hours` (v2): 0 (never, the default) to 2160. Open tickets without a channel, and those of channel types without a time, close after this many hours without activity; see [Tickets](#tickets).

Changing the type changes the defaults for new bots, not saved bots. **200** the Business.

#### `POST /tenant/leave`

`members.read`. Removes the caller's own membership. **204**. **Errors:** `409 LAST_OWNER`.

#### `GET /members`

`members.read`. **200** `{data: [{user_id, email, name, role, joined_at}]}`, owners first.

#### `PATCH /members/{user_id}`

`members.write`. `{role}`: `owner`, `admin`, `editor`, `agent` or `viewer`. Changing an owner, or making someone an owner, needs `owners.manage`. **200** the member.

**Errors:**
- `403 FORBIDDEN`
- `404 MEMBER_NOT_FOUND`
- `409 LAST_OWNER`

#### `DELETE /members/{user_id}`

`members.write`; removing an owner needs `owners.manage`. **204**. **Errors:** as above.

#### `GET /invites`

`members.read`. **200** `{data: [{id, email, role, status, invited_by, expires_at, created_at}]}`, pending invitations newest first, without tokens.

#### `POST /invites`

`members.write`. `{email, role}`; inviting an owner needs `owners.manage`. Inviting an address again replaces its pending invitation. An invitation works once, for 7 days, and only for the invited address.

**201** `{id, email, role, status, invited_by, expires_at, created_at, token, link?, emailed}`: the invitation with its one-time `token`, `link` when the API's `DASHBOARD_URL` is set, and `emailed`, whether the link was emailed through Supabase Auth. A failed email doesn't fail the invitation. `GET /invites` never returns `token`, `link` or `emailed`. See [Work a dashboard does itself](#work-a-dashboard-does-itself).

**Errors:**
- `403 FORBIDDEN`
- `403 PLAN_LIMIT_REACHED` (`limit: "members"`)
- `409 ALREADY_MEMBER`

#### `DELETE /invites/{id}`

`members.write`. Cancels a pending invitation (`inv_…`). **204**. **Errors:** `404 INVITE_NOT_FOUND`.

#### `GET /audit`

`audit.read`. **200** `{data: [{id, actor, actor_email, action, target, target_email, details, created_at}]}`: the latest 100 events, newest first. `actor_email` and `target_email` are the emails the people had when the event happened; they don't change if an account is later deleted or its email changes.
- `actor` is a user ID, or `service` for the admin key.
- `action` is a string such as `member.role_changed`, `invite.created`, `api_key.created`, `bot.created` or `business.updated`.
- The log covers members, invitations, roles, bots, API keys, plans and business details, not conversations or documents.

#### Deleting a business

An owner asks platform admins to delete the business; a platform admin approves (which deletes it) or rejects the request. A deleted business can't be reached by anyone, its chat API keys stop working, and it leaves its members' `GET /me`. A platform admin can restore it for 30 days; after that every record, knowledge file and vector it had is erased. The `default` business can't be deleted.

**Deletion request:**

```text
{
  id,                       // dlr_…
  tenant_id, tenant_name,
  requested_by, requested_by_email, reason,
  status,                   // pending | approved | rejected | cancelled
  reviewed_by?, review_note?, reviewed_at?,
  created_at
}
```

#### `GET /tenant/deletion-request` (v2)

`members.read`. **200** the business's latest deletion request, so a settings page can show it pending, or rejected with the platform's note. **Errors:** `404 DELETION_REQUEST_NOT_FOUND` when there was none.

#### `POST /tenant/deletion-request` (v2)

`business.delete` (owners). `{reason?}`, at most 1000 characters; the body may be left out. **201** the Deletion request. Recorded as `business.deletion_requested`.

**Errors:**
- `403 FORBIDDEN`
- `409 DELETION_REQUEST_PENDING`: one is already pending.
- `409 TENANT_PROTECTED`: the `default` business.

#### `DELETE /tenant/deletion-request` (v2)

`business.delete`. Withdraws the pending request. **200** the request, `cancelled`. **Errors:** `404 DELETION_REQUEST_NOT_FOUND`.

### Bots and chat API keys

Scope headers; these act on the business. With the admin key, the endpoints cover every business, and the body names `tenant_id`.

#### `GET /bots`

`bot.read`. **200** `{data: [{tenant_id, id, name, kb_version, created_at}]}`, oldest first. `kb_version` increases whenever the bot's knowledge base changes.

#### `POST /bots`

`bots.create`. `{bot_id, name}`: `bot_id` follows the scope ID rule, and `name` is 1–80 characters. The new bot has an empty knowledge base and starts from the business type's assistant. **201** the bot.

**Errors:**
- `409 BOT_EXISTS`
- `403 PLAN_LIMIT_REACHED` (`limit: "bots"`)

#### `GET /api-keys`

`integrations.read`. **200** `{data: [{id, name, tenant_id, bot_id, key_prefix, channel_id?, status, created_at, last_used_at?}]}`, newest first, without secrets. `status` is `active` or `revoked`; `channel_id` names the channel the key is bound to.

#### `POST /api-keys`

`integrations.write`. `{bot_id, name, channel_id?}`. **201** the key, with the secret in `key` (`tpx_` plus 48 hex characters). The secret is returned only this once, so show it with a copy button and a warning. The key reaches only that bot's conversations.

`channel_id` (v2) binds the key to one of the bot's [channels](#channels-v2): the conversations it starts, and their tickets, are marked with the channel, and the key stops working while the channel is off. Issue one key per channel, for example one for the Discord bot and one for the website widget. A binding can't be changed; issue a new key.

**Errors:** `404 BOT_NOT_FOUND`, `404 CHANNEL_NOT_FOUND`.

#### `DELETE /api-keys/{id}`

`integrations.write`. Revokes the key (`key_…`); it stops working everywhere within a minute. **204**. **Errors:** `404 KEY_NOT_FOUND`.

### Profile images (v2)

Users, businesses and bots can have a picture. Responses carry its public URL, and leave the field out when there is none: `avatar_url` on the person in `GET /me`, on `GET /members` and on each bot in `GET /bots` and in `GET /me` memberships; `logo_url` on the business in `GET /tenant`, platform business lists and `GET /me` memberships. A URL changes whenever the picture does, so it is safe to cache for a long time.

| Method | Path | Access | Does |
| --- | --- | --- | --- |
| `PUT` / `DELETE` | `/me/avatar` | account | The signed-in person's own picture |
| `PUT` / `DELETE` | `/tenant/logo` | `business.write` | The business's logo |
| `PUT` / `DELETE` | `/bots/{id}/avatar` | `bot.write` | A bot's picture, in the requesting business |

`PUT` takes a PNG, JPEG or WebP image of 16-4096 pixels per side, up to `AVATAR_MAX_BYTES` (512 KiB unless configured), as `multipart/form-data` with the file in a field named `file`, or as the raw body with an `image/png`, `image/jpeg` or `image/webp` content type. The file type is read from the bytes. **200** `{avatar_url}` or `{logo_url}`, the new public URL. `DELETE` removes the file and answers **200** with the field `null`.

**Errors:** `400 INVALID_REQUEST` (no file), `400 INVALID_IMAGE` (unreadable, or a size out of range), `413 IMAGE_TOO_LARGE`, `415 UNSUPPORTED_IMAGE_TYPE` (including SVG and GIF), `404 BOT_NOT_FOUND`, `404 TENANT_NOT_FOUND`, `404 USER_NOT_FOUND` (call `GET /me` once first), `502 STORAGE_ERROR`, `503 NOT_CONFIGURED` (the server has no public bucket).

### Customers (v2)

Scope headers; these act on the bot. A customer is a person the bot talks to, known by their **contacts**: an email, a phone number, a Discord ID, or their user ID on any other platform. Integrations identify them through the chat API (`PUT /customer`) and start their conversations with `customer_id`; staff add and edit them here. A conversation started for a customer, and the tickets opened for it, carry `customer_id`, so the team sees who a ticket is from. Customers belong to one bot: another bot, or business, never sees them.

**Customer:**

```text
{
  id,                                      // cus_…
  tenant_id, bot_id,
  name,
  contacts: [{ type, value, label?, primary }],   // see below; in the order they were added
  metadata,                                // a JSON object you keep about them, up to 4 KB
  first_seen_at, last_seen_at,             // last_seen_at moves on PUT /customer and when a conversation is started for them
  conversations, tickets, open_tickets,    // counts
  created_at, updated_at
}
```

Fields of `POST` and `PATCH`:

| Field | Rules |
| --- | --- |
| `name` | Up to 120 characters; whitespace is collapsed. |
| `contacts` | Up to 20 contacts (below). On `PATCH` the list replaces all of the customer's contacts; `[]` removes them. |
| `metadata` | A JSON object of up to 4 KB. On `PATCH` it replaces the stored object. |

A customer needs a name or at least one contact. On `PATCH`, fields left out keep their value.

**Contacts.** Each is `{type, value, label?, primary?}`:
- `type` is any lowercase word of 2–32 letters, digits, hyphens or underscores, starting with a letter. Use `email` and `phone` for those, and a platform's name for its user IDs, such as `discord`, `telegram`, `whatsapp` or `slack`; use `app` or any word you like for your own user ID.
- `value` is 1–254 characters. An `email` is lowercased and must be an address such as `ann@example.com`. A `phone` loses spaces, dashes, dots and parentheses and must be 5–20 digits, optionally starting with `+`. Other values are stored as sent, case included.
- `label` is up to 60 characters of free text, such as "work".
- `primary` marks the customer's main contact of its type. Mark at most one per type; the first of a type is primary when none is marked. A customer may have several contacts of a type, such as two emails.
- A contact belongs to one customer of the bot: the same `type` and `value` can't be on two of them (`409 CUSTOMER_EXISTS`), but another bot or business may use it. Deleting a customer frees their contacts.

#### `GET /customers`

`customers.read`. Query: `q` (matches the start of the name or of any contact's value, up to 100 characters), `limit` (1–200, default 50), `cursor`. **200** `{data: [Customer], next_cursor?}`, most recently seen first. Pass `next_cursor` as `cursor` for the next page.

#### `POST /customers`

`customers.write`. **201** the customer.

**Errors:**
- `400 INVALID_REQUEST`
- `409 CUSTOMER_EXISTS`: another customer of the bot already has one of the contacts.

#### `GET /customers/{id}`

`customers.read`. **200** the customer plus `recent_conversations: [{id, created_at, updated_at}]` and `recent_tickets: [{id, subject, status, created_at, updated_at}]`, the latest 10 of each. Use `GET /tickets?customer={id}` for all of their tickets. **Errors:** `404 CUSTOMER_NOT_FOUND`.

#### `PATCH /customers/{id}`

`customers.write`. Any of the fields above, at least one. **200** the customer. **Errors:** as for `POST /customers`, and `404 CUSTOMER_NOT_FOUND`.

#### `DELETE /customers/{id}`

`customers.write`. Deletes the customer and their contacts. Their conversations and tickets keep their `customer_id`, and the contacts can be used again. **204**. **Errors:** `404 CUSTOMER_NOT_FOUND`.

### Custom properties (v2)

Scope headers; these act on the bot. A business defines typed **properties** for one kind of record, its **entity** (`customer`, or `query` for a query type's form with `scope_id` the type), and each record keeps its values in `properties`, an object keyed by the property's `key`. Properties belong to one bot.

**Property:**

```text
{
  id,                          // prp_…
  entity,                      // customer or query
  scope_id?,                   // for entities whose properties are per type; absent otherwise
  key,                         // 1–40 lowercase letters, digits or _, starting with a letter; never changes
  label,                       // 1–60 characters
  description,                 // up to 300 characters
  type,                        // text | long_text | number | boolean | date | select | multi_select | email | phone | url; never changes
  options: [{ value, label }], // select and multi_select only: 1–100, values unique ignoring case
  required,                    // a record must have a value when created, and can't clear it
  sensitive,                   // see below
  sort_order,                  // 0–10000; new properties go last
  created_at, updated_at
}
```

`key` can't be a field records already have (`id`, `name`, `email`, `phone`, `status`, `type`, `metadata`, `properties`, `contacts`, `sku`, `price`, `currency`, `stock`, `url`, `description`, `subject`, `number`, `source` and the like). An entity has up to 50 properties.

**Values.** A record's `properties` is merged on each write: keys you send replace their value, `null` or `""` clears one, keys you leave out keep theirs. Unknown keys are refused. Values are checked and stored as:

| Type | Send | Stored |
| --- | --- | --- |
| `text` | up to 500 characters | whitespace collapsed |
| `long_text` | up to 5,000 characters | trimmed |
| `number` | a number, or text such as `"1,200"` | a number up to 10^15 |
| `boolean` | `true`/`false`, or `"yes"`, `"no"`, `"1"`, `"0"` | `true` or `false` |
| `date` | `YYYY-MM-DD` (a timestamp keeps its date) | `YYYY-MM-DD` |
| `select` | an option's value or label, any case | the option's value |
| `multi_select` | a list, or comma-separated text, of up to 20 options | a list of values |
| `email` | an address | lowercased |
| `phone` | 5–20 digits, optionally `+`, with spaces or punctuation | digits only |
| `url` | an `http` or `https` link, no user name | as sent |

A record's properties are at most 16 KB. Changing a property's options never blocks editing a record that has an old value: only the values sent are checked.

**Sensitive properties** (such as a date of birth) are returned only to members who may edit the record (for customers, `customers.write`). Others get the record without them, with their keys in `masked_properties`, and can't filter by them. They are never given to the assistant or sent in webhooks.

**Filtering.** Listings of records with properties take `property[key]=value` (up to 5), matching the stored value exactly (`select` by value or label, `boolean` as `true`/`false`, `multi_select` when the list contains the option). An empty value finds records without one. `long_text` can't be filtered by.

#### `GET /properties`

`properties.read`. Query: `entity` (required), `scope_id`. **200** `{data: [Property]}` in `sort_order`.

#### `GET /properties/presets`

`properties.read`. Query: `entity` (required), `business_type` (optional; the business's type from `GET /tenant`). **200** `{data: [{entity, key, label, description, type, options, sensitive, business_types}]}`: properties businesses of that type often add. Add one with `POST /properties`.

#### `POST /properties`

`properties.write`. Body: `{entity, key, label, type, options?, description?, required?, sensitive?, sort_order?, scope_id?}`. **201** the property.

**Errors:**
- `400 INVALID_REQUEST`, also when the entity already has 50 properties.
- `409 PROPERTY_EXISTS`: the entity already has a property with this key.

#### `PATCH /properties/{id}`

`properties.write`. Any of `label`, `description`, `options`, `required`, `sensitive`, `sort_order`, at least one. Sending a different `entity`, `scope_id`, `key` or `type` is refused. **200** the property. **Errors:** `400 INVALID_REQUEST`, `404 PROPERTY_NOT_FOUND`.

#### `DELETE /properties/{id}`

`properties.write`. Deletes the property and, in the same transaction, its value from every record, so a property added later with the same key starts empty. **204**. **Errors:** `404 PROPERTY_NOT_FOUND`.

### Queries (v2)

Scope headers; these act on the bot. A **query** is a structured request a customer makes, of one of the bot's **query types**.

**Query type:**

```text
{
  id,                          // qtp_…
  key,                         // 1–40 lowercase letters, digits or _; never changes
  name, description,           // 1–60 and up to 300 characters
  statuses: [{ key, label, category }],   // 2–12; category open | pending | done; at least one open and one done
  default_status,              // where new queries start; not a done status
  visible_roles: [],           // editor, agent, viewer; [] lets every role with queries.read see it. Owners and admins always do
  bot_enabled,                 // the assistant may open queries of this type and report on them
  sort_order, archived,
  open,                        // its queries not done
  created_at, updated_at
}
```

A type's **form** is its custom properties: `POST /properties` with `entity: "query"` and `scope_id` the type's ID ([Custom properties](#custom-properties-v2)). Required fields must be filled in when a query is opened, by the team or the assistant.

**Visibility.** A role a type doesn't list never sees its queries: they are left out of lists and answer `404 QUERY_NOT_FOUND`, exactly like queries that don't exist. Sensitive fields need `queries.write`.

**Query:**

```text
{
  id,                          // qry_…
  reference, number,           // Q-1001, 1001: the bot's own sequence
  type_id, type_name,
  subject,                     // up to 200 characters
  status, status_label, status_category,
  customer_id?, customer_name?,
  conversation_id?, ticket_id?,
  assignee_user_id?, assignee_name?,
  source,                      // dashboard | assistant
  properties, masked_properties?,
  closed_at?,                  // set while its status is done
  created_at, updated_at
}
```

#### `GET /query-types`

`queries.read`. Query: `archived=true` to include archived types. **200** `{data: [QueryType]}`, the types the role may see.

#### `GET /query-types/presets`

`queries.read`. Query: `business_type`. **200** `{data: [{key, name, description, statuses, default_status, fields: [{key, label, type, options, required, sensitive}], business_types}]}`.

#### `POST /query-types`

`queries.manage`. Body: `{key, name, description?, statuses?, default_status?, visible_roles?, bot_enabled?, sort_order?}`; statuses default to New, In progress, Waiting on customer, Resolved and Rejected. A bot has up to 30 types. **201** the type. **Errors:** `400 INVALID_REQUEST`, `409 QUERY_TYPE_EXISTS`.

#### `PATCH /query-types/{id}`

`queries.manage`. Any of the fields above but `key`, and `archived`. A status queries are in can't be removed (`400`); a status moved to another category moves its queries with it. An archived type takes no new queries. **200** the type. **Errors:** `400 INVALID_REQUEST`, `404 QUERY_TYPE_NOT_FOUND`.

#### `DELETE /query-types/{id}`

`queries.manage`. Deletes a type that has no queries, and its form. **204**. **Errors:** `404 QUERY_TYPE_NOT_FOUND`, `409 QUERY_TYPE_IN_USE` (archive it instead).

#### `GET /queries`

`queries.read`. Query: `type`, `status`, `category` (`open`, `pending`, `done`, or `active` for not done), `customer`, `conversation`, `assignee` (a user ID, `me` or `none`), `q` (a reference such as `Q-1042`, or text in the subject or the customer's name), `property[key]=value` (with `type`), `limit`, `cursor`. **200** `{data: [Query], next_cursor?}`, most recently changed first.

#### `POST /queries`

`queries.write`. Body: `{type_id, subject?, status?, customer_id?, conversation_id?, ticket_id?, assignee_user_id?, properties?, note?}`. A conversation brings its customer. The assignee must be a member with `queries.write` who may see the type. **201** the query. **Errors:** `400 INVALID_REQUEST`, `404 QUERY_TYPE_NOT_FOUND`.

#### `GET /queries/{id}`

`queries.read`. **200** the query. **Errors:** `404 QUERY_NOT_FOUND`.

#### `PATCH /queries/{id}`

`queries.write`. Any of `subject`, `status`, `customer_id` and `ticket_id` (`""` clears), `assignee_user_id` (`""` unassigns), `properties` (merged; a required field can't be cleared), `note` (added to the history). The type and the conversation can't change. **200** the query. **Errors:** `400 INVALID_REQUEST`, `404 QUERY_NOT_FOUND`.

#### `DELETE /queries/{id}`

`queries.delete`. **204**. **Errors:** `404 QUERY_NOT_FOUND`.

#### `GET /queries/{id}/events`

`queries.read`. **200** `{data: [{id, kind, from?, to?, note?, actor_type, actor_id?, actor_name?, created_at}]}`, oldest first. `kind` is `created`, `status`, `assigned`, `fields` (`to` lists the keys changed) or `note`; `actor_type` is `member`, `assistant` or `key`.

### Channels (v2)

Scope headers; these act on the bot. A channel is a place the bot talks to customers, such as a Discord server, a website's chat widget or a WhatsApp number. Platform admins keep the catalog of channel types; a business adds channels of an offered type.

Channels tell the team where each ticket came from:
- **Chat API keys.** A key issued with `channel_id` (`POST /api-keys`) marks every conversation it starts with the channel, and so every ticket opened for those conversations. `POST /conversations` may name another of the bot's channels instead.
- **Dashboard tickets.** `POST /tickets` and `PATCH /tickets/{id}` set `channel_id` directly.
- **Turning a channel off.** A channel switched off by its business (`enabled: false`) or by a platform admin (`disabled_by_platform`) stops the chat API keys bound to it, with `403 CHANNEL_DISABLED`, until it is back on. Its tickets keep their channel.

Platform admins' changes show on the business's dashboard at once, since both read the same channels:
- **A type marked upcoming** is listed by `GET /channel-types` with `offered: false, upcoming: true`. Show it as "Upcoming". Adding a channel of it, or moving a channel to it, answers `400 CHANNEL_TYPE_NOT_ALLOWED`.
- **A hidden type** drops out of `GET /channel-types`, unless one of the bot's channels uses it (then `offered: false`).
- In both cases, channels already of the type keep working and can still be changed, as long as `type` stays the same.
- **A type's new label or `auto_close_hours`** shows in its channels' `type_label` and `effective_auto_close_hours`.
- **A channel turned off by a platform admin** has `disabled_by_platform: true` and `active: false`, and its chat API keys answer `403 CHANNEL_DISABLED`. The business can't turn it back on (`enabled: true` leaves it off), so show it as "Turned off by the platform" rather than offering the switch.

Adding, changing and deleting a channel are recorded in the business's activity log as `channel.create`, `channel.update` and `channel.delete`.

**Channel:**

```text
{
  id,                                      // chn_…
  tenant_id, bot_id,
  type, type_label,                        // a type from GET /channel-types, e.g. discord / "Discord"
  name, description,                       // name is unique among the bot's channels
  external_id,                             // the platform's own ID, e.g. a Discord server ID; free text
  enabled,                                 // the business's switch
  disabled_by_platform,                    // a platform admin's switch
  active,                                  // enabled and not disabled_by_platform: its keys work
  open_tickets, tickets,                   // tickets from the channel
  api_keys,                                // active chat API keys bound to it
  auto_close_hours,                        // null: the channel type's, else the business's; 0 = never
  effective_auto_close_hours,              // what applies; 0 = never
  created_at, updated_at
}
```

#### `GET /channel-types`

`channels.read`. **200** `{data: [{id, label, description, icon, offered, upcoming?}]}`, in the platform's order: the types the bot may add channels of, any type a platform admin marked upcoming (`offered: false`, `upcoming: true`; show it as "Upcoming" and don't offer it), plus any hidden type one of its channels still uses (`offered: false`; don't offer it for new channels). `upcoming` is absent on APIs that predate the status.

#### `GET /channels`

`channels.read`. **200** `{data: [Channel]}`, oldest first. Use it for a channel filter on the Tickets page and a channel picker when issuing a chat API key.

#### `POST /channels`

`channels.write`.

| Field | Rules |
| --- | --- |
| `type` | Required. An offered `id` from `GET /channel-types`. |
| `name` | Required. 1–80 characters, unique among the bot's channels. |
| `description` | Up to 300 characters. |
| `external_id` | Up to 128 characters: the platform's own ID for it. |
| `enabled` | Default `true`. |
| `auto_close_hours` | 0 (never) to 2160, or `null` (the default) to use the channel type's time, else the business's. Open tickets from the channel close after this many hours without activity. In `PATCH`, `null` clears it and leaving it out keeps it. |

**201** the channel.

**Errors:**
- `400 INVALID_REQUEST`
- `400 CHANNEL_TYPE_NOT_ALLOWED`: the type isn't offered.
- `409 CHANNEL_EXISTS`: the bot has a channel with this name.

#### `GET /channels/{id}`

`channels.read`. **200** the channel. **Errors:** `404 CHANNEL_NOT_FOUND`.

#### `PATCH /channels/{id}`

`channels.write`. Any of the fields of `POST /channels`. Moving a channel to another `type` needs that type to be offered; a channel can keep a type that is now upcoming or hidden. `enabled: false` stops its chat API keys at once; it can't undo a platform admin's `disabled_by_platform`. **200** the channel.

**Errors:** as for `POST /channels`, and `404 CHANNEL_NOT_FOUND`.

#### `DELETE /channels/{id}`

`channels.write`. Deletes the channel. Its conversations and tickets keep their `channel_id` and still show its name and type. **204**.

**Errors:**
- `404 CHANNEL_NOT_FOUND`
- `409 CHANNEL_IN_USE`: active chat API keys are bound to it. Revoke them first.

Deleting a `shopify` channel also removes the store's access token and, unless another of the business's bots holds the store, uninstalls the app from the store.

#### `POST /channels/connect` (v2)

`channels.write`. Starts connecting a channel through its platform's own sign-in. Only `shopify` is connected this way; other types are added with `POST /channels`.

| Field | Rules |
| --- | --- |
| `type` | Required. `shopify`. |
| `account` | Required. The store: `your-store`, `your-store.myshopify.com`, or its admin URL `https://admin.shopify.com/store/your-store`. |
| `return_to` | Required. The dashboard page to come back to, on an origin in `DASHBOARD_URL` or `CORS_ALLOWED_ORIGINS`. Its own query is kept. |

**200** `{url}`: Shopify's install page for the store. Send the browser there. The connect expires after 10 minutes and works once.

After the owner approves, Shopify sends the browser to the API's callback (`GET /channels/connect/shopify/callback`, not called by the dashboard), which adds the bot's `shopify` channel, named after the store, with `external_id` set to `your-store.myshopify.com`. Connecting a store the bot already has turns its channel back on rather than adding another. The browser then lands on `return_to` with:

- `connected=shopify&channel_id=chn_…&type=shopify` on success, or
- `connect_error=<code>&type=shopify`, with these codes:

| `connect_error` | Meaning |
| --- | --- |
| `denied` | The owner didn't approve the install. |
| `expired` | More than 10 minutes passed, or the link was already used. Start again. |
| `invalid` | The redirect wasn't Shopify's, or named another store. Start again. |
| `store_connected_elsewhere` | Another business has connected this store. |
| `scopes_missing` | The owner approved fewer permissions than the tools need. |
| `failed` | Shopify or the API failed; try again. |

An unknown or expired connect lands on `{DASHBOARD_URL}/integrations/guides` with `connect_error=invalid`.

When the app is uninstalled from the store, the store's channels are turned off (`enabled: false`), and the bot's Shopify tools become unavailable until it is connected again. The activity log records `channel.connect_started`, `channel.connect` and `channel.disconnect`.

**Errors:**
- `400 INVALID_REQUEST`: a field is missing, the store address isn't a myshopify.com store, or `return_to` isn't a dashboard page.
- `400 CHANNEL_CONNECT_UNSUPPORTED`: the type isn't connected through its platform; use `POST /channels`.
- `400 CHANNEL_TYPE_NOT_ALLOWED`: a platform admin marked the type upcoming or hid it.
- `503 CHANNEL_CONNECT_UNAVAILABLE`: the server has no Shopify app configured.

### Bot configuration (workspace)

Scope headers; these act on the bot. Customer chat uses the saved configuration from the next message, with no separate publish step.

#### `GET /workspace`

`bot.read`. **200** `{name, bot, revision, updated_at, history, defaults, modelSelection}`:
- `modelSelection`: always `platform`: the platform chooses each reply's model and how every bot answers. Hide the model and model-setting controls: `bot.model`, `temperature`, `maxTokens`, `topK`, `routing` and `knowledge.ragMode`, `maxSubqueries` and `verify` are platform-managed (see `PUT /workspace`).
- `bot`: the configuration below.
- `revision`: 0 until the first save. Send it back when saving.
- `history`: the 30 latest saved versions, as `{id, savedAt, bot}`, for a "restore version" picker. Restoring only fills the form; saving applies it.
- `defaults`: `{name, bot}`, the business type's starting configuration, for "reset to defaults".

#### `PUT /workspace`

`bot.write`. `{name, bot, revision}`. `name` (1–80 characters) is the bot's display name. Fields of `bot` are camelCase.

**Platform-managed fields.** `model`, `temperature`, `maxTokens`, `topK`, `routing`, and `knowledge.ragMode`, `knowledge.maxSubqueries` and `knowledge.verify` belong to the platform. A save by a business keeps their saved values and drops what it sent, without an error, so older dashboards keep working; only a platform admin or the admin key changes them. Replies don't use them either: every bot answers with the platform's `CHAT_TEMPERATURE`, `CHAT_MAX_TOKENS`, `CHAT_TOP_K`, `KNOWLEDGE_RAG_MODE` and `KNOWLEDGE_VERIFY`, and the model routing picks from the platform catalog.

| Field | Rules |
| --- | --- |
| `name` | 1–80 characters. The assistant's name, filled into templates as `{{assistant_name}}`. |
| `promptTemplateId` | A template `id` from `GET /prompt-templates`. Choosing one clears `prompt`. |
| `promptVariables` | `{key: value}` for the template's variables; unknown keys are dropped. Values become one line, capped at the variable's `max_length`. |
| `prompt` | Read-only. The system prompt of a bot saved before templates, used until it picks a template. Send it back as loaded, or empty. |
| `model` | Platform-managed. Kept but ignored: the platform's default model answers unless routing picks another. |
| `temperature` | Platform-managed; 0–2 when sent. |
| `maxTokens` | Platform-managed; 1–32768 when sent. |
| `ragEnabled` | Answer from the knowledge base. |
| `topK` | Platform-managed; 1–20 when sent. |
| `toolsEnabled` | Let the model call `tools`. Needs a model with `supports_tools`. |
| `tools` | Up to 20 unique tool names from `GET /tools`. A reply leaves out any that is unavailable (`available: false`, such as a Shopify tool with no store connected) or no longer exists, and answers with the rest; show those in the picker with a way to remove them. |
| `webSearch` | `{enabled, mode, maxResults, depth, topic, timeRange, includeDomains, excludeDomains}`; see [Web search](../README.md#web-search). Needs `ragEnabled`. `mode` is `fallback` (default: only when the knowledge base has no confident answer, or when the model finds no answer in passages that matched; the reply is then written again with the web results, and both calls are billed) or `always`; `maxResults` 1–8 (3); `depth` `basic` or `advanced`; `topic` `general` or `news`; `timeRange` `day`, `week`, `month`, `year` or `""`; the domain lists hold up to 50 hostnames such as `docs.example.com`, without `https://` or a path, and a domain covers its subdomains. Missing fields get their defaults. |
| `routing` | Platform-managed and ignored: the platform's `ROUTING_MODE` routes every bot. Every message is classified by built-in rules (`classifier` `jev` is still accepted from older saves and means rules) and answered from the platform catalog's tiers: `fast` for small talk, unclear messages and requests for a person; `balanced` for answers from the knowledge base, follow-ups and tool use; `advanced` for multi-part or comparison questions. Shape when sent: `{mode, classifier, allowedTiers, providerAllowlist, modelPools, fixedModel, maxRequestCostUsd, maxAttempts}`, validated as before. |
| `knowledge` | Optional source rules for the chat API's saved bots (omit to keep the earlier behavior; the playground ignores it; needs `ragEnabled`): `{policy, ragMode, maxSubqueries, verify}`; a business sets only `policy`. `policy` is `strict_kb` (default once `knowledge` is set: answer only from the knowledge base and tools), `kb_plus_general` (also answer plainly general questions from the model's own knowledge, labelled as general) or `kb_general_external` (also use the bot's web search for general or current questions). Questions about the business, or about a customer's own order or account, never leave the knowledge base and tools, whatever the policy. The server's `KNOWLEDGE_POLICY_MAX` caps the policy. `ragMode` (platform-managed; `KNOWLEDGE_RAG_MODE`, default `auto`) is `auto`, `simple`, `standard` or `complex`; a message with two or more independent questions is retrieved question by question so each finds evidence. `maxSubqueries` 0–5 (0 means 3). `verify` (platform-managed; `KNOWLEDGE_VERIFY`, default `enforce`) is `off`, `shadow` or `enforce`: it checks each answered reply for prices, percentages, durations, links, emails or phone numbers that appear in no passage, tool result or customer message, and for actions reported as done that no successful tool call confirms. `shadow` only records; `enforce` regenerates once, replaces what it cannot fix with a no-answer, and says which questions found no evidence. |

**200** the saved workspace (a new `revision`). Every save adds a version when `bot` changed.

**Errors:**

| Code | Meaning |
| --- | --- |
| `409 WORKSPACE_CONFLICT` | Someone saved since you loaded. Reload, then apply the change again. |
| `400 MODEL_NOT_ALLOWED` | The platform's default model can't call tools while tools are on. |
| `400 PROMPT_TEMPLATE_NOT_ALLOWED` | The template isn't offered to this business type. |
| `400 INVALID_PROMPT_VARIABLES` | A required variable is empty. |
| `400 PROMPT_NOT_EDITABLE` | `prompt` was changed. |
| `400 INVALID_REQUEST` | A field breaks the rules above. |
| `400 WEB_SEARCH_NOT_CONFIGURED` | `webSearch.enabled` was turned on, but the server has no search provider key (`TAVILY_API_KEY`, or `OPENROUTER_API_KEY` with `WEB_SEARCH_PROVIDER=openrouter`). |
| `403 PLAN_LIMIT_REACHED` | `webSearch.enabled` was turned on, but the business's plan doesn't include web search (`limit: "web_search"`). |

### Models and prompt templates

Platform admins own the catalog; businesses only pick from it.

#### `GET /models`

`bot.read`. **200** `{models: [...], selection}`. `selection` is always `platform` and `models` is always empty: the platform chooses every reply's model, so a business has nothing to choose. Don't show a model picker; the endpoint stays for older dashboards. (When `models` is filled, each is `{id, label, description, tier, input_price_per_mtok, output_price_per_mtok, currency, context_tokens, max_output_tokens, supports_tools, is_default, offered}`.)
- `id` is an OpenRouter model ID, such as `google/gemini-3.1-flash-lite`.
- `input_price_per_mtok` and `output_price_per_mtok` are what the business pays per million tokens, in `currency` (`USD`): the model's OpenRouter price plus the platform's fee and commission, shown only as the total. For `openai/gpt-4o` at 2.50/10.00 USD with a 5.5% fee and 20% commission, they are `3.1375` and `12.55`.
- `tier` is `economy`, `standard` or `premium`, by the model's OpenRouter output price.
- The list has the active models, plus the bot's current model if it is hidden. That one has `offered: false`: keep it selectable only while it is still selected.

#### `GET /prompt-templates`

`bot.read`. **200** `{templates: [{id, name, description, body, variables, is_default, offered}]}`. It lists the active templates for the business's type, plus the bot's current one if it is no longer offered (`offered: false`).
- **Variables.** Each is `{key, label, help?, required, max_length}`: build a form field from each one.
- **Built-in values.** `business_name` and `assistant_name` are always filled in by the API, so don't ask for them.
- **Preview.** To show the rendered prompt, apply the rules below to `body` in the browser:
  - `{{key}}` becomes the key's value; unknown keys become empty.
  - `{{#key}}…{{/key}}` keeps its text only when the key has a value. Sections don't nest.
  - The API puts its own fixed instructions before the rendered template.

### Knowledge base

Scope headers; these act on the bot. Besides the common errors, they can return:
- `404 DOCUMENT_NOT_FOUND`
- `409 DOCUMENT_BUSY`: another request is processing the document.
- `502 STORAGE_ERROR`: R2, Vectorize or Workers AI failed.
- `504 TIMEOUT`

**Document:**

```text
{
  id, title,
  source_type,                      // manual (article) | file
  source_name?, mime_type?, byte_size,
  status,                           // pending_upload | processing | indexed | failed
  error?,                           // why it failed
  chunk_count, embedded_count, token_count,
  source_url?, knowledge_base_id?, locale?, product?, version?,   // filter metadata
  created_at, updated_at, indexed_at?,
  content?                          // Markdown; only GET /knowledge/documents/{id}
}
```

Progress while processing is `embedded_count / chunk_count`.

#### `GET /knowledge/documents`

`knowledge.read`. Newest first.

| Query | Rules |
| --- | --- |
| `q` | Matches titles and file names. |
| `status` | `pending_upload`, `processing`, `indexed` or `failed`. |
| `limit` | 1–100, default 50. |
| `cursor` | `next_cursor` from the previous page. |

**200** `{data, next_cursor?, total, counts, max_documents, max_file_bytes, accept}`:
- `counts`: documents per status.
- `max_documents`, `max_file_bytes`: the server's limits.
- `accept`: the file extensions uploads accept. Use it for the file picker.

#### `POST /knowledge/documents`

`knowledge.write`. Adds an article and indexes it before responding.

| Field | Rules |
| --- | --- |
| `title` | Required. 1–160 characters. |
| `content` | Required. 1–50000 characters of Markdown. |
| `source_url` | An `http(s)` link, up to 2000 characters, cited with answers drawn from the document. |
| `source_name` | Up to 260 characters: an original file name, for restoring backups. |
| `knowledge_base_id`, `locale`, `product`, `version` | Up to 64 bytes each. Metadata retrieval can filter on. |

**201** the document.

**Errors:**
- `409 DUPLICATE_DOCUMENT` (with `document_id`).
- `409 KNOWLEDGE_BASE_FULL`.
- `403 PLAN_LIMIT_REACHED` (`documents_per_bot`).

#### `GET /knowledge/documents/{id}`

`knowledge.read`. **200** the document with `content`.

#### `PUT /knowledge/documents/{id}`

`knowledge.write`. The same fields as creating one, all optional: omitted fields stay as they are, and an empty `source_url` or metadata field removes it. The document is reindexed, and unchanged passages keep their embeddings. A file's text can be edited once it is indexed. **200** the document.

**Errors:** `409 DUPLICATE_DOCUMENT`.

#### `DELETE /knowledge/documents/{id}`

`knowledge.write`. Deletes the document, its passages, embeddings and files. **204**.

#### `POST /knowledge/documents/{id}/process`

`knowledge.write`. No body. Works for up to about 40 seconds and returns the document with its progress; call it again while `status` is `processing`. If another request is processing the document, it returns the document unchanged. **200** the document.

#### `POST /knowledge/documents/{id}/reindex`

`knowledge.write`. No body. Rebuilds the passages from the stored text; then call `/process` while it is `processing`. **200** the document.
- `?extract=true` reads the uploaded file again. It is `400` for an article.
- `?force=true` re-embeds every passage.

#### `POST /knowledge/uploads`

`knowledge.write`. Registers a file and returns a presigned R2 URL (see [the upload flow](#long-running-work-uploading-and-indexing-knowledge)).

| Field | Rules |
| --- | --- |
| `filename` | Required. Up to 260 characters, no slashes. Ends in `.md`, `.markdown`, `.txt`, `.text`, `.csv`, `.json`, `.html`, `.htm`, `.pdf` or `.docx`. |
| `size` | Required. Bytes: at most 5 MB for text formats, `max_file_bytes` (25 MB by default) for HTML, PDF and Word. |
| `sha256` | Required. 64 lowercase hex characters; the upload must match. |
| `title` | 1–160 characters. Defaults to the file's heading or name. |
| `source_url`, `knowledge_base_id`, `locale`, `product`, `version` | As for articles. |

**201** `{document, url, method: "PUT", headers, expires_at}`. Registering the same unfinished upload again returns a fresh URL.

**Errors:**
- `409 DUPLICATE_DOCUMENT` (with `document_id`; update that document instead).
- `409 KNOWLEDGE_BASE_FULL`.
- `403 PLAN_LIMIT_REACHED`.

#### `POST /knowledge/search`

`knowledge.read`. Runs retrieval the way a reply would (without the cache) and explains it, for a "test retrieval" panel. No answer is generated.
- `query`: required, 1–4000 characters.
- `top_k`: 1–20, default 4.
- `filters`: `{knowledge_base_id?, locale?, product?, version?}`.

**200** `{result, hits, trace}`:
- **`result`:**
  - `query`
  - `confidence`: `high`, `low` or `none`
  - `passages`: `[{id, document_id, title, section, url, content}]`, numbered as the model sees them
  - `sources`, `context_tokens`, `candidates`
  - `fallback`: true when nothing matched closely
  - `degraded`: the stages that failed and were skipped
- **`hits`:** every candidate, in final order: `{id, document_id, title, heading, position, content, keyword_rank, vector_rank, vector_score, fused_score, rerank_score, selected}`.
- **`trace`:**
  - The query and its rewrite.
  - Each stage's ranking.
  - Timings: `rewrite_ms`, `embed_ms`, `dense_ms`, `lexical_ms`, `load_ms`, `rerank_ms`, `retrieval_ms`, `total_ms`.

**Errors:** `502 RETRIEVAL_FAILED`.

### Tools

Scope headers. Tools belong to the business and are shared by its bots; each bot chooses which ones it uses in its configuration (`toolsEnabled`, `tools`). Tools call the business's own HTTP endpoints for real, including in tests.

**Tool:**

```text
{
  name, description,
  parameters,                 // JSON Schema of the arguments
  read_only,                  // false when calling it changes data (label it)
  available,
  unavailable_reason?,        // when available is false; also when a platform admin turned it off
  built_in?,                  // true for a built-in tool (v2); its api fields are empty
  api: {method, url, created_at, updated_at}
}
```

#### Built-in tools (v2)

When the server has a Shopify app configured, `GET /tools` lists two built-in tools before the business's API tools, with `built_in: true` and `read_only: true`. They can't be changed, deleted or replaced, and API tools can't be named `shopify_…` (`400 INVALID_TOOL`). They stay `available: false` ("Connect a Shopify store to this bot.") until the bot has an active `shopify` channel; see [`POST /channels/connect`](#post-channelsconnect-v2).

- `shopify_order_status {order_number, email}`: an order's payment and fulfillment status, items, total and tracking. It answers only when the email matches the order's, so a customer can't read someone else's order by guessing its number.
- `shopify_product_search {query}`: up to five active products, with price, whether they are in stock, and their link.

Every bot also has two query tools, available once a [query type](#queries-v2) has `bot_enabled`:

- `truplexy_open_query {type, subject, fields}`: opens a query of a type the assistant handles, for the customer of the conversation it is answering, and gives the customer its reference. Missing or invalid fields are answered with what to ask for. Up to three per conversation an hour.
- `truplexy_query_status {reference?}`: the latest five queries, or the one named, **of the conversation's customer only** (of the conversation itself when it has no customer): status, subject and non-sensitive fields. Whose queries it reads comes from the conversation the reply is for, never from the model, so a customer can't read another's by guessing a reference; one that isn't theirs answers like one that doesn't exist. Outside a stored conversation (such as a playground run without one) both tools refuse.

Turn them on in the bot's `tools` like any tool, and test them with `POST /tools/{name}/test`. Their calls are recorded like API tools'. When Shopify asks the API to forget a customer, their order lookups are deleted from the recorded calls.

#### `GET /tools`

`tools.read`. **200** `{data: [Tool], database_configured}`, by name.

#### `POST /tools`

`tools.write`. Saves a tool; nothing runs.

| Field | Rules |
| --- | --- |
| `name` | Required. Unique in the business; `^[a-z][a-z0-9_]{0,63}$`. |
| `description` | Required. 1–1000 characters, telling the model when to use it. |
| `method` | Required. `GET`, `POST`, `PUT`, `PATCH` or `DELETE`. |
| `url` | Required. An `https://` URL of up to 2000 characters. `{placeholder}`s may appear after the host; each needs a required string or integer parameter of the same name. |
| `parameters` | A JSON Schema with `type: "object"`, at most 8 KB and 3 levels deep. Keywords allowed: `type`, `description`, `properties`, `required`, `enum`, `items` and `additionalProperties: false`. At most 30 properties per object. Defaults to an empty object schema. |
| `read_only` | Boolean. |

Arguments that don't fill a placeholder go in the query string for `GET` and `DELETE`, and in a JSON body otherwise. **201** the tool.

**Errors:**
- `400 INVALID_TOOL` (`message` says which rule).
- `409 TOOL_EXISTS`.

#### `GET /tools/{name}`

`tools.read`. **200** the tool. **Errors:** `404 TOOL_NOT_FOUND`.

#### `PUT /tools/{name}`

`tools.write`. The full definition. A different `name` renames the tool, but saved bot selections aren't rewritten. **200** the tool.

**Errors:**
- `400 INVALID_TOOL`
- `404 TOOL_NOT_FOUND`
- `409 TOOL_EXISTS`

#### `DELETE /tools/{name}`

`tools.write`. **204**. Past runs stay recorded. **Errors:** `404 TOOL_NOT_FOUND`.

#### `POST /tools/{name}/test`

`tools.write`. `{arguments: {…}}` (send `{"arguments": {}}` for none). Runs the tool for real and records the run.

**200** `{name, arguments, status, output, latency_ms}`. `status` is `ok` or `error`, and a failing tool still returns 200. `output` is what the model would receive, at most 8000 characters.

**Errors:**
- `400 TOOL_UNAVAILABLE`
- `404 TOOL_NOT_FOUND`

### Tickets

Scope headers; these act on the bot. A ticket is a support case, usually for one conversation, and a conversation has at most one open ticket.

**Ticket:**

```text
{
  id, conversation_id?,
  channel?,                                // the conversation's kind: api (chat API) | playground
  channel_id?, channel_name?, channel_type?, // the bot's channel it came from (v2), e.g. "Acme server", discord
  customer_id?,                              // the customer it is from (v2), taken from its conversation
  subject,
  status,                                  // open | closed
  priority,                                // low | normal | high | urgent
  assignee_user_id?, assignee_name?,       // the member it is assigned to
  assignee?,                               // legacy free text set by API callers
  escalated, escalated_at?,                // escalated: a person has the conversation; the AI is silent
  source,                                  // dashboard | customer
  needs_reply, handed_off,
  flags: {needs_reply, escalated, handed_off, unassigned, overdue, reopened},
  last_customer_at?, last_agent_at?,
  first_response_at?, closed_at?, reopen_count,
  summary?, summary_at?,                   // the AI summary a person last generated, and when
  keep_open,                               // true: never closes on its own (v2)
  auto_close_at?,                          // when it closes if nothing happens before (v2)
  auto_closed_at?,                         // when it last closed on its own (v2)
  created_at, updated_at
}
```

**Statuses.**
- `open` while a person still has to act on the ticket; `closed` once it's done. Any other value is `400 INVALID_REQUEST`.
- A ticket moves freely between the two. Reopening a closed ticket (`status: open`) clears `closed_at` and counts in `reopen_count`.

**Automatic changes:**
- A customer message sets `needs_reply`.
- Closing ends escalation, and the assistant answers again.
- **Closing inactive tickets** (v2). An open ticket closes after a number of hours without activity (no change to it and no message in its conversation): its channel's `auto_close_hours`, else its channel type's, else its business's; 0 is never, and nothing closes until one is set. A ticket with `keep_open: true`, and one waiting on the team (escalated or handed off, with the customer having written last), never closes on its own. `auto_close_at` says when it will. Closing on its own ends escalation, adds the internal note "Closed automatically after N hours without activity." and sets `auto_closed_at`; reopening clears it. It sends the same `ticket.updated` events as a person closing it.

**Flags**, for badges and filters:

| Flag | Meaning |
| --- | --- |
| `needs_reply` | The customer wrote after the last reply. |
| `escalated` | The AI is paused for this conversation. |
| `handed_off` | The assistant flagged the conversation for the team. |
| `unassigned` | No one is assigned. |
| `overdue` | It has needed a reply for longer than the business's `reply_target_hours`. |
| `reopened` | It was reopened at least once. |

#### `GET /tickets`

`tickets.read`. Most recently updated first.

| Query | Rules |
| --- | --- |
| `view` | `all` (default), `open` (every open ticket), `needs_reply`, `escalated` or `mine` (the caller's open tickets). |
| `flag` | One of the flags above. |
| `assignee` | `me`, `none`, or a member's user ID. |
| `channel` | A channel `id`, or `none` for tickets without one (v2). |
| `channel_type` | A channel type `id`, such as `discord` (v2). |
| `customer` | A customer `id` (`cus_…`): only tickets from that customer (v2). |
| `status`, `priority` | One value each; `status` is `open` or `closed`. |
| `q` | Up to 200 characters: matches the subject, or a ticket or conversation ID exactly. |
| `limit` | 1–100, default 50. |
| `cursor` | `next_cursor` from the previous page. |

**200** `{data: [Ticket], counts, next_cursor?}`. `counts` is `{needs_reply, escalated, open, all, mine, overdue, unassigned}`, for tab badges.

#### `POST /tickets`

`tickets.write`.

| Field | Rules |
| --- | --- |
| `conversation_id` | A conversation of this bot (chat API or playground). |
| `subject` | Up to 200 characters. Required without `conversation_id`; otherwise defaults to the conversation's title. |
| `priority` | Default `normal`. |
| `escalated` | `true` takes the conversation over at once. |
| `channel_id` | One of the bot's channels (v2). With `conversation_id`, defaults to the conversation's channel. |
| `keep_open` | `true` stops the ticket closing on its own (v2). |

Opening a ticket for a flagged conversation clears the flag. To take over a conversation from `GET /handoffs`, send its `conversation_id` with `escalated: true`. **201** the ticket.

**Errors:**
- `404 CONVERSATION_NOT_FOUND`
- `404 CHANNEL_NOT_FOUND`
- `409 TICKET_EXISTS` (the conversation already has an open ticket; `message` names it)

#### `GET /tickets/{id}`

`tickets.read`. **200** the ticket plus:
- **`messages`:** the conversation's latest 200 messages, oldest first. Each is `{id, role, content, author, agent?, via?, status?, error?, model?, usage?, attachments?, created_at}`. `attachments` (image input) are the customer's pictures, as in [the attachment object](#the-attachment-object); a ticket page can show them inline.
  - `author` is `customer`, `assistant` or `agent`.
  - `via: "api"` marks a reply sent from the integration's platform.
  - `usage` is `{input_tokens, output_tokens, total_tokens, cost}` for generated replies.
- **`replies`:** the ticket's replies and internal notes, `{id, kind, author, content, message_id?, created_at}`, where `kind` is `reply` or `note`.
- **`usage`:** the AI cost of the whole conversation, with `replies` counting the generated replies.

**Errors:** `404 TICKET_NOT_FOUND`.

#### `PATCH /tickets/{id}`

`tickets.write`. Send any of:

| Field | Rules |
| --- | --- |
| `subject` | 1–200 characters. |
| `status` | `open` or `closed`. |
| `priority` | `low`, `normal`, `high` or `urgent`. |
| `assignee_user_id` | A member whose role has `tickets.write` (agent or above); `""` unassigns. Use `GET /members` for the picker. |
| `escalated` | `true` takes the conversation over (reopening a closed ticket); `false` hands it back to the AI. Can't be combined with `status: closed`. Integrations calling with a chat key use [`POST /conversations/{id}/resume`](#post-conversationsidresume) instead. |
| `assignee` | Legacy free text, up to 64 characters. |
| `channel_id` | One of the bot's channels; `""` clears it (v2). |
| `keep_open` | `true` stops the ticket closing on its own; `false` lets it again (v2). |

**200** the ticket.

**Errors:**
- `400 INVALID_ASSIGNEE`
- `404 TICKET_NOT_FOUND`
- `404 CHANNEL_NOT_FOUND`
- `409 TICKET_EXISTS` (reopening would make a second open ticket for the conversation)

#### `DELETE /tickets/{id}`

`tickets.delete`. Deletes the ticket with its replies and notes. The conversation keeps its messages, and deleting an escalated ticket hands the conversation back to the AI. **204**.

#### `POST /tickets/{id}/replies`

`tickets.write`.

| Field | Rules |
| --- | --- |
| `kind` | `reply` (default) reaches the customer; `note` stays internal. |
| `content` | Required. 1–8000 characters. |
| `status` | Optional. Also sets the ticket's status, `open` or `closed`, for example `closed` with a final reply. |

The signed-in person is recorded as the author; any `author` sent is replaced. A reply is added to the conversation (`author: "agent"`), clears the handoff flag, sets `first_response_at` if unset, and goes to the bot's webhook and live topics. **201** `{reply, ticket}`.

#### `POST /tickets/{id}/summary`

`tickets.write`, v2 only. No body. Generates an AI summary of the ticket's conversation and team notes for the person taking it over, and stores it on the ticket. Every later read returns it as `summary`, with `summary_at` for when it was generated. The summary is a few short bullets: the issue, the details the customer gave, what was already tried or answered, what is still open, and the customer's mood when they stated it. Secrets are written as `[redacted]`.

Nothing is generated automatically. The dashboard shows a **Generate summary** button on escalated tickets, and **Regenerate** once `summary` is set. Calling it again replaces the summary; a failure keeps the one there was. The summary covers the conversation up to `summary_at`, so show a hint such as "New messages since this summary" when `last_customer_at` or `last_agent_at` is later. Generating it doesn't change `updated_at`, so the ticket keeps its place in the list.

**Billing.** A summary is billed like an AI reply: its tokens count toward the month's tokens and, past them, are paid from the balance, and it counts as one reply toward `replies_per_month`. It is written by the `RAG_REWRITE_MODEL` model.

**200** the ticket, with `summary` and `summary_at`. The bot's live topic gets `ticket.updated`; the customer's topic doesn't.

**Errors:**
- `400 NO_CONVERSATION` (a ticket opened without a conversation)
- `404 TICKET_NOT_FOUND`
- `429 PLAN_LIMIT_REACHED` (the month's replies or tokens are used up and the balance is empty)
- `429 LLM_RATE_LIMITED`, `502 LLM_PROVIDER_ERROR`, `503 LLM_NOT_CONFIGURED`, `504 LLM_TIMEOUT`

#### `GET /handoffs`

`tickets.read`. **200** `{data: [{conversation_id, channel, title, updated_at}]}`: the latest 50 conversations the assistant flagged for the team, most recent first, that have no open ticket. The assistant keeps replying in them until someone takes one over.

### Live updates

#### `GET /realtime`

`tickets.read`. **200** `{url, publishable_key, bot_topic, events}`. **Errors:** `503 REALTIME_NOT_CONFIGURED`. See [Live updates](#live-updates) for how to subscribe.

#### `POST /realtime/token`

Chat key. Optional body `{conversation_id}`. **200** `{url, publishable_key, bot_topic, conversation_topic?, events}`.

**Errors:**
- `400 INVALID_REQUEST`
- `503 REALTIME_NOT_CONFIGURED`

### Webhook

Scope headers; these act on the bot. Each bot has one webhook, which tells its integration (for example a Discord bot) what the team did.

**Webhook:**

```text
{
  configured,                 // false: the bot has no webhook yet (only from GET)
  url, enabled,
  secret?,                    // whsec_…, only when just created or replaced: show it once
  secret_hint,                // whsec_…abcd
  events,                     // ["message.created", "ticket.updated"]
  last_delivery?: {event, ok, status?, error?, at},
  created_at, updated_at
}
```

#### `GET /webhook`

`integrations.read`. **200** the webhook, without its secret. A bot without one gets `{configured: false, url: "", enabled: false, secret_hint: "", events, created_at: "", updated_at: ""}`: show the empty form. (Before 2026-10-25 this answered `404 WEBHOOK_NOT_FOUND`; keep treating that as the empty form too.)

#### `PUT /webhook`

`integrations.write`. `{url, enabled?}`.
- `url` is `https://`, up to 2000 characters, with no user name, password or `#` fragment.
- `enabled` defaults to `true`; `false` pauses deliveries.
- The first save creates and returns the secret; later saves keep it.

**200** the webhook. **Errors:** `400 INVALID_REQUEST` (`message` names the URL rule).

#### `DELETE /webhook`

`integrations.write`. **204**. **Errors:** `404 WEBHOOK_NOT_FOUND`.

#### `POST /webhook/secret`

`integrations.write`. Replaces the signing secret. **200** the webhook with the new `secret`.

#### `POST /webhook/test`

`integrations.write`. Sends a `ping`, even while paused. **200** `{event, ok, status?, error?, at}`; check `ok`.

**What is delivered.**
- **Events:**
  - `message.created`: a person replied to a ticket of a chat API conversation.
  - `ticket.updated`: such a ticket was opened, or its status or escalation changed.
- **Not delivered:** notes, playground conversations, and anything the integration did itself.
- **Format:** each delivery is `{id, type, created_at, data}`, with `data` as in the [live events](#live-updates).
- **Headers:**
  - `X-Truplexy-Event`
  - `X-Truplexy-Delivery` (the event ID; a retry reuses it)
  - `X-Truplexy-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`
- **Receiver:** the integration must answer 2xx within 2.5 seconds. After no answer, a `429` or a `5xx`, the event is sent once more with the same delivery ID. A failed delivery shows in `last_delivery` and never undoes the team's change.

To verify a delivery, compute the HMAC over the raw body, compare it in constant time, and reject a `t` more than 5 minutes old:

```js
import crypto from "node:crypto";

export function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((part) => part.split("=")));
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  return fresh && v1?.length === expected.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}
```

### Stats

#### `GET /usage/summary`

`usage.read`. The bot's model usage and answer quality. `from` and `to` are inclusive UTC days (`YYYY-MM-DD`). By default the range is the last 30 days, at most 366.

**200**:

```text
{
  from, to, requests, input_tokens, output_tokens, total_tokens,
  estimated_cost,                 // USD billed: OpenRouter's cost plus each model's fee and commission
  avg_latency_ms,
  by_day:   [{date, requests, input_tokens, output_tokens, total_tokens, estimated_cost}],   // every day, zeros included
  by_model: [{model, requests, total_tokens, estimated_cost, avg_latency_ms}],               // top 5
  tool_calls: {total, errors, avg_latency_ms, by_tool: [{name, calls, errors, avg_latency_ms}]},
  rag: {requests, no_answer_rate, handoff_rate, clarification_rate, cache_hit_rate,
        rewrite_rate, degraded_rate, avg_latency_ms, avg_retrieval_ms},  // rates from 0 to 1
  web_searches: {searches, with_results, errors, skipped, avg_latency_ms}   // searches that ran count against the plan (v2)
}
```

**Errors:** `400 INVALID_REQUEST` (a bad or reversed range).

#### `GET /stats/support`

`usage.read`. Support performance and AI cost per ticket.
- `from` and `to`: as above.
- `scope`: `bot` (default), or `business` for every bot of the business.

**200**:

```text
{
  from, to, scope,
  conversations: {total, ai_only, handed_off, escalated, deflection_rate},
                   // chat API conversations started in the range
                   // ai_only: no ticket or handoff; deflection_rate = ai_only / total
  tickets: {created, closed, from_customer, reopened, reopen_rate},
  backlog: {total, overdue, unassigned, by_status: {…}, by_priority: {…}},
                   // open tickets now, whatever the range
  first_response: {count, avg_seconds, median_seconds, p90_seconds},
  resolution:     {count, avg_seconds, median_seconds, p90_seconds},
  cost: {total, per_ticket, per_conversation, per_ai_resolved},
                   // USD billed, fee and commission included; a ticket's
                   // cost is its conversation's AI cost
  by_day: [{date, conversations, tickets_created, tickets_closed, ticket_cost}]
}
```

**Errors:** `400 INVALID_REQUEST`.

#### `GET /stats/performance`

`usage.read` (v2). How the API performed for the bot: requests served, how long they took, where a reply's time went and how well retrieval worked.
- `from` and `to`: as above.
- `scope`: `bot` (default), or `business` for every bot of the business.

Percentiles are nearest-rank and in whole milliseconds. Every list is present, empty when there is no data; rates run from 0 to 1.

**200**:

```text
{
  from, to, scope,                 // "bot" | "business"
  recording: {http, sample_rate, model_attempts},
                   // http: requests are being stored (PERF_HTTP_STATS); sample_rate: the share stored
                   // model_attempts: model calls are being stored (MODEL_ATTEMPT_RECORDS)
  requests: {
    total, errors, server_errors,  // errors = 4xx + 5xx; server_errors = 5xx
    error_rate, server_error_rate,
    by_status: {"2xx", "3xx", "4xx", "5xx"},
    by_route: [{method, route, requests, errors, server_errors, error_rate,
                count, avg_ms, p50_ms, p95_ms, p99_ms, max_ms}],     // busiest 50
                   // route is the router's pattern, e.g. "/conversations/{id}/messages", without /v3
    by_day:   [{date, requests, errors, server_errors, p50_ms, p95_ms}]   // every day, zeros included
  },
  latency: {count, avg_ms, p50_ms, p95_ms, p99_ms, max_ms},     // every route together
  pipeline: {
    replies,                       // answers recorded in the range
    total: {count, avg_ms, p50_ms, p95_ms, p99_ms, max_ms},   // time until the reply was ready
    stages: [{stage, ran, share, count, avg_ms, p50_ms, p95_ms, p99_ms, max_ms}],
                   // in order: prepare, quota, retrieval, web_search, llm, postprocess, other
                   // these add up to total; share is the stage's part of all reply time
    retrieval_stages: [{stage, ran, share, ...}]
                   // rewrite, embed, dense, lexical, load, rerank: retrieval's own breakdown;
                   // they overlap (dense and lexical run together) so they don't add up
  },
  rag: {
    replies, answered_rate, no_answer_rate, clarification_rate, handoff_rate,
    empty_retrieval_rate,          // replies with no passage to answer from
    cache_hit_rate, cache_hits: {"<kind>": n},     // e.g. "semantic", "retrieval"
    rewrite_rate,
    degraded_rate, degraded: {"<stage>": n},       // replies that went on without a failed stage
    confidence: {"high": n, "low": n, "none": n, "unknown": n},   // unknown: nothing was searched
    web_search_rate, split_rate,   // replies that used web results / split a complex question
    avg_candidates, avg_passages, avg_top_score,
    retrieval: {count, avg_ms, p50_ms, p95_ms, p99_ms, max_ms}
  },
  models: [{model, attempts, failures, failure_rate, count, avg_ms, p50_ms, p95_ms, p99_ms, max_ms}]
                   // most-called 10; includes calls that failed before a fallback answered
}
```

**How to read the stages.** `ran` is how many replies the stage took at least 1 ms for, and its `count`, average and percentiles are over those replies only, so a stage that few replies use (`web_search`, `rewrite`) isn't diluted by zeros. A cached answer skips most stages. `prepare` is validating the request and the database reads before the reply starts, `quota` reserving the reply's place in the plan, `postprocess` everything after the model's first reply (a web retry, checking and repairing the draft, citations), and `other` the time no stage accounts for. A repaired reply's model time is in both `llm` and `postprocess`.

**Sampling.** With `PERF_HTTP_SAMPLE_RATE` below 1, `requests` counts are scaled back up, so they stay right; `latency` and `by_route` percentiles are over the stored sample.

**Errors:** `400 INVALID_REQUEST` (a bad or reversed range, or an unknown `scope`).

### Billing: balance and extra tokens

Each plan includes `tokens_per_month` (every bot's replies together, counted from their tokens). Starter and Pro also sell **extra tokens** for the current month, which a dashboard shows as a slider under the plan; Free sells none, and Enterprise's tokens are unlimited. Each business has a **balance** in USD that pays for extra tokens and, once the month's tokens and extra tokens are used up, for each further reply at its billed cost (OpenRouter's price plus fee and commission, as in `GET /models`). When the balance reaches zero, replies past the tokens stop with `429 PLAN_LIMIT_REACHED` (`limit: "tokens_per_month"`) until the month ends, more tokens are bought, or the balance is topped up. Balances are not paid through Paddle: a platform admin credits them (`POST /platform/tenants/{id}/balance`). The plan itself is paid by subscription, below.

**Pricing.** Extra tokens cost a flat price per million, up to a monthly maximum:

| Plan | Price per million | Slider |
| --- | --- | --- |
| Starter | $8.00 | 1–5M |
| Pro | $6.00 | 1–30M |

For example, 5M on Starter costs 5 × $8.00 = $40.00, and 30M on Pro costs 30 × $6.00 = $180.00.

**The slider.** `GET /plans` gives each plan's `token_addon`, or `null` when it sells none:

```text
token_addon: {
  price_per_million,                     // the first tier's: what 1M costs
  min_millions, max_millions, step_millions, currency,
  tiers: [{from_millions, price_per_million}]
}
```

Offer `min_millions` to `max_millions` in steps of `step_millions`. For the price as the slider moves, call `GET /billing/token-addons/quote?millions=` (debounced), or compute it from `tiers`: each million from a tier's `from_millions` up to the next tier's costs that tier's `price_per_million`. Every plan has a single tier today; if more are added they are graduated, like tax brackets, so buying more never costs less in total. For the business's own plan, `GET /billing` returns the same `token_addon`, or `null` when the plan sells none or its tokens are unlimited.

#### `GET /billing`

`usage.read`. **200**:

```text
{
  currency: "USD",
  balance,                                     // USD
  month,                                       // YYYY-MM, UTC
  plan: {id, name},
  tokens: {unlimited, plan_allowance, addons, allowance, used, remaining},
          // allowance = plan_allowance + addons; remaining is null when unlimited
  token_addon,                                 // the slider, or null
  addons: [{id, tokens, price, month, actor, created_at}]   // bought this month, newest first
}
```

#### `GET /billing/ledger`

`usage.read`. Every change to the balance, newest first, 50 per page; pass `before` = `next_before` for the next page. **200** `{data: [{id, amount, balance_after, kind, note, actor, usage_id?, addon_id?, created_at}], next_before?}`.
- `amount` is in USD: positive adds to the balance, negative spends it.
- `kind` is `credit` or `debit` (a platform admin's, with their `note`), `token_addon` (extra tokens, `addon_id`) or `overage` (a reply past the month's tokens, `usage_id`).

#### `GET /billing/token-addons/quote`

`usage.read`. `?millions=`: a position on the plan's slider. **200** what buying it costs:

```text
{
  millions, tokens, currency,
  price,                                       // USD, the total
  average_per_million,
  breakdown: [{from_millions, to_millions, millions, price_per_million, amount}]   // one line per tier used
}
```

**Errors:** `400 INVALID_REQUEST` (`millions` missing or off the slider), `400 ADDON_NOT_AVAILABLE`.

#### `POST /billing/token-addons`

`billing.write`. `{millions}`: a position on the plan's slider. It pays the price `GET /billing/token-addons/quote` gives from the balance, and adds `millions × 1,000,000` tokens for the current month only. **201** `{addon, billing}`, where `billing` is the new `GET /billing`.

**Errors:**
- `400 INVALID_REQUEST`: `millions` isn't on the slider.
- `400 ADDON_NOT_AVAILABLE`: the plan sells no extra tokens (Free), or the business's tokens are unlimited (Enterprise, or an override of 0), so it needs none.
- `402 INSUFFICIENT_BALANCE`: the balance is below the price; nothing changes.

### Billing: plan subscription (Paddle)

Starter and Pro are sold as Paddle subscriptions. [Paddle](https://www.paddle.com) is the Merchant of Record: it takes the card, charges tax and issues invoices. Every paid price has a **7-day trial that requires a card**, so a subscription is `trialing` from the moment checkout completes and is first charged when the trial ends. Enterprise is sold by hand and has no subscription. Paddle is off until `PADDLE_API_KEY` is set; its endpoints then answer `503 PAYMENT_NOT_CONFIGURED`.

**The plan follows Paddle.** The dashboard never sets `plan` itself. Paddle's webhook (below) moves a business to the plan of its subscription, so the two cannot disagree. A platform admin can still set a plan by hand with `PATCH /platform/tenants/{id}`; the next webhook for that business overwrites it, except that a business on `enterprise` is never moved by a subscription event.

**Flow.** The dashboard calls `POST /billing/checkout`, opens Paddle's overlay with the returned `transaction_id` (Paddle.js, client-side token), and the customer enters a card. Paddle then sends `subscription.*` webhooks and the API activates the plan. After the overlay reports success the dashboard re-reads `GET /billing/subscription` and `GET /tenant` for a few seconds until the plan changes.

**Configuration** (API environment, never the dashboard):

| Variable | Value |
| --- | --- |
| `PADDLE_ENV` | `sandbox` (default) or `production`. Selects `sandbox-api.paddle.com` or `api.paddle.com`. |
| `PADDLE_API_KEY` | A server-side API key (`pdl_sdbx_…` in sandbox, `pdl_live_…` in production) that can write transactions, subscriptions and customer portal sessions. Empty turns checkout off. |
| `PADDLE_WEBHOOK_SECRET` | The notification destination's endpoint secret (`pdl_ntfset_…`). Empty turns the webhook off. |
| `PADDLE_PRICE_STARTER_MONTHLY`, `PADDLE_PRICE_STARTER_YEARLY`, `PADDLE_PRICE_PRO_MONTHLY`, `PADDLE_PRICE_PRO_YEARLY` | The four `pri_…` IDs. All four are required when the API key or the secret is set. |

Startup fails if a key doesn't match `PADDLE_ENV` or a price is missing. The Paddle sandbox prices are `pri_01m4vmb2hfbhstnq7kkakx1t74` (Starter monthly), `pri_01m4vmb2v11m6hnsnnksqfvr53` (Starter yearly), `pri_01m4vmb3s4sqycmzzwqcvk8d57` (Pro monthly) and `pri_01m4vmb42a0x2qadtp6956d45v` (Pro yearly). The dashboard needs only `VITE_PADDLE_CLIENT_TOKEN` and `VITE_PADDLE_ENV`.

**Storage** (`migrations/0026_paddle_subscriptions.sql`, applied by hand):

- `billing_subscriptions`: one row per business: `tenant_id`, `paddle_customer_id`, `paddle_subscription_id`, `status`, `plan`, `interval`, `trial_ends_at`, `current_period_end`, `cancel_at`, `provider_updated_at`. A new subscription after a canceled one replaces the row.
- `paddle_events`: the IDs of webhook events already handled, so a repeated delivery is skipped.

#### Trial eligibility (`TRIAL_GUARD`)

Off by default. The trial belongs to the Paddle price, so without the guard every checkout is sold with it. With migration `0036_trial_claims.sql` applied and `TRIAL_GUARD` set, the API remembers each subscription that started a trial in `billing_trial_claims`, which outlives the business (the purge job leaves it). A customer is recognised by their Paddle customer, the signed-in person who opened the checkout (named in the transaction's `custom_data.user_id`; a hint, since a checkout can be opened in Paddle.js), and a keyed hash (`TRIAL_GUARD_KEY`) of the billing email with `+tags` removed and Gmail dots ignored. Each of the three can appear in only one claim.

- `shadow`: records claims and reports a trial that repeats one (`billing.repeat_trial` in `GET /audit`, once per subscription, and a log line). A checkout that would have been sold without a trial is reported (`billing.trial_guard_would_withhold`). No response and no price changes.
- `enforce`: as shadow, and `POST /billing/checkout` sells a customer who has had a trial the matching `PADDLE_PRICE_*_NOTRIAL` price (`billing.trial_withheld` in the activity log). The response is unchanged. Startup needs all four no-trial prices. If the claims cannot be read the checkout fails rather than selling a second trial; a webhook whose claim cannot be written is answered 5xx so Paddle delivers it again.

A subscription on a no-trial price is recognised like the others. A repeat that still starts (a checkout opened outside this API, or two started together) is reported and left running: ending its trial is a decision for a person. It cannot identify someone who uses another account, email and card.

#### `GET /billing/subscription`

`usage.read`. **200** `{subscription, trial_eligible}`. `trial_eligible` is whether a checkout now, by the person asking, would be sold with the free trial: `true` unless `TRIAL_GUARD` is `enforce` and the business, the person or their email has had one (see "Trial eligibility"). A dashboard shows "start your free trial" only when it is `true`. `subscription` is `null` when the business has never subscribed:

```text
subscription: {
  status,              // trialing | active | past_due | paused | canceled
  plan,                // starter | pro
  interval,            // monthly | yearly
  trial_ends_at,       // ISO time while trialing, else null
  current_period_end,  // next renewal, or the end of the paid period once canceled
  cancel_at            // set when a cancellation is scheduled: access ends then
} | null
```

#### `POST /billing/checkout`

`billing.write`. `{plan, interval}` with `plan` = `starter` or `pro` and `interval` = `monthly` or `yearly`. Creates a Paddle transaction for that price, with `custom_data.tenant_id` set to the business (Paddle copies it to the subscription), and returns **200** `{transaction_id}` (`txn_…`) for Paddle.js `Checkout.open({transactionId})`. A business that has been a customer before keeps its Paddle customer. Price IDs never reach the browser.

**One checkout per business.** Requests for one business at the same time share a single Paddle transaction, so a double click, a retry after a timeout or two people cannot create two payable transactions: the first request makes it, the others wait a few seconds and receive the same `transaction_id`. A transaction left unpaid is offered again for an hour (when Paddle says it can still be paid), moved to the new price if the plan or interval asked for changed. Needs `0038_billing_checkouts.sql`; without it each request makes its own transaction, as before, and the API logs an error.

**Signed.** The transaction's `custom_data` carries a signature of the business (and person) it was made for, under a key only the server has. The webhook applies a new subscription only when that signature is right, so a checkout opened in the browser with the public client token cannot attach a subscription to another business. Subscriptions already tracked keep their business, so those made before signatures existed carry on. `PADDLE_TENANT_BINDING` is `enforce` (the default: an unsigned new subscription is ignored and reported as `billing.unbound_subscription`), `report` (applied and reported) or `off`. **Deploying this with checkouts in flight:** a customer who started a checkout before the deploy and pays after it has an unsigned subscription. Run `report` for a day first, or find them under `billing.unbound_subscription` and record the subscription by hand.

**Errors:** `400 INVALID_REQUEST`, `409 SUBSCRIPTION_EXISTS` (the business has a subscription that isn't `canceled`: change it with the endpoint below), `409 CHECKOUT_IN_PROGRESS` (another request is still setting up the business's checkout; wait `Retry-After` seconds), `503 PAYMENT_NOT_CONFIGURED`, `502 PAYMENT_PROVIDER_ERROR` (Paddle failed; nothing changed).

#### `POST /billing/subscription/change`

`billing.write`. `{plan, interval}`. Moves the existing subscription to another plan or billing period. While trialing nothing is billed and the new price applies when the trial ends; otherwise Paddle prorates and charges or credits the difference at once. **200** `{subscription}`, as Paddle now has it. Asking for the plan the business is already on changes nothing.

**Errors:** `400 INVALID_REQUEST`, `404 NO_SUBSCRIPTION`, `503 PAYMENT_NOT_CONFIGURED`, `502 PAYMENT_PROVIDER_ERROR`.

#### `POST /billing/portal`

`billing.write`. Opens a Paddle customer-portal session for the business's customer, where the customer updates their card, downloads invoices and cancels. **200** `{url}`; the dashboard navigates to it.

**Errors:** `404 NO_SUBSCRIPTION` (the business has never subscribed), `503 PAYMENT_NOT_CONFIGURED`, `502 PAYMENT_PROVIDER_ERROR`.

#### `POST /webhooks/paddle`

v2 only. No token and no scope: Paddle calls it, and the signature on the raw body is the authentication.

1. The `Paddle-Signature` header (`ts=<unix>;h1=<hex>`) must be the HMAC-SHA256 of `<ts>:<raw body>` under `PADDLE_WEBHOOK_SECRET`, with a timestamp within a minute. During a secret rotation Paddle sends one `h1` per secret and any may match. Otherwise **400** `INVALID_SIGNATURE` and nothing is processed.
2. Events other than `subscription.*` are acknowledged and ignored. An event already handled (same `event_id`) is acknowledged and skipped.
3. A `subscription.*` event is applied and answered **200** `{ok: true}`. A database failure answers **5xx**, so Paddle delivers the event again.

| Event | Effect |
| --- | --- |
| `subscription.created`, `.activated`, `.trialing`, `.updated`, `.resumed`, `.past_due`, `.paused` | The business is found from `data.custom_data.tenant_id`, else from the subscription it already has. The row is written from the event: `status`, plan and interval from the price ID, `trial_ends_at` from `items[0].trial_dates.ends_at`, `current_period_end` from `next_billed_at`, `cancel_at` from a `scheduled_change` with `action: "cancel"`. The business moves to that plan (`past_due` and `paused` keep it; Paddle retries a failed payment). |
| `.canceled` | The row becomes `canceled` and the business returns to `free`. Paddle sends it when access has ended; a cancellation scheduled for the end of the period arrives earlier as `.updated` with `cancel_at`. |

An event is ignored, but still marked handled, when its price isn't one of the four configured, its business doesn't exist, another live subscription already belongs to the business, or it is older than what is stored (`updated_at`). A business on `enterprise` is never moved by an event. Each applied event adds an entry to the business's activity log (`GET /audit`), with actor `paddle`.

**Deleting a business** (`DELETE /platform/tenants/{id}` or approving a deletion request) cancels its subscription in Paddle at once, so it is not billed again. The cancellation webhook returns the business to `free`, so a restored business comes back on Free. The subscription row is erased with the rest of the business when it is purged.

**Testing in the sandbox.** Create the notification destination (`https://<api>/v3/webhooks/paddle`, the `subscription.*` events), then use Paddle's simulations (`subscription.created`, `.canceled`, `.past_due`) against it and read the deliveries under Notifications. Pay in the overlay with the test card `4242 4242 4242 4242`.

### Playground

Scope headers, `playground.run`. Runs real model and tool requests for trying settings. Playground conversations are kept apart from customer conversations and are shared by the bot's team.

#### `POST /playground/run`

| Field | Rules |
| --- | --- |
| `message` | 1–4000 characters. May be omitted with `resend`, and may be empty when `attachments` is sent (image input). |
| `attachments` | Image input. 1–3 distinct attachment IDs (`att_…`) from `POST /playground/attachments`, uploaded and not yet sent. The assistant reads them in this reply only. Not allowed with `resend`. `400 FEATURE_UNAVAILABLE` when no vision-capable model is available, `403 PLAN_LIMIT_REACHED` (`limit: "image_input"`) when the plan has no image input. See [Sending images](#sending-images-image-input). |
| `max_output_tokens` | Required. 1–32768. Replaced by the platform's `CHAT_MAX_TOKENS`. |
| `prompt_template_id`, `prompt_variables` | The template to answer with, checked as saving would. Usually the bot's saved or draft values. |
| `assistant_name` | Fills `{{assistant_name}}`; defaults to the saved bot's. |
| `system_prompt` | Only the bot's own pre-template prompt, or empty (`400 PROMPT_NOT_EDITABLE`). |
| `model` | Ignored: the platform's default model answers unless routing picks another. |
| `temperature` | 0–2. Only platform admins and the admin key may set it; everyone else gets the platform's `CHAT_TEMPERATURE`. |
| `conversation_id` | A playground conversation to continue; both messages are stored, and recent messages go along as history. |
| `resend` | With `conversation_id`: answer the last stored message again, replacing its reply. |
| `history` | Only without `conversation_id`: up to 40 `{role, content}` turns, and nothing is stored. |
| `rag_enabled`, `rag_top_k` | Knowledge retrieval, and the most passages (1–20). Only platform admins and the admin key may set `rag_top_k`; everyone else gets the platform's `CHAT_TOP_K`. |
| `web_search` | `{enabled, mode, max_results, depth, topic, time_range, include_domains, exclude_domains}`, the bot's `webSearch` settings in snake_case (v2). Needs `rag_enabled`. Searches only when the server has a search provider and the business's plan has room; otherwise the reply is answered without it. |
| `tools_enabled`, `tools` | Tools to allow; `tools` is required with `tools_enabled` and not allowed without it. |
| `filters` | Retrieval metadata filters. |
| `debug` | Include the retrieval trace as `debug`. |

**200**:

```text
{
  output,                                                          // empty while escalated
  model, latency_ms, finish_reason,
  usage: {input_tokens, output_tokens, total_tokens, cost} | null,
  tool_calls: [{name, arguments, status, output, latency_ms}],
  status,                                                          // answered | clarification_required | no_answer | handoff | escalated
  sources,                                                         // null with retrieval off; web results have kind: "web"
  context_tokens,
  conversation_id?, user_message?, reply?,                         // with conversation_id: the stored messages; user_message.attachments lists the pictures (image input)
  debug?
}
```

There's no streaming; show a pending state, and allow cancelling with `AbortController`. Tokens may still be spent after a cancel.

Without `conversation_id` nothing is stored, so the attachments are used for this reply and then deleted; `user_message` is absent and so are the pictures. Show the picture from the local file in your own chat view.

**Errors:**
- `400 INVALID_REQUEST`
- `404 CONVERSATION_NOT_FOUND`
- Image input: `404 ATTACHMENT_NOT_FOUND`, `409 ATTACHMENT_NOT_UPLOADED`, `400 INVALID_IMAGE`, `400 UNSUPPORTED_IMAGE_TYPE`, `413 IMAGE_TOO_LARGE`, `400 FEATURE_UNAVAILABLE`, `403 PLAN_LIMIT_REACHED` (`limit: "image_input"`)
- [Model errors](#6-errors)

#### `GET /playground/attachments/config`

*Image input.* `playground.run`. Tells the composer whether to offer an attach control. **200**:

```text
{
  enabled,            // false: hide the control
  reason?,            // with enabled false: "plan" (the plan has no image input) or "no_vision_model" (no active model can read pictures)
  max_bytes,          // largest upload, 20971520
  max_per_message,    // 3
  content_types       // ["image/jpeg", "image/png", "image/webp"]
}
```

`reason: "plan"` is a good place for an upgrade prompt. Before the feature exists this route is `404 NOT_FOUND`: treat that as `enabled: false`.

#### `POST /playground/attachments`

*Image input.* `playground.run`. Registers a picture and returns a presigned R2 URL (see [Sending images](#sending-images-image-input)).

| Field | Rules |
| --- | --- |
| `filename` | Required. Up to 260 characters, no slashes. Ends in `.jpg`, `.jpeg`, `.png` or `.webp`. |
| `content_type` | Required. `image/jpeg`, `image/png` or `image/webp`. The file's bytes are what count: a mismatch is found when the message is sent. |
| `size` | Required. Bytes, 1 to 20,971,520 (20 MB). |
| `sha256` | Required. 64 lowercase hex characters; the upload must match. |

**201** `{attachment, url, method: "PUT", headers, expires_at}`. `attachment` is `{id, status: "pending", filename, content_type, size}`. Upload within 15 minutes (`expires_at`); register again for a fresh URL.

**Errors:**
- `400 INVALID_REQUEST`
- `400 UNSUPPORTED_IMAGE_TYPE`
- `413 IMAGE_TOO_LARGE`: `size` is over 20 MB.
- `403 PLAN_LIMIT_REACHED` (`limit: "image_input"`)
- `400 FEATURE_UNAVAILABLE`

#### The attachment object

*Image input.* An attachment in a message is `{id, content_type, width, height, size, url, url_expires_at}`:

| Field | Meaning |
| --- | --- |
| `id` | `att_` plus 32 hex characters. |
| `content_type` | Always `image/jpeg`: the stored copy, whatever was uploaded. |
| `width`, `height`, `size` | Pixels and bytes of the stored copy. |
| `url`, `url_expires_at` | A signed link for showing the picture, valid for 1 hour. Never store it; reload the conversation for a fresh one. |

Only pictures that were sent appear in a message. A `pending` attachment (just registered) appears only in the registration response.

#### `GET /playground/conversations/current`

**200** `{conversation}`: the latest playground conversation with up to 200 messages, each with its model, usage, status, sources and tool calls. `conversation` is `null` when there is none.

#### `POST /playground/conversations`

No body. **201** a new empty playground conversation. The bot's earlier playground conversations and their messages are deleted, except one that has a ticket; usage and cost records are kept.

### Platform administration

A platform admin's token (`platform_admin: true` in `GET /me`) or the admin key; no scope headers. Platform changes are recorded in the activity log, under the business they affect or under `_platform`.

#### `GET /platform/overview`

**200**:

```text
{
  businesses, suspended_businesses,   // businesses that aren't deleted
  deleted_businesses,                // deleted, not purged yet
  users, platform_admins, bots,
  conversations_this_month,          // chat API conversations, this UTC month
  open_tickets, needs_reply,
  replies_this_month,
  cost_this_month,                   // USD OpenRouter charged
  billed_this_month,                 // USD businesses were billed: cost plus fees and commissions
  by_day: [{date, requests, input_tokens, output_tokens, total_tokens, estimated_cost}]   // last 30 days, OpenRouter's cost
}
```

#### `GET /platform/tenants`

**200** `{data: [Business + {owner_email, first_bot}]}`, every business newest first, with `deleted_at` on deleted ones that aren't purged yet. A deleted business can't be changed (`404 TENANT_NOT_FOUND`) until it is restored.

#### `PATCH /platform/tenants/{id}`

`{plan?, status?, limits?}`; leave out what doesn't change.
- `plan`: a plan `id` from `GET /plans`.
- `status`: `active` or `suspended`. Suspending blocks the business's members and chat keys.
- `limits`: `{bots?, documents_per_bot?, members?, replies_per_month?, tokens_per_month?, web_search?, web_searches_per_month?, image_input?}`, each 0 (unlimited) to 10,000,000 (`tokens_per_month` to 100,000,000,000); `web_search` and `image_input` are `true` or `false`, turning web search or image input on or off whatever the plan says (Free has no image input; Starter, Pro and Enterprise do). It replaces every override, and a dimension left out uses the plan's limit. Send `{}` to clear them all.

**200** the Business.

**Errors:**
- `400 INVALID_REQUEST`
- `404 TENANT_NOT_FOUND`

#### `GET /platform/tenants/{id}/detail`

**200**:

```text
{
  members: [{user_id, email, name, role, created_at}],
  bots: [{id, name, model, prompt_template_id, own_prompt, saved, documents,
          replies_this_month, cost_this_month, billed_this_month}],
          // cost: what OpenRouter charged; billed: what the business was billed
          // own_prompt: still uses a pre-template prompt
          // saved: false = never configured
  open_tickets,
  balance,                                           // USD
  audit: [{id, actor, action, target, created_at}]   // recent events
}
```

**Errors:** `404 TENANT_NOT_FOUND`.

#### `POST /platform/tenants/{id}/balance`

`{amount, note}`. Adds `amount` USD to the business's balance, or takes it away when negative (up to 1,000,000 either way). `note` (1–200 characters, such as a bank transfer reference) shows in the business's ledger. A debit can't take the balance below zero. Recorded in the business's activity log as `billing.credit` or `billing.debit`. **200** `{entry, balance}`, `entry` as in `GET /billing/ledger`.

**Errors:**
- `400 INVALID_REQUEST`
- `404 TENANT_NOT_FOUND`

#### `DELETE /platform/tenants/{id}` (v2)

`{reason?}`, at most 1000 characters; the body may be left out. Deletes the business at once: nobody reaches it, its chat keys stop within a minute, and it can be restored until `restore_until`, 30 days later. A pending deletion request of the business is approved. Recorded as `business.deleted`. **200** the Deletion:

```text
{
  id,                          // del_…
  tenant_id, tenant_name, owner_email, reason, request_id?,
  deleted_by, deleted_by_email?, deleted_at,
  restore_until,
  restored_at?, restored_by?, purged_at?,
  state,                       // deleted | restored | purged
  restorable                   // state is deleted and restore_until hasn't passed
}
```

**Errors:**
- `400 INVALID_REQUEST`
- `404 TENANT_NOT_FOUND`
- `409 TENANT_DELETED`: already deleted.
- `409 TENANT_PROTECTED`: the `default` business.

#### `POST /platform/tenants/{id}/restore` (v2)

Restores a deleted business as it was. Recorded as `business.restored`. **200** the Business.

**Errors:**
- `404 TENANT_NOT_FOUND`: no deleted business has this ID.
- `410 RESTORE_EXPIRED`: deleted more than 30 days ago.

#### `GET /platform/deleted-tenants` (v2)

**200** `{data: [Deletion]}`, newest first: deletions that can still be restored, and the record of restored and purged ones, which stays after the business's own records are erased.

#### `GET /platform/deletion-requests?status=` (v2)

`status`: `pending` (the default), `approved`, `rejected`, `cancelled` or `all`. **200** `{data: [Deletion request]}`, newest first.

#### `POST /platform/deletion-requests/{id}/approve` (v2)

`{note?}`. Deletes the business as `DELETE /platform/tenants/{id}` does, with the request's reason. **200** the Deletion. **Errors:** `404 DELETION_REQUEST_NOT_FOUND` for a request that isn't pending.

#### `POST /platform/deletion-requests/{id}/reject` (v2)

`{note?}`, shown to the business as `review_note`. **200** the request, `rejected`. Recorded as `business.deletion_rejected`. **Errors:** `404 DELETION_REQUEST_NOT_FOUND`.

**User:**

```text
{
  id, email, name, platform_admin,
  status,                                  // active | disabled | deleted
  disabled_at?, deleted_at?,
  created_at, last_seen_at?,
  memberships: [{tenant_id, tenant_name, role}]
}
```

A deleted account keeps only its `id`: its email becomes `deleted+{id}@invalid` and its name is empty, so activity logs and ticket history still name someone.

#### `GET /platform/users`

Most recently seen first.

| Query | Rules |
| --- | --- |
| `q` | Up to 120 characters: matches email or name. |
| `status` | `active`, `disabled`, `deleted` or `all`. Default: everyone not deleted. |
| `platform_admin` | `true` or `false`. |
| `limit` | 1–100, default 100. |
| `cursor` | `next_cursor` from the previous page. |

**200** `{data: [User], next_cursor?}`.

#### `POST /platform/users` (v2)

| Field | Rules |
| --- | --- |
| `email` | Required. An email address no other account has. |
| `name` | Up to 80 characters. |
| `platform_admin` | Default `false`. |
| `memberships` | Up to 20 `{tenant_id, role}`, each business once, with the role `owner`, `admin`, `editor`, `agent` or `viewer`. |

Creates the account in Supabase Auth, which emails the person a link to set it up (the **Invite user** template, landing on `{DASHBOARD_URL}/auth/callback`), and adds it to the businesses. **201** the User. Recorded as `user.created`, and `member.added` in each business.

#### `GET /platform/users/{id}` (v2)

**200** the User with `activity`: the last 50 audit events the person made, in any business, as `{id, tenant_id, actor, action, target, created_at}`. Deleted accounts are found too. **Errors:** `404 USER_NOT_FOUND`.

#### `PATCH /platform/users/{id}`

Send any of:
- `name`: up to 80 characters.
- `email`: an address no other account has; it's confirmed at once.
- `platform_admin`: `true` or `false`.
- `disabled`: `true` locks the person out: every request with their token, even one issued before, gets `403 ACCOUNT_DISABLED` (within 30 seconds on every server), and Supabase bans the account so it can't sign in. `false` lets them back in.

Names and emails change in Supabase too, since sign-in copies them from it. **200** the User. Recorded as `user.updated`, `user.disabled`, `user.enabled`, `platform_admin.granted` or `platform_admin.revoked`.

#### `DELETE /platform/users/{id}` (v2)

Deletes the account in Supabase Auth, takes the person out of every business (each records `member.removed`), unassigns their open tickets and revokes invitations to their address. **204**. Recorded as `user.deleted`.

**Errors**, for the user endpoints:
- `400 INVALID_REQUEST`
- `404 USER_NOT_FOUND`; `404 TENANT_NOT_FOUND` (a membership names no business)
- `409 EMAIL_TAKEN`
- `409 OWN_ACCESS`: nobody can disable, delete or remove platform admin from their own account.
- `409 LAST_PLATFORM_ADMIN`: the platform keeps one active platform admin.
- `409 SOLE_OWNER`: the person is the only owner of a business; `tenants` lists them. Make someone else an owner, or delete the business, first.
- `502 AUTH_PROVIDER_ERROR`: Supabase Auth didn't make the change.
- `503 NOT_CONFIGURED`: creating accounts and changing names or emails needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Disabling, enabling and platform admin access work without them; deleting then only locks the person out.

#### `GET /platform/tickets`

Read only, across businesses, most recently updated first, 100 per page.

| Query | Rules |
| --- | --- |
| `tenant` | A business ID. |
| `view` | `all`, `open`, `needs_reply` or `escalated`. |
| `status`, `priority` | One value each; `status` is `open` or `closed`. |
| `channel_type` | A channel type `id`, such as `discord`. |
| `before` | `next_before` from the previous page. |

**200** `{data: [{id, tenant_id, tenant_name, bot_id, subject, status, priority, source, channel_id?, channel_name?, channel_type?, escalated, needs_reply, handed_off, created_at, updated_at}], next_before?}`. To open one, act in that business as a platform admin, using its scope headers with `GET /tickets/{id}`.

#### `GET /platform/tools`

`?tenant=` narrows to one business. **200** `{data: [{id, tenant_id, tenant_name, name, method, url, read_only, disabled, calls, errors, avg_latency_ms, updated_at}]}`, where calls and errors cover the last 30 days.

#### `PATCH /platform/tools/{id}`

`{disabled: true | false}`. A disabled tool stays listed for its business as unavailable, and no bot can call it. **200** `{id, disabled}`. **Errors:** `404 TOOL_NOT_FOUND`.

#### `GET /platform/usage`

| Query | Rules |
| --- | --- |
| `from`, `to` | As in `GET /usage/summary`. |
| `group` | `tenant` (default), `model` or `day`. |

**200** `{from, to, group, data: [{key, label, requests, input_tokens, output_tokens, cached_tokens, total_tokens, estimated_cost, billed_cost, avg_latency_ms}]}`. `key` is the business ID, model ID or date. `estimated_cost` is what OpenRouter charged in USD; `billed_cost` adds each reply's fee and commission, what businesses were billed. Rows by business or model are sorted by `estimated_cost`.

#### `GET /platform/performance`

The performance of every business together: the same body as [`GET /stats/performance`](#get-statsperformance) with `scope: "platform"`, covering the requests no business could be identified for as well (a rejected key, a missing route). It takes `from` and `to`, and no `scope`.

It adds `tenants`, the 20 businesses with the most requests: `[{tenant_id, name, requests, server_errors, server_error_rate}]`. Use it to find who is driving load or seeing errors.

**Errors:** `400 INVALID_REQUEST`.

#### `GET /platform/models`

**200** `{models: [Model + {bots, effective_fee_percent, effective_commission_percent, billed_input_price_per_mtok, billed_output_price_per_mtok}]}`, where `bots` counts the saved bots using each model. The `effective_` percentages are the model's own or the platform defaults (`PRICE_FEE_PERCENT`, `PRICE_COMMISSION_PERCENT`), and the `billed_` prices are what businesses see in `GET /models`: price × (1 + (fee + commission) / 100), rounded to 6 decimals.

```text
Model: {
  id,                                            // OpenRouter model ID
  label, description,
  input_price_per_mtok, output_price_per_mtok,   // OpenRouter's price, USD per million tokens
  fee_percent, commission_percent,               // the model's own markup; null = platform default
  pricing_synced_at,                             // when the prices were last read from OpenRouter; "" if never
  context_tokens,
  max_output_tokens,                             // caps bots' output; 0 = no cap
  supports_tools,
  supports_prompt_cache,                         // send the system prompt as a cache breakpoint
  supports_vision,                               // the model reads pictures (image input); OpenRouter lists it, and a platform admin may change it
  routing_tier,                                  // the models routing answers with: "fast" (small talk, unclear messages, requests for a person), "balanced" (answers from the knowledge base, follow-ups, tool use) or "advanced" (multi-part and comparison questions, and rewriting a draft that failed its checks); null = not used by routing. List at least one active model per tier; the lowest sort_order in a tier is tried first
  status,                                        // active (offered) | hidden (kept by bots using it) | retired (bots use the default)
  is_default, sort_order, created_at, updated_at
}
```

#### `POST /platform/models`

A Model's fields:
- Required: `id` (an OpenRouter model ID such as `vendor/model`). `label` (1–80 characters) is required when you send both prices.
- **Prices from OpenRouter.** Leave out `input_price_per_mtok` or `output_price_per_mtok`, and the API reads the model from `https://openrouter.ai/api/v1/model/{id}`: its prices, plus the `label`, `context_tokens`, `max_output_tokens`, `supports_tools` and `supports_vision` you don't send. `{"id": "openai/gpt-4o"}` is enough.
- `description`: up to 300 characters.
- Prices: 0–10,000.
- `fee_percent`, `commission_percent`: 0–1,000, or `null` (the default) for the platform's.
- `context_tokens`: up to 100,000,000.
- `max_output_tokens`: up to 1,000,000.
- `sort_order`: −10,000 to 10,000.
- `status` defaults to active and `supports_tools` to true. `is_default` needs an active model; setting it moves the default.

**201** the model as in `GET /platform/models`.

**Errors:**
- `400 INVALID_REQUEST` (`message` says which rule, or that OpenRouter has no model with this ID)
- `502 PRICING_UNAVAILABLE`: OpenRouter couldn't be reached. Try again, or send the prices.

#### `PATCH /platform/models/{id}`

Any of the fields above, except `id`. The ID contains a slash, so URL-encode it in the path: `/platform/models/google%2Fgemini-3.1-flash-lite`. Models aren't deleted: retire one, and its bots move to the default model. Use `bots` to warn before retiring. Send `fee_percent: null` to return a model to the platform's fee; leaving it out keeps its own.

**200** the model.

**Errors:**
- `400 INVALID_REQUEST`
- `404 MODEL_NOT_FOUND`

#### `POST /platform/models/{id}/refresh-pricing`

No body. Reads the model's prices from OpenRouter again and stores them with `pricing_synced_at`; nothing else changes. Replies already made keep the cost they were billed. **200** the model.

**Errors:**
- `400 INVALID_REQUEST`: OpenRouter has no model with this ID.
- `404 MODEL_NOT_FOUND`
- `502 PRICING_UNAVAILABLE`

#### `POST /platform/models/refresh-pricing`

No body. Refreshes every model that isn't retired. **200** `{models: [the refreshed models], failed: [{id, error}]}`: a model OpenRouter doesn't have, or couldn't return, keeps its prices and is listed in `failed`.

#### `GET /platform/settings` (v2)

Platform-wide settings a platform admin changes from the console. **200**:

```text
{
  vision_model: {
    value,        // what a platform admin set; "" when nothing is set
    default,      // the server's LLM_VISION_MODEL; "" when unset
    effective,    // the model in use; "" when there is none
    source        // "console" (value), "env" (default) or "none"
  }
}
```

`vision_model` is the model that answers a message with pictures ([image input](#image-input-2026-10-19)) when the bot's own model can't read them. A bot whose model reads pictures (`supports_vision`) always uses its own. With no model in use (`source: "none"`), such bots answer `FEATURE_UNAVAILABLE` and `GET /playground/attachments/config` says `no_vision_model`.

#### `PATCH /platform/settings` (v2)

`{vision_model}`: an OpenRouter model ID such as `google/gemini-3.1-flash-lite`, or `null` to remove the setting so the server's `LLM_VISION_MODEL` applies again. A model in the catalog must have `supports_vision` and not be retired; one the catalog doesn't list is checked against OpenRouter's input modalities. It takes effect within a minute on every server instance. **200** the settings as in `GET /platform/settings`. The change is recorded in the activity log under `_platform` as `settings.update`.

**Errors:**
- `400 INVALID_REQUEST`: not a model ID, retired, unable to read pictures, or unknown to OpenRouter.
- `502 PRICING_UNAVAILABLE`: OpenRouter couldn't be reached to check the model.

#### `GET /platform/prompt-templates`

**200** `{templates: [Template + {bots}], own_prompt_bots}`. `own_prompt_bots` counts the bots that still use a pre-template prompt.

```text
Template: {
  id,                       // tpl_…
  name, description, body,
  variables: [{key, label, help?, required, max_length}],
  business_types,           // [] = offered to every type
  status,                   // active | hidden | retired
  is_default,
  version,                  // rises when body or variables change
  created_at, updated_at
}
```

#### `POST /platform/prompt-templates`

`{name, body, description?, variables?, business_types?, status?, is_default?}`.
- `name`: 1–80 characters.
- `body`: 1–20,000 characters.
- `description`: up to 300 characters.
- **Variables:** at most 20.
  - Keys are lowercase words with underscores; `business_name` and `assistant_name` are built in, so don't declare them.
  - Labels are 1–80 characters, help up to 200, and `max_length` 1–2000.
- **Body:** every `{{key}}` in it must be a declared or built-in variable, and every `{{#key}}` section must be closed by `{{/key}}`, without nesting.
- **Default:** the default template must be active and offered to every type.

**201** the template. **Errors:** `400 INVALID_REQUEST` (`message` says which rule).

#### `PATCH /platform/prompt-templates/{id}`

Any of the fields above. Retired templates' bots fall back to their business type's template. **200** the template.

**Errors:**
- `400 INVALID_REQUEST`
- `404 TEMPLATE_NOT_FOUND`

#### `GET /platform/channel-types` (v2)

**200** `{data: [{id, label, description, icon, status, sort_order, auto_close_hours, channels, created_at, updated_at}]}`, by `sort_order`. `channels` counts businesses' channels of the type, leaving out deleted ones. The catalog starts with `website`, `discord`, `slack`, `telegram`, `whatsapp`, `email` and `custom`.

#### `POST /platform/channel-types` (v2)

| Field | Rules |
| --- | --- |
| `id` | Required. 2–32 lowercase letters, digits, `-` or `_`, starting with a letter, such as `line`. It can't change later. |
| `label` | Required. 1–80 characters. |
| `description` | Up to 300 characters. |
| `icon` | Up to 200 characters: an icon name or URL for dashboards. |
| `status` | `active` (default), `upcoming` or `hidden`. An upcoming type is listed to businesses as "Upcoming" but can't be added (`CHANNEL_TYPE_NOT_ALLOWED`); a hidden type isn't listed or offered for new channels. In both, channels already of the type keep working. |
| `sort_order` | -10,000 to 10,000. |
| `auto_close_hours` | 0 (never) to 2160, or `null` (the default) to leave it to each business. Open tickets from channels of the type close after this many hours without activity, unless a channel sets its own. In `PATCH`, `null` clears it and leaving it out keeps it. |

Recorded in the activity log under `_platform` as `channel_type.create`. **201** the type. **Errors:** `400 INVALID_REQUEST`, `409 CHANNEL_TYPE_EXISTS`.

#### `PATCH /platform/channel-types/{id}` (v2)

Any field of `POST` except `id`. Types aren't deleted; hide one instead. [Channels (v2)](#channels-v2) describes what businesses see. Recorded under `_platform` as `channel_type.update`. **200** the type. **Errors:** `400 INVALID_REQUEST`, `404 CHANNEL_TYPE_NOT_FOUND`.

#### `GET /platform/channels` (v2)

Every business's channels, newest first, up to 500. Deleted channels are left out.

| Query | Rules |
| --- | --- |
| `tenant` | A business ID. |
| `type` | A channel type `id`. |
| `status` | `active`, or `disabled` (turned off by its business or a platform admin). |

**200** `{data: [Channel + {tenant_name}]}`. **Errors:** `400 INVALID_REQUEST`: `tenant` isn't a business ID, `type` isn't a channel type `id`, or `status` is something else.

#### `PATCH /platform/channels/{id}` (v2)

`{disabled: true | false}` for any business's channel. A disabled channel stays listed for its business with `disabled_by_platform: true` and `active: false`, its chat API keys answer `403 CHANNEL_DISABLED`, and the business can't turn it back on. `disabled: false` makes it active again, unless the business has it off too (`enabled: false`). Recorded in the business's activity log as `channel.platform_disabled` or `channel.platform_enabled`. **200** the channel.

**Errors:**
- `400 INVALID_REQUEST`: `disabled` is missing or not a boolean.
- `404 CHANNEL_NOT_FOUND`: no channel has this ID, or it was deleted.

#### `GET /platform/customers` (v2)

Read only, every business's customers, most recently seen first.

| Query | Rules |
| --- | --- |
| `tenant` | A business ID. |
| `bot` | A bot ID. |
| `q` | Matches the start of the name or of any contact's value, up to 100 characters. |
| `limit`, `cursor` | 1–200 (default 50); `next_cursor` from the previous page. |

**200** `{data: [Customer + {tenant_name}], next_cursor?}`.

### Chat API (for integrations)

These endpoints are for websites, apps and messaging platforms, called from the integration's **server** with a chat key. Never call them from a browser. A dashboard doesn't call them, but it issues the keys (`POST /api-keys`) and should show integrators this section. A key reaches only conversations started through the chat API for its bot. Anything else returns `404 CONVERSATION_NOT_FOUND`.

**Pictures (image input).** A customer's message can carry up to 3 pictures. Check `attachments` in [`GET /profile`](#get-profile-v2) first: if it is absent or `enabled` is `false`, don't offer an attach button. Then, per picture: [register it](#post-conversationsidattachments) with `POST /conversations/{id}/attachments`, `PUT` the file to the returned URL, and send the IDs with `POST /conversations/{id}/messages` (`message` may be empty). The assistant reads the pictures in that reply only; later turns see a `[sent a picture]` note. Pictures come back on the message as `attachments` with links signed for an hour, so reload the conversation for fresh links rather than storing them. A website widget never holds the chat key: its server registers the picture and passes the upload URL to the browser. See [Sending images](#sending-images-image-input) for the flow, limits and errors. A person's reply recorded with `POST /conversations/{id}/replies` is text only.

**Conversation:**
- Fields: `{id, status, channel_id?, customer_id?, escalated, created_at, updated_at, messages}`. `channel_id` names the bot's [channel](#channels-v2) the conversation started on; `customer_id` the [customer](#customers-v2) it was started for.
- `status` is `open`, or `handoff` once it has been flagged for the team.
- `messages` holds up to the latest 200, oldest first. Each is `{id, role, content, author?, agent?, attachments?, created_at}`, with `role` `user` or `assistant`. A person's reply has `author: "agent"` and `agent` naming them. `attachments` (image input) lists the pictures a customer message carried, as in [the attachment object](#the-attachment-object); their `url` is signed for 1 hour.

#### `GET /profile` (v2)

How the key's business and bot present themselves, for a widget's header. **200**:

```text
{
  business: { name, logo_url? },
  bot:      { id, name, avatar_url? }
}
```

`bot.name` is the name saved in the bot's configuration, which customers see. `logo_url` and `avatar_url` are left out when there is no picture ([profile images](#profile-images-v2)). Nothing about the plan, team or account is returned.

Image input adds `attachments: {enabled, max_bytes, max_per_message, content_types}`, with the values `GET /playground/attachments/config` gives, so a widget knows whether to offer an attach button. It is absent before the feature exists, and `enabled: false` hides the button. The reason (plan or model) isn't revealed to customers. Unlike other chat endpoints it may be cached: `Cache-Control: private, max-age=60`.

#### `PUT /customer` (v2)

Finds or creates the [customer](#customers-v2) your platform knows, so their conversations and tickets are linked to them. Send `{contacts, name?, metadata?}` with at least one contact, for example `{"contacts": [{"type": "discord", "value": "80351110224678912"}, {"type": "email", "value": "ann@example.com"}]}` (rules as for `POST /customers`). The bot's customer who has any of the contacts is found, gets the contacts they lack added, has the `name` and `metadata` you send updated, and is marked seen; if there is none, one is created. Contacts they already have keep their primary flags. **201** a new customer, **200** an existing one, as the customer object. Pass its `id` as `customer_id` to `POST /conversations`.

**Errors:** `400 INVALID_REQUEST`; `409 CUSTOMER_CONFLICT`: the contacts belong to different customers, so nothing is changed (edit or delete one of the customers in the dashboard); `409 CUSTOMER_EXISTS`: a contact was taken by another customer while the request ran, so retry.

#### `POST /conversations`

No body, or `{channel_id, customer_id}` (v2). **201** an empty conversation, on the channel the body names or else the one the key is bound to, and for the customer the body names. Its tickets carry the channel and the customer.

**Errors:**
- `404 CHANNEL_NOT_FOUND`: the body names a channel the bot doesn't have.
- `403 CHANNEL_DISABLED`: that channel is turned off.
- `404 CUSTOMER_NOT_FOUND`: the body names a customer the bot doesn't have (get one from `PUT /customer`).

A key bound to a channel that is turned off or deleted gets `403 CHANNEL_DISABLED` from every chat API endpoint.

#### `GET /conversations/{id}`

**200** the conversation. Polling it is one way to pick up the team's replies; the webhook and live topics are the others.

#### `POST /conversations/{id}/attachments`

*Image input.* Registers a picture for this conversation and returns a presigned R2 URL. The body, the **201** response and the errors are those of [`POST /playground/attachments`](#post-playgroundattachments), plus `404 CONVERSATION_NOT_FOUND`. The attachment can only be sent in this conversation. See [Sending images](#sending-images-image-input).

#### `POST /conversations/{id}/messages`

`{message, attachments?}`. `message` is 1–4000 characters, or may be empty when `attachments` is sent (image input). `attachments` is 1–3 distinct attachment IDs from `POST /conversations/{id}/attachments`, uploaded and not yet sent; the assistant reads them in this reply only. The reply is generated with the bot's saved configuration and has 45 seconds by default. A message that only carries a placeholder such as `[sent an attachment in Discord]`, with no `attachments`, is handled as before: the assistant asks the customer to describe it.

**200** `{message, reply, status, sources}`:
- `reply` is `null` for `escalated` and `context`.
- `sources` are the cited documents, `[{document_id, title, section?, url?, score}]`, and are empty unless the status is `answered`.

| `status` | Show the customer |
| --- | --- |
| `answered` | `reply` |
| `clarification_required` | `reply` (it asks a question) |
| `no_answer` | `reply` |
| `handoff_offered` | `reply`, with a button that calls `/handoff` |
| `handoff` | `reply`; the conversation was flagged for the team |
| `escalated` | Nothing: a person has the conversation |
| `context` | Nothing: a message starting `[Context only` is stored as history |

**Errors:**
- `400 INVALID_REQUEST`
- `404 CONVERSATION_NOT_FOUND`
- `429 PLAN_LIMIT_REACHED`: the business's monthly replies are used up (`limit: "replies_per_month"`), or its tokens are and its balance is empty (`limit: "tokens_per_month"`)
- Image input: `404 ATTACHMENT_NOT_FOUND`, `409 ATTACHMENT_NOT_UPLOADED`, `400 INVALID_IMAGE`, `400 UNSUPPORTED_IMAGE_TYPE`, `413 IMAGE_TOO_LARGE`, `400 FEATURE_UNAVAILABLE`, and `403 PLAN_LIMIT_REACHED` with `limit: "image_input"`
- [Model errors](#6-errors)

After a model error the message stays stored, marked unanswered, and is left out of the conversation. A picture error (the image errors above) happens before anything is stored, so nothing is left behind.

#### `POST /conversations/{id}/escalate`

No body. Opens an escalated ticket, or escalates the open one, so the AI goes silent until the team hands the conversation back. It is safe to repeat. **200** the conversation (`escalated: true`).

#### `POST /conversations/{id}/resume`

No body. Ends the open ticket's escalation, so the AI replies in the conversation again. The ticket stays open; to close it as well, call `/ticket/close` instead. This is the chat-key counterpart of `PATCH /tickets/{id}` with `{"escalated": false}`, which accepts only a signed-in person or the admin key. It is safe to repeat, and a conversation nobody took over is returned unchanged. It isn't sent to the webhook. **200** the conversation (`escalated: false`).

#### `POST /conversations/{id}/handoff`

No body. Flags the conversation for the team and adds a confirmation message. The AI keeps replying. **200** the conversation.

#### `POST /conversations/{id}/ticket`

Optional `{subject, priority, keep_open}`. Opens a ticket without escalating, or returns the open one; `keep_open: true` stops a new ticket closing on its own. **200** `{id, subject, status, priority, escalated, channel_id?, created_at}`; the ticket takes the conversation's channel.

#### `POST /conversations/{id}/ticket/close`

No body. Closes the open ticket, ends escalation and clears the handoff flag. If no ticket is open, it returns the latest one. **200** the ticket. **Errors:** `404 TICKET_NOT_FOUND` (the conversation never had one).

#### `POST /conversations/{id}/replies`

Records a reply a person wrote on the integration's platform. It is text only: pictures in a person's reply aren't supported yet.

| Field | Rules |
| --- | --- |
| `content` | Required. 1–8000 characters. |
| `author` | Up to 64 characters: the person's name. |
| `external_id` | Up to 128 characters: the platform's message ID, which makes retries safe. |
| `escalate` | Default `false`; `true` also takes the conversation over. |

It opens a ticket if there is none, and isn't sent back to the webhook. **201** `{message, ticket_id, escalated}`, or **200** for a repeated `external_id`.

### Internal

#### `GET /internal/cron/knowledge`

For the scheduler only (Vercel Cron, `Authorization: Bearer <CRON_SECRET>`). It finishes knowledge documents left processing. Frontends never call it. Without `CRON_SECRET` it answers `503 CRON_NOT_CONFIGURED`.

#### `GET /internal/cron/purge`

For the scheduler only, authenticated like the one above; Vercel runs it daily. It erases the businesses deleted more than 30 days ago: their knowledge files in R2, their vectors, then every D1 record of theirs, and marks their deletion `purged`. People's accounts stay. It works for up to 45 seconds and the next run continues what is left. **200** `{purged: [tenant_id], pending: [tenant_id]}`.

#### `GET /internal/cron/billing`

For the scheduler only, authenticated like the ones above; Vercel runs it daily and the Cloudflare Worker hourly. It cancels, at Paddle, the subscription of every deleted business that still has one (the purge job will not erase a business until that is done), then compares every subscription Paddle still bills with the database. It answers `200` with what it did: `deleted_canceled`, `deleted_failed`, `reconcile_mode`, `compared`, `drift`, `fixed`, `untracked`, `truncated`. A subscription Paddle bills that the database has no record of, or has under another state, is logged as an error (`billing drift…`) and entered in the business's activity log (`billing.drift`, `billing.untracked_subscription`, `billing.reconciled_missing`). `PADDLE_RECONCILE` chooses `report` (the default: log and record only), `apply` (also bring a tracked subscription in line with Paddle, and record a signed subscription whose webhook was missed) or `off`. A second subscription for a business that has one is never touched: cancel or refund it in Paddle. A Paddle failure answers `502 PAYMENT_PROVIDER_ERROR`.

#### `GET /internal/cron/tickets`

For the scheduler only, authenticated like the ones above; a Cloudflare Worker (`workers/ticket-cron`) runs it hourly. It closes open tickets left without activity for their channel's, channel type's or business's `auto_close_hours` (see [Tickets](#tickets)). It works for up to 45 seconds and the next run continues what is left. **200** `{closed, remaining}`.

## 5. Which endpoints a dashboard needs where

A guide to which calls back each typical area. It doesn't prescribe screens.

| Area | Endpoints |
| --- | --- |
| Session and switching | `GET /me`; scope headers from the chosen membership and bot; `GET /bots` to switch bots; `POST /bots` to add one |
| Onboarding | `GET /business-types`, `POST /tenants` |
| Accepting an invitation | `POST /invites/preview`, then `POST /invites/accept` |
| Overview | `GET /usage/summary`, `GET /stats/support` (`scope=bot` or `business`), `GET /health` for an API status dot |
| Performance | `GET /stats/performance` (`scope=bot` or `business`); read `recording` first |
| Queries | `GET /queries` (filters, `assignee=me`), `GET`/`PATCH`/`DELETE /queries/{id}`, `GET /queries/{id}/events`, `POST /queries`, `GET /query-types`, `GET /properties?entity=query&scope_id=` for a type's form, `GET /members` for the assignee picker, live `query.created`/`query.updated` |
| Settings: query types | `GET /query-types?archived=true`, `GET /query-types/presets`, `POST`/`PATCH`/`DELETE /query-types…`, `POST /properties` with `entity: "query"` and `scope_id` |
| Settings: properties | `GET /properties?entity=`, `GET /properties/presets` with the business's type, `POST`/`PATCH`/`DELETE /properties…` |
| Customers | `GET /customers` (search with `q`, paged with `cursor`), `GET /customers/{id}` for the detail page with their conversations and tickets, `POST`/`PATCH`/`DELETE /customers…`, and `GET /tickets?customer=` for all of their tickets |
| Tickets | `GET /tickets` (views, flags, `assignee=me`, `channel`/`channel_type`/`customer` filters, `counts` for badges), `GET /channels` for the channel filter and badges, `GET /tickets/{id}`, `PATCH /tickets/{id}`, `POST /tickets/{id}/replies`, `POST /tickets`, `DELETE /tickets/{id}`, `GET /handoffs`, `GET /members` for the assignee picker, `GET /realtime` for live updates |
| Knowledge base | `GET /knowledge/documents`, `POST /knowledge/documents`, `POST /knowledge/uploads` (then R2 `PUT`), `POST …/process`, `GET`/`PUT`/`DELETE /knowledge/documents/{id}`, `POST …/reindex`, `POST /knowledge/search` |
| Bot configuration | `GET`/`PUT /workspace` (name, template and its variables, knowledge, tools, web search and source policy only; no model or model-setting controls), `GET /prompt-templates`, `GET /tools` for the tool picker |
| Tools | `GET`/`POST /tools`, `GET`/`PUT`/`DELETE /tools/{name}`, `POST /tools/{name}/test` |
| Playground | `GET /playground/conversations/current`, `POST /playground/conversations`, `POST /playground/run` (with the saved or draft bot settings from `GET /workspace`); image input: `GET /playground/attachments/config`, then `POST /playground/attachments` (and the R2 `PUT`) for each picture |
| Integrations | `GET`/`PUT`/`DELETE /webhook`, `POST /webhook/secret`, `POST /webhook/test`, `GET`/`POST /api-keys` (with a channel picker), `DELETE /api-keys/{id}`, `GET /channel-types` with `GET`/`POST`/`PATCH`/`DELETE /channels…`, and the chat API section as the integrator guide |
| Business settings | `GET`/`PATCH /tenant` (name, type, `reply_target_hours`; `limits` and `usage` for the plan box), `GET /plans`, `POST /tenant/leave`, `GET`/`POST`/`DELETE /tenant/deletion-request` for owners |
| Plan and billing | `GET /plans` (each plan with its `token_addon` slider), `GET /billing` (balance, tokens left), `GET /billing/token-addons/quote` (the slider's price), `POST /billing/token-addons` (the slider's buy button, for `billing.write`), `GET /billing/ledger` |
| Team | `GET /members`, `PATCH`/`DELETE /members/{user_id}`, `GET`/`POST /invites`, `DELETE /invites/{id}`, `GET /audit` |
| Platform console | `GET /platform/overview`, `GET`/`PATCH /platform/tenants…`, `GET /platform/tenants/{id}/detail`, `POST /platform/tenants/{id}/balance`, `DELETE /platform/tenants/{id}`, `POST …/restore`, `GET /platform/deleted-tenants`, `GET /platform/deletion-requests` with `POST …/approve` and `…/reject`, `GET`/`POST`/`PATCH`/`DELETE /platform/users…`, `GET /platform/tickets`, `GET`/`PATCH /platform/tools…`, `GET /platform/usage`, `GET /platform/performance`, `GET`/`POST`/`PATCH /platform/models…` (and `POST …/refresh-pricing`), `GET`/`POST`/`PATCH /platform/prompt-templates…`, `GET`/`POST`/`PATCH /platform/channel-types…`, `GET`/`PATCH /platform/channels…`, `GET /platform/customers` |

## 6. Errors

Every error has its HTTP status and this body:

```json
{
  "error": {
    "code": "WORKSPACE_CONFLICT",
    "message": "<explanation for people>",
    "request_id": "req_7eecc8be1e594f01a0ca18563223c9f0"
  }
}
```

`DUPLICATE_DOCUMENT` adds `document_id`. `PLAN_LIMIT_REACHED` adds `limit`: `bots`, `documents_per_bot`, `members`, `replies_per_month`, `tokens_per_month`, `web_search` or `image_input`. `SOLE_OWNER` adds `tenants`.

| HTTP | Codes | What to do |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Fix the body, path or query; `message` says what. |
| 400 | `SCOPE_REQUIRED`, `INVALID_SCOPE` | Send both scope headers, with valid IDs. |
| 400 | `INVALID_TOOL`, `TOOL_UNAVAILABLE` | Fix the tool definition. `TOOL_UNAVAILABLE` comes only from `POST /tools/{name}/test`; replies skip unavailable tools. |
| 400 | `MODEL_NOT_ALLOWED`, `PROMPT_TEMPLATE_NOT_ALLOWED`, `INVALID_PROMPT_VARIABLES`, `PROMPT_NOT_EDITABLE` | Pick from `GET /prompt-templates` and fill required variables. `MODEL_NOT_ALLOWED` now only means the platform's default model can't call tools while tools are on: ask a platform admin. |
| 400 | `INVALID_ASSIGNEE` | Assign a member with `tickets.write`. |
| 400 | `CHANNEL_TYPE_NOT_ALLOWED` | Pick a channel type from `GET /channel-types`. |
| 400 | `CHANNEL_CONNECT_UNSUPPORTED` | Add channels of this type with `POST /channels`. |
| 400 | `FEATURE_UNAVAILABLE`, `WEB_SEARCH_NOT_CONFIGURED` | The server lacks the service this needs. For image input it means no active model can read pictures: hide the attach control. |
| 400 | `UNSUPPORTED_IMAGE_TYPE` | Image input. The file isn't a JPEG, PNG or WebP picture. Ask for another file. |
| 400 | `INVALID_IMAGE` | Image input. The file can't be read, is under 8 px or over 16,384 px on a side, or is too big to open safely. Ask for another file; `message` says why. |
| 400 | `ADDON_NOT_AVAILABLE` | The plan sells no extra tokens (Free), or the business's tokens are unlimited and it needs none. |
| 401 | `UNAUTHORIZED` | Refresh the session or sign in again. |
| 402 | `INSUFFICIENT_BALANCE` | The balance is too low; ask a platform admin for a top-up or buy less. |
| 403 | `FORBIDDEN` | The role lacks the permission; hide the action. |
| 403 | `TENANT_SUSPENDED` | The business is suspended. |
| 403 | `ACCOUNT_DISABLED` | A platform admin disabled the person's account; sign them out. |
| 403 | `CHANNEL_DISABLED` | The chat key's channel, or the one named, is turned off; turn it on, or ask a platform admin. |
| 403 | `INVITE_EMAIL_MISMATCH` | Sign in with the invited address. |
| 403 | `PLAN_LIMIT_REACHED`, `BUSINESS_LIMIT_REACHED` | No room on the plan; `limit` names which. |
| 404 | `NOT_FOUND` | No such route. |
| 404 | `ATTACHMENT_NOT_FOUND` | Image input. The attachment doesn't exist, was already sent, belongs to another conversation or bot, or expired after an hour. Register it again. |
| 404 | `TENANT_NOT_FOUND`, `BOT_NOT_FOUND`, `CONVERSATION_NOT_FOUND`, `TICKET_NOT_FOUND`, `DOCUMENT_NOT_FOUND`, `TOOL_NOT_FOUND`, `MEMBER_NOT_FOUND`, `INVITE_NOT_FOUND`, `KEY_NOT_FOUND`, `WEBHOOK_NOT_FOUND`, `USER_NOT_FOUND`, `MODEL_NOT_FOUND`, `TEMPLATE_NOT_FOUND`, `CHANNEL_NOT_FOUND`, `CHANNEL_TYPE_NOT_FOUND`, `PROPERTY_NOT_FOUND`, `QUERY_NOT_FOUND`, `QUERY_TYPE_NOT_FOUND` | The record doesn't exist, or is outside the caller's scope. |
| 405 | `METHOD_NOT_ALLOWED` | Use a supported method. |
| 408 | `REQUEST_CANCELLED` | The client disconnected. |
| 409 | `WORKSPACE_CONFLICT` | Reload, then reapply the change. |
| 409 | `TICKET_EXISTS`, `BOT_EXISTS`, `TOOL_EXISTS`, `ALREADY_MEMBER`, `DUPLICATE_DOCUMENT`, `CHANNEL_EXISTS`, `CHANNEL_TYPE_EXISTS`, `PROPERTY_EXISTS`, `QUERY_TYPE_EXISTS` | Already exists. |
| 409 | `LAST_OWNER`, `OWN_ACCESS`, `LAST_PLATFORM_ADMIN`, `SOLE_OWNER` | The change would leave a business without an owner or the platform without an admin, or change your own account's access. |
| 409 | `EMAIL_TAKEN` | Another account has this email address. |
| 409 | `INVITE_USED`, `DOCUMENT_BUSY`, `KNOWLEDGE_BASE_FULL`, `CHANNEL_IN_USE`, `QUERY_TYPE_IN_USE` | State conflicts. |
| 409 | `ATTACHMENT_NOT_UPLOADED` | Image input. The message names an attachment whose file hasn't reached R2. Finish the `PUT`, then send again. |
| 403 | `EMAIL_NOT_VERIFIED` | Accepting an invitation needs a confirmed email address (`AUTH_REQUIRE_VERIFIED_EMAIL`); the invitation is not used up. Confirm the address, then open the link again. |
| 409 | `CHECKOUT_IN_PROGRESS` | Billing. Another request is setting up the business's checkout; wait `Retry-After` seconds. |
| 410 | `INVITE_REVOKED`, `INVITE_EXPIRED` | A new invitation is needed. |
| 413 | `BODY_TOO_LARGE` | The body is too large. |
| 413 | `IMAGE_TOO_LARGE` | Image input. The picture is over 20 MB, or can't be shrunk under 1 MiB without ruining it. Ask for a smaller or simpler picture. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Send `Content-Type: application/json`. |
| 503 | `CHANNEL_CONNECT_UNAVAILABLE` | The server has no app configured for the channel's platform; show it as unavailable. |
| 429 | `RATE_LIMITED` | Too many requests too fast; wait `Retry-After` seconds. See "Rate limits". |
| 429 | `PLAN_LIMIT_REACHED` | The month's AI replies are used up, or its tokens are and the balance is empty. |
| 429 | `LLM_RATE_LIMITED` | The model provider is busy; retry shortly. |
| 500 | `INTERNAL_ERROR` | Unexpected; quote the request ID. |
| 502 | `DATABASE_ERROR`, `STORAGE_ERROR`, `RETRIEVAL_FAILED`, `LLM_PROVIDER_ERROR`, `AUTH_PROVIDER_ERROR` | A backing service failed; `message` says which. |
| 503 | `SIGN_IN_NOT_CONFIGURED`, `ADMIN_NOT_CONFIGURED`, `PLAYGROUND_NOT_CONFIGURED`, `CHAT_NOT_CONFIGURED`, `DATABASE_NOT_CONFIGURED`, `LLM_NOT_CONFIGURED`, `REALTIME_NOT_CONFIGURED`, `CRON_NOT_CONFIGURED`, `NOT_CONFIGURED` | The server isn't configured for this. |
| 504 | `LLM_TIMEOUT`, `TIMEOUT` | The operation took too long; retry. |

**Model errors** come from the endpoints that generate replies (`POST /playground/run`, `POST /conversations/{id}/messages`):
- `REQUEST_CANCELLED`
- `LLM_RATE_LIMITED`, `PLAN_LIMIT_REACHED`
- `LLM_PROVIDER_ERROR`, `LLM_NOT_CONFIGURED`, `LLM_TIMEOUT`

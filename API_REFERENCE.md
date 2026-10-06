# Truplexy API reference

Every endpoint of the Truplexy API, and how a dashboard or other frontend uses them. The API is the whole product: a dashboard is a separate app that signs people in with Supabase Auth and calls these endpoints from the browser. [`openapi/openapi.yaml`](openapi/openapi.yaml) describes the same API as an OpenAPI 3 contract, which you can use to generate a typed client.

Contents:

1. [Using the API from a frontend](#1-using-the-api-from-a-frontend)
2. [Roles and permissions](#2-roles-and-permissions)
3. [Endpoint index](#3-endpoint-index)
4. [Endpoints](#4-endpoints)
5. [Which endpoints a dashboard needs where](#5-which-endpoints-a-dashboard-needs-where)
6. [Errors](#6-errors)

## 1. Using the API from a frontend

### Base URL and versions

| Environment | Base URL |
| --- | --- |
| Production | `https://api.zenovasolution.xyz/v2` |
| Local (`go run ./cmd/server`) | `http://localhost:3000/v2` |

Every path in this document is relative to the base URL, so `GET /me` means `GET https://api.zenovasolution.xyz/v2/me`. `/v1` still answers for the endpoints it had before v2 but is deprecated. Its responses carry `Deprecation: true`, a `Link: </v2/…>; rel="successor-version"` header and, once scheduled, a `Sunset` date. Endpoints added in v2 exist only under `/v2`. Build against `/v2`.

### Calling from the browser (CORS)

The API answers browsers only from the origins listed in its `CORS_ALLOWED_ORIGINS` setting (comma-separated, such as `https://dashboard.example.com,http://localhost:5173`). Add your dashboard's local and production origins there, in the API's environment (Vercel project `truplexy-api`), and redeploy. From any other origin, the browser blocks the response.

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
| `message.created` | A customer message, an assistant reply, or a person's reply (from a ticket or an integration). | `{conversation_id, ticket_id?, message: {id, role, content, author?, agent?, created_at}}` |
| `ticket.created` | A ticket is opened. | `{conversation_id, ticket: {id, subject, status, priority, escalated}}` |
| `ticket.updated` | Status, priority, assignee, escalation or subject changes; a note is added; the ticket is deleted. | The same as `ticket.created`. A deletion sends `{ticket: {id}, deleted: true}`. |
| `conversation.updated` | A conversation is flagged for the team (handoff). | `{conversation_id, status}` |

**For customers (chat key).** An integration's server calls `POST /realtime/token` with its chat key and optional `{conversation_id}`. **200** `{url, publishable_key, bot_topic, conversation_topic?, events}`. It may hand `conversation_topic` to the customer's browser, because that topic carries only that conversation's messages and ticket changes, never internal notes. `bot_topic` must stay on the integration's server.

### Work a dashboard does itself

The API stays a pure JSON API. These jobs fall to the frontend:

- **Invitations.**
  - `POST /invites` returns a one-time `token`.
  - Build the link yourself (for example `https://dashboard.example.com/invite/{token}`), and show it or email it with your own email provider. The API sends no email.
  - The invite page calls `POST /invites/preview` to describe the invitation, then `POST /invites/accept` once the person is signed in with the invited address.
- **Backups.**
  - To export, read `GET /workspace` and each document with `GET /knowledge/documents/{id}`, which includes `content`.
  - To import, `PUT /workspace`, then `POST /knowledge/documents` for each article. Expect `409 DUPLICATE_DOCUMENT` for content already present.
- **Template preview.** Render a prompt template's body in the browser to preview it (see [Models and prompt templates](#models-and-prompt-templates)).
- **An integration guide for customers' developers.** The chat API section below is the source; publish it however you like.

## 2. Roles and permissions

Each member has one role in a business. `GET /me` returns the same table as `roles`.

| Permission | Viewer | Agent | Editor | Admin | Owner |
| --- | :-: | :-: | :-: | :-: | :-: |
| `bot.read`, `knowledge.read`, `tools.read`, `tickets.read`, `usage.read`, `members.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `playground.run`, `tickets.write` | | ✓ | ✓ | ✓ | ✓ |
| `bot.write`, `knowledge.write`, `tools.write`, `tickets.delete`, `integrations.read` | | | ✓ | ✓ | ✓ |
| `integrations.write`, `bots.create`, `members.write`, `business.write`, `audit.read` | | | | ✓ | ✓ |
| `owners.manage` | | | | | ✓ |

- **Platform admins and the admin key** pass every permission check, in every business.
- **Owners.** Only an owner (`owners.manage`) can invite, promote, demote or remove an owner. A business always keeps at least one owner (`409 LAST_OWNER`).
- **Refusals.** A role without the endpoint's permission gets `403 FORBIDDEN`. Role changes take effect within 30 seconds on every server.

## 3. Endpoint index

**Access** is the permission a member needs, or the group from [Endpoint groups](#endpoint-groups-and-credentials). **v2** marks endpoints that `/v1` doesn't have.

| Method | Path | Access | Does |
| --- | --- | --- | --- |
| `GET` | `/health` | anyone | Check that the API is running |
| `GET` | `/me` | account | The signed-in person and their businesses |
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
| `GET` | `/bots` | `bot.read` | List the business's bots |
| `POST` | `/bots` | `bots.create` | Create a bot |
| `GET` | `/api-keys` | `integrations.read` | List chat API keys |
| `POST` | `/api-keys` | `integrations.write` | Issue a chat API key |
| `DELETE` | `/api-keys/{id}` | `integrations.write` | Revoke a chat API key |
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
| `GET` | `/handoffs` | `tickets.read` | Conversations the assistant flagged |
| `GET` | `/realtime` | `tickets.read` | The bot's live update topic (v2) |
| `GET` | `/webhook` | `integrations.read` | The bot's webhook |
| `PUT` | `/webhook` | `integrations.write` | Set the webhook |
| `DELETE` | `/webhook` | `integrations.write` | Remove the webhook |
| `POST` | `/webhook/secret` | `integrations.write` | Replace the signing secret |
| `POST` | `/webhook/test` | `integrations.write` | Send a test event |
| `GET` | `/usage/summary` | `usage.read` | Model usage, cost and answer quality |
| `GET` | `/stats/support` | `usage.read` | Tickets, response times and cost per ticket (v2) |
| `POST` | `/playground/run` | `playground.run` | Answer a message with given settings |
| `GET` | `/playground/conversations/current` | `playground.run` | The latest playground conversation |
| `POST` | `/playground/conversations` | `playground.run` | Start a playground conversation |
| `GET` | `/platform/overview` | platform | Platform totals and this month's activity (v2) |
| `GET` | `/platform/tenants` | platform | Every business |
| `PATCH` | `/platform/tenants/{id}` | platform | Change a business's plan, status or limits |
| `GET` | `/platform/tenants/{id}/detail` | platform | A business's members, bots and activity (v2) |
| `GET` | `/platform/users` | platform | Everyone who has signed in (v2) |
| `PATCH` | `/platform/users/{id}` | platform | Grant or revoke platform admin (v2) |
| `GET` | `/platform/tickets` | platform | Tickets across businesses (v2) |
| `GET` | `/platform/tools` | platform | API tools across businesses (v2) |
| `PATCH` | `/platform/tools/{id}` | platform | Turn a tool off or on (v2) |
| `GET` | `/platform/usage` | platform | Usage by business, model or day (v2) |
| `GET` | `/platform/models` | platform | The model catalog (v2) |
| `POST` | `/platform/models` | platform | Add a model (v2) |
| `PATCH` | `/platform/models/{id}` | platform | Change a model (v2) |
| `GET` | `/platform/prompt-templates` | platform | The prompt templates (v2) |
| `POST` | `/platform/prompt-templates` | platform | Add a prompt template (v2) |
| `PATCH` | `/platform/prompt-templates/{id}` | platform | Change a prompt template (v2) |
| `POST` | `/conversations` | chat key | Start a conversation |
| `GET` | `/conversations/{id}` | chat key | A conversation with its latest messages |
| `POST` | `/conversations/{id}/messages` | chat key | Send a customer message, get the reply |
| `POST` | `/conversations/{id}/escalate` | chat key | Hand the conversation to a person |
| `POST` | `/conversations/{id}/handoff` | chat key | Accept an offered handoff |
| `POST` | `/conversations/{id}/ticket` | chat key | Open a ticket without escalating |
| `POST` | `/conversations/{id}/ticket/close` | chat key | Close the conversation's ticket |
| `POST` | `/conversations/{id}/replies` | chat key | Record a reply written on the integration's platform |
| `POST` | `/realtime/token` | chat key | Live update topics for an integration (v2) |
| `GET` | `/internal/cron/knowledge` | `CRON_SECRET` | Finish stalled indexing (v2; not for frontends) |

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

**200** `{data: [{id, name, limits: {bots, documents_per_bot, members, replies_per_month}}]}`. A limit of 0 means unlimited. The plans are Free, Starter, Pro and Enterprise. Plans are assigned by platform admins; there is no billing.

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
  limits: {bots, documents_per_bot, members, replies_per_month},   // the plan's, with overrides; 0 = unlimited
  limit_overrides: {…},                          // only what a platform admin overrode
  usage: {bots, members, replies_this_month}     // members includes pending invitations
}
```

#### `GET /tenant`

`members.read`. **200** the Business.

#### `PATCH /tenant`

`business.write`. Send any of these; leave out what doesn't change:
- `name`: 1–80 characters.
- `business_type`.
- `reply_target_hours`: 1–720.

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

**201** the invitation with its one-time `token`. Build the invitation link from it; see [Work a dashboard does itself](#work-a-dashboard-does-itself).

**Errors:**
- `403 FORBIDDEN`
- `403 PLAN_LIMIT_REACHED` (`limit: "members"`)
- `409 ALREADY_MEMBER`

#### `DELETE /invites/{id}`

`members.write`. Cancels a pending invitation (`inv_…`). **204**. **Errors:** `404 INVITE_NOT_FOUND`.

#### `GET /audit`

`audit.read`. **200** `{data: [{id, actor, actor_email, action, target, details, created_at}]}`: the latest 100 events, newest first.
- `actor` is a user ID, or `service` for the admin key.
- `action` is a string such as `member.role_changed`, `invite.created`, `api_key.created`, `bot.created` or `business.updated`.
- The log covers members, invitations, roles, bots, API keys, plans and business details, not conversations or documents.

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

`integrations.read`. **200** `{data: [{id, name, tenant_id, bot_id, key_prefix, status, created_at, last_used_at?}]}`, newest first, without secrets. `status` is `active` or `revoked`.

#### `POST /api-keys`

`integrations.write`. `{bot_id, name}`. **201** the key, with the secret in `key` (`tpx_` plus 48 hex characters). The secret is returned only this once, so show it with a copy button and a warning. The key reaches only that bot's conversations. **Errors:** `404 BOT_NOT_FOUND`.

#### `DELETE /api-keys/{id}`

`integrations.write`. Revokes the key (`key_…`); it stops working everywhere within a minute. **204**. **Errors:** `404 KEY_NOT_FOUND`.

### Bot configuration (workspace)

Scope headers; these act on the bot. Customer chat uses the saved configuration from the next message, with no separate publish step.

#### `GET /workspace`

`bot.read`. **200** `{name, bot, revision, updated_at, history, defaults}`:
- `bot`: the configuration below.
- `revision`: 0 until the first save. Send it back when saving.
- `history`: the 30 latest saved versions, as `{id, savedAt, bot}`, for a "restore version" picker. Restoring only fills the form; saving applies it.
- `defaults`: `{name, bot}`, the business type's starting configuration, for "reset to defaults".

#### `PUT /workspace`

`bot.write`. `{name, bot, revision}`. `name` (1–80 characters) is the bot's display name. Fields of `bot` are camelCase:

| Field | Rules |
| --- | --- |
| `name` | 1–80 characters. The assistant's name, filled into templates as `{{assistant_name}}`. |
| `promptTemplateId` | A template `id` from `GET /prompt-templates`. Choosing one clears `prompt`. |
| `promptVariables` | `{key: value}` for the template's variables; unknown keys are dropped. Values become one line, capped at the variable's `max_length`. |
| `prompt` | Read-only. The system prompt of a bot saved before templates, used until it picks a template. Send it back as loaded, or empty. |
| `model` | A model `id` from `GET /models`, or the bot's current one. Empty uses the platform's default model. |
| `temperature` | 0–2. |
| `maxTokens` | Output limit, 1–32768. Capped by the model's `max_output_tokens`. |
| `ragEnabled` | Answer from the knowledge base. |
| `topK` | The most passages per message, 1–20. |
| `toolsEnabled` | Let the model call `tools`. Needs a model with `supports_tools`. |
| `tools` | Up to 20 unique tool names from `GET /tools`. |

**200** the saved workspace (a new `revision`). Every save adds a version when `bot` changed.

**Errors:**

| Code | Meaning |
| --- | --- |
| `409 WORKSPACE_CONFLICT` | Someone saved since you loaded. Reload, then apply the change again. |
| `400 MODEL_NOT_ALLOWED` | The model isn't offered, or can't call tools while tools are on. |
| `400 PROMPT_TEMPLATE_NOT_ALLOWED` | The template isn't offered to this business type. |
| `400 INVALID_PROMPT_VARIABLES` | A required variable is empty. |
| `400 PROMPT_NOT_EDITABLE` | `prompt` was changed. |
| `400 INVALID_REQUEST` | A field breaks the rules above. |

### Models and prompt templates

Platform admins own the catalog; businesses only pick from it.

#### `GET /models`

`bot.read`. **200** `{models: [{id, label, description, tier, context_tokens, max_output_tokens, supports_tools, is_default, offered}]}`.
- `id` is an OpenRouter model ID, such as `google/gemini-3.1-flash-lite`.
- `tier` is `economy`, `standard` or `premium`; businesses don't see prices.
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
  api: {method, url, created_at, updated_at}
}
```

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

Scope headers; these act on the bot. A ticket is a support case, usually for one conversation, and a conversation has at most one unresolved ticket.

**Ticket:**

```text
{
  id, conversation_id?, channel?,          // channel: api | playground
  subject,
  status,                                  // open | in_progress | waiting_customer | resolved | closed
  priority,                                // low | normal | high | urgent
  assignee_user_id?, assignee_name?,       // the member it is assigned to
  assignee?,                               // legacy free text set by API callers
  escalated, escalated_at?,                // escalated: a person has the conversation; the AI is silent
  source,                                  // dashboard | customer
  needs_reply, handed_off,
  flags: {needs_reply, escalated, handed_off, unassigned, overdue, reopened},
  last_customer_at?, last_agent_at?,
  first_response_at?, resolved_at?, closed_at?, reopen_count,
  created_at, updated_at
}
```

**Statuses.**
- `open`, `in_progress` and `waiting_customer` are unresolved; `resolved` and `closed` are done.
- A closed ticket can only be reopened, by sending `status: open` (`409 INVALID_STATUS_CHANGE` otherwise). A resolved ticket can move anywhere.

**Automatic changes:**
- Assigning someone to an `open` ticket moves it to `in_progress`.
- A customer message moves `waiting_customer` back to `open`, and sets `needs_reply`.
- Resolving or closing ends escalation, and the assistant answers again.

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
| `view` | `all` (default), `open` (every unresolved), `needs_reply`, `escalated` or `mine` (the caller's unresolved tickets). |
| `flag` | One of the flags above. |
| `assignee` | `me`, `none`, or a member's user ID. |
| `status`, `priority` | One value each. |
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

Opening a ticket for a flagged conversation clears the flag. To take over a conversation from `GET /handoffs`, send its `conversation_id` with `escalated: true`. **201** the ticket.

**Errors:**
- `404 CONVERSATION_NOT_FOUND`
- `409 TICKET_EXISTS` (the conversation already has an unresolved ticket; `message` names it)

#### `GET /tickets/{id}`

`tickets.read`. **200** the ticket plus:
- **`messages`:** the conversation's latest 200 messages, oldest first. Each is `{id, role, content, author, agent?, via?, status?, error?, model?, usage?, created_at}`.
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
| `status` | See the statuses above. |
| `priority` | `low`, `normal`, `high` or `urgent`. |
| `assignee_user_id` | A member whose role has `tickets.write` (agent or above); `""` unassigns. Use `GET /members` for the picker. |
| `escalated` | `true` takes the conversation over (reopening a done ticket); `false` hands it back to the AI. Can't be combined with `resolved` or `closed`. |
| `assignee` | Legacy free text, up to 64 characters. |

**200** the ticket.

**Errors:**
- `400 INVALID_ASSIGNEE`
- `404 TICKET_NOT_FOUND`
- `409 INVALID_STATUS_CHANGE`
- `409 TICKET_EXISTS` (reopening would make a second unresolved ticket for the conversation)

#### `DELETE /tickets/{id}`

`tickets.delete`. Deletes the ticket with its replies and notes. The conversation keeps its messages, and deleting an escalated ticket hands the conversation back to the AI. **204**.

#### `POST /tickets/{id}/replies`

`tickets.write`.

| Field | Rules |
| --- | --- |
| `kind` | `reply` (default) reaches the customer; `note` stays internal. |
| `content` | Required. 1–8000 characters. |
| `status` | Optional. Also sets the ticket's status, for example `waiting_customer` after a reply, or `resolved`. |

The signed-in person is recorded as the author; any `author` sent is replaced. A reply is added to the conversation (`author: "agent"`), clears the handoff flag, sets `first_response_at` if unset, and goes to the bot's webhook and live topics. **201** `{reply, ticket}`.

#### `GET /handoffs`

`tickets.read`. **200** `{data: [{conversation_id, channel, title, updated_at}]}`: the latest 50 conversations the assistant flagged for the team, most recent first, that have no unresolved ticket. The assistant keeps replying in them until someone takes one over.

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
  url, enabled,
  secret?,                    // whsec_…, only when just created or replaced: show it once
  secret_hint,                // whsec_…abcd
  events,                     // ["message.created", "ticket.updated"]
  last_delivery?: {event, ok, status?, error?, at},
  created_at, updated_at
}
```

#### `GET /webhook`

`integrations.read`. **200** the webhook, without its secret. **Errors:** `404 WEBHOOK_NOT_FOUND`: there is none yet (show an empty form).

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
  estimated_cost,                 // USD, as OpenRouter reported
  avg_latency_ms,
  by_day:   [{date, requests, input_tokens, output_tokens, total_tokens, estimated_cost}],   // every day, zeros included
  by_model: [{model, requests, total_tokens, estimated_cost, avg_latency_ms}],               // top 5
  tool_calls: {total, errors, avg_latency_ms, by_tool: [{name, calls, errors, avg_latency_ms}]},
  rag: {requests, no_answer_rate, handoff_rate, clarification_rate, cache_hit_rate,
        rewrite_rate, degraded_rate, avg_latency_ms, avg_retrieval_ms}   // rates from 0 to 1
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
  tickets: {created, resolved, closed, from_customer, reopened, reopen_rate},
  backlog: {total, overdue, unassigned, by_status: {…}, by_priority: {…}},
                   // unresolved tickets now, whatever the range
  first_response: {count, avg_seconds, median_seconds, p90_seconds},
  resolution:     {count, avg_seconds, median_seconds, p90_seconds},
  cost: {total, per_ticket, per_conversation, per_ai_resolved},
                   // USD; a ticket's cost is its conversation's AI cost
  by_day: [{date, conversations, tickets_created, tickets_resolved, ticket_cost}]
}
```

**Errors:** `400 INVALID_REQUEST`.

### Playground

Scope headers, `playground.run`. Runs real model and tool requests for trying settings. Playground conversations are kept apart from customer conversations and are shared by the bot's team.

#### `POST /playground/run`

| Field | Rules |
| --- | --- |
| `message` | 1–4000 characters. May be omitted with `resend`. |
| `max_output_tokens` | Required. 1–32768. |
| `prompt_template_id`, `prompt_variables` | The template to answer with, checked as saving would. Usually the bot's saved or draft values. |
| `assistant_name` | Fills `{{assistant_name}}`; defaults to the saved bot's. |
| `system_prompt` | Only the bot's own pre-template prompt, or empty (`400 PROMPT_NOT_EDITABLE`). |
| `model` | A model from `GET /models`, or the bot's current one; empty uses the default. |
| `temperature` | 0–2; omit it for the provider's default. |
| `conversation_id` | A playground conversation to continue; both messages are stored, and recent messages go along as history. |
| `resend` | With `conversation_id`: answer the last stored message again, replacing its reply. |
| `history` | Only without `conversation_id`: up to 40 `{role, content}` turns, and nothing is stored. |
| `rag_enabled`, `rag_top_k` | Knowledge retrieval, and the most passages (1–20, default 4). |
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
  sources,                                                         // null with retrieval off
  context_tokens,
  conversation_id?, user_message?, reply?,                         // with conversation_id: the stored messages
  debug?
}
```

There's no streaming; show a pending state, and allow cancelling with `AbortController`. Tokens may still be spent after a cancel.

**Errors:**
- `400 INVALID_REQUEST`
- `404 CONVERSATION_NOT_FOUND`
- [Model errors](#6-errors)

#### `GET /playground/conversations/current`

**200** `{conversation}`: the latest playground conversation with up to 200 messages, each with its model, usage, status, sources and tool calls. `conversation` is `null` when there is none.

#### `POST /playground/conversations`

No body. **201** a new empty playground conversation; older ones are kept.

### Platform administration

A platform admin's token (`platform_admin: true` in `GET /me`) or the admin key; no scope headers. Platform changes are recorded in the activity log, under the business they affect or under `_platform`.

#### `GET /platform/overview`

**200**:

```text
{
  businesses, suspended_businesses, users, platform_admins, bots,
  conversations_this_month,          // chat API conversations, this UTC month
  open_tickets, needs_reply,
  replies_this_month, cost_this_month,
  by_day: [{date, requests, input_tokens, output_tokens, total_tokens, estimated_cost}]   // last 30 days
}
```

#### `GET /platform/tenants`

**200** `{data: [Business + {owner_email, first_bot}]}`, every business newest first.

#### `PATCH /platform/tenants/{id}`

`{plan?, status?, limits?}`; leave out what doesn't change.
- `plan`: a plan `id` from `GET /plans`.
- `status`: `active` or `suspended`. Suspending blocks the business's members and chat keys.
- `limits`: `{bots?, documents_per_bot?, members?, replies_per_month?}`, each 0 (unlimited) to 10,000,000. It replaces every override, and a dimension left out uses the plan's limit. Send `{}` to clear them all.

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
          replies_this_month, cost_this_month}],
          // own_prompt: still uses a pre-template prompt
          // saved: false = never configured
  open_tickets,
  audit: [{id, actor, action, target, created_at}]   // recent events
}
```

**Errors:** `404 TENANT_NOT_FOUND`.

#### `GET /platform/users`

`?q=` searches email and name (up to 120 characters). **200** `{data: [{id, email, name, platform_admin, created_at, last_seen_at?, memberships: [{tenant_id, tenant_name, role}]}]}`: up to 100 people, most recently seen first.

#### `PATCH /platform/users/{id}`

`{platform_admin: true | false}`. **200** `{id, platform_admin}`.

**Errors:**
- `404 USER_NOT_FOUND`
- `409 OWN_ACCESS`: admins can't revoke their own access.

#### `GET /platform/tickets`

Read only, across businesses, most recently updated first, 100 per page.

| Query | Rules |
| --- | --- |
| `tenant` | A business ID. |
| `view` | `all`, `open`, `needs_reply` or `escalated`. |
| `status`, `priority` | One value each. |
| `before` | `next_before` from the previous page. |

**200** `{data: [{id, tenant_id, tenant_name, bot_id, subject, status, priority, source, escalated, needs_reply, handed_off, created_at, updated_at}], next_before?}`. To open one, act in that business as a platform admin, using its scope headers with `GET /tickets/{id}`.

#### `GET /platform/tools`

`?tenant=` narrows to one business. **200** `{data: [{id, tenant_id, tenant_name, name, method, url, read_only, disabled, calls, errors, avg_latency_ms, updated_at}]}`, where calls and errors cover the last 30 days.

#### `PATCH /platform/tools/{id}`

`{disabled: true | false}`. A disabled tool stays listed for its business as unavailable, and no bot can call it. **200** `{id, disabled}`. **Errors:** `404 TOOL_NOT_FOUND`.

#### `GET /platform/usage`

| Query | Rules |
| --- | --- |
| `from`, `to` | As in `GET /usage/summary`. |
| `group` | `tenant` (default), `model` or `day`. |

**200** `{from, to, group, data: [{key, label, requests, input_tokens, output_tokens, cached_tokens, total_tokens, estimated_cost, avg_latency_ms}]}`. `key` is the business ID, model ID or date.

#### `GET /platform/models`

**200** `{models: [Model + {bots}]}`, where `bots` counts the saved bots using each model.

```text
Model: {
  id,                                            // OpenRouter model ID
  label, description,
  input_price_per_mtok, output_price_per_mtok,   // USD per million tokens
  context_tokens,
  max_output_tokens,                             // caps bots' output; 0 = no cap
  supports_tools,
  supports_prompt_cache,                         // send the system prompt as a cache breakpoint
  status,                                        // active (offered) | hidden (kept by bots using it) | retired (bots use the default)
  is_default, sort_order, created_at, updated_at
}
```

#### `POST /platform/models`

A Model's fields:
- Required: `id` (an OpenRouter model ID such as `vendor/model`) and `label` (1–80 characters).
- `description`: up to 300 characters.
- Prices: 0–10,000.
- `context_tokens`: up to 100,000,000.
- `max_output_tokens`: up to 1,000,000.
- `sort_order`: −10,000 to 10,000.
- `status` defaults to active and `supports_tools` to true. `is_default` needs an active model; setting it moves the default.

**201** the model with `bots`. **Errors:** `400 INVALID_REQUEST` (`message` says which rule).

#### `PATCH /platform/models/{id}`

Any of the fields above, except `id`. The ID contains a slash, so URL-encode it in the path: `/platform/models/google%2Fgemini-3.1-flash-lite`. Models aren't deleted: retire one, and its bots move to the default model. Use `bots` to warn before retiring.

**200** the model.

**Errors:**
- `400 INVALID_REQUEST`
- `404 MODEL_NOT_FOUND`

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

### Chat API (for integrations)

These endpoints are for websites, apps and messaging platforms, called from the integration's **server** with a chat key. Never call them from a browser. A dashboard doesn't call them, but it issues the keys (`POST /api-keys`) and should show integrators this section. A key reaches only conversations started through the chat API for its bot. Anything else returns `404 CONVERSATION_NOT_FOUND`.

**Conversation:**
- Fields: `{id, status, escalated, created_at, updated_at, messages}`.
- `status` is `open`, or `handoff` once it has been flagged for the team.
- `messages` holds up to the latest 200, oldest first. Each is `{id, role, content, author?, agent?, created_at}`, with `role` `user` or `assistant`. A person's reply has `author: "agent"` and `agent` naming them.

#### `POST /conversations`

No body. **201** an empty conversation.

#### `GET /conversations/{id}`

**200** the conversation. Polling it is one way to pick up the team's replies; the webhook and live topics are the others.

#### `POST /conversations/{id}/messages`

`{message}`, 1–4000 characters. The reply is generated with the bot's saved configuration and has 45 seconds by default.

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
- `429 PLAN_LIMIT_REACHED` (the business's monthly replies are used up)
- [Model errors](#6-errors)

After an error the message stays stored, marked unanswered, and is left out of the conversation.

#### `POST /conversations/{id}/escalate`

No body. Opens an escalated ticket, or escalates the open one, so the AI goes silent until the team hands the conversation back. It is safe to repeat. **200** the conversation (`escalated: true`).

#### `POST /conversations/{id}/handoff`

No body. Flags the conversation for the team and adds a confirmation message. The AI keeps replying. **200** the conversation.

#### `POST /conversations/{id}/ticket`

Optional `{subject, priority}`. Opens a ticket without escalating, or returns the open one. **200** `{id, subject, status, priority, escalated, created_at}`.

#### `POST /conversations/{id}/ticket/close`

No body. Closes the open ticket, ends escalation and clears the handoff flag. If no ticket is open, it returns the latest one. **200** the ticket. **Errors:** `404 TICKET_NOT_FOUND` (the conversation never had one).

#### `POST /conversations/{id}/replies`

Records a reply a person wrote on the integration's platform.

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

## 5. Which endpoints a dashboard needs where

A guide to which calls back each typical area. It doesn't prescribe screens.

| Area | Endpoints |
| --- | --- |
| Session and switching | `GET /me`; scope headers from the chosen membership and bot; `GET /bots` to switch bots; `POST /bots` to add one |
| Onboarding | `GET /business-types`, `POST /tenants` |
| Accepting an invitation | `POST /invites/preview`, then `POST /invites/accept` |
| Overview | `GET /usage/summary`, `GET /stats/support` (`scope=bot` or `business`), `GET /health` for an API status dot |
| Tickets | `GET /tickets` (views, flags, `assignee=me`, `counts` for badges), `GET /tickets/{id}`, `PATCH /tickets/{id}`, `POST /tickets/{id}/replies`, `POST /tickets`, `DELETE /tickets/{id}`, `GET /handoffs`, `GET /members` for the assignee picker, `GET /realtime` for live updates |
| Knowledge base | `GET /knowledge/documents`, `POST /knowledge/documents`, `POST /knowledge/uploads` (then R2 `PUT`), `POST …/process`, `GET`/`PUT`/`DELETE /knowledge/documents/{id}`, `POST …/reindex`, `POST /knowledge/search` |
| Bot configuration | `GET`/`PUT /workspace`, `GET /models`, `GET /prompt-templates`, `GET /tools` for the tool picker |
| Tools | `GET`/`POST /tools`, `GET`/`PUT`/`DELETE /tools/{name}`, `POST /tools/{name}/test` |
| Playground | `GET /playground/conversations/current`, `POST /playground/conversations`, `POST /playground/run` (with the saved or draft bot settings from `GET /workspace`) |
| Integrations | `GET`/`PUT`/`DELETE /webhook`, `POST /webhook/secret`, `POST /webhook/test`, `GET`/`POST /api-keys`, `DELETE /api-keys/{id}`, and the chat API section as the integrator guide |
| Business settings | `GET`/`PATCH /tenant` (name, type, `reply_target_hours`; `limits` and `usage` for the plan box), `GET /plans`, `POST /tenant/leave` |
| Team | `GET /members`, `PATCH`/`DELETE /members/{user_id}`, `GET`/`POST /invites`, `DELETE /invites/{id}`, `GET /audit` |
| Platform console | `GET /platform/overview`, `GET`/`PATCH /platform/tenants…`, `GET /platform/tenants/{id}/detail`, `GET`/`PATCH /platform/users…`, `GET /platform/tickets`, `GET`/`PATCH /platform/tools…`, `GET /platform/usage`, `GET`/`POST`/`PATCH /platform/models…`, `GET`/`POST`/`PATCH /platform/prompt-templates…` |

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

`DUPLICATE_DOCUMENT` adds `document_id`. `PLAN_LIMIT_REACHED` adds `limit`: `bots`, `documents_per_bot`, `members` or `replies_per_month`.

| HTTP | Codes | What to do |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Fix the body, path or query; `message` says what. |
| 400 | `SCOPE_REQUIRED`, `INVALID_SCOPE` | Send both scope headers, with valid IDs. |
| 400 | `INVALID_TOOL`, `UNKNOWN_TOOL`, `TOOL_UNAVAILABLE` | Fix the tool definition, or the bot's tool selection. |
| 400 | `MODEL_NOT_ALLOWED`, `PROMPT_TEMPLATE_NOT_ALLOWED`, `INVALID_PROMPT_VARIABLES`, `PROMPT_NOT_EDITABLE` | Pick from `GET /models` and `GET /prompt-templates`, and fill required variables. |
| 400 | `INVALID_ASSIGNEE` | Assign a member with `tickets.write`. |
| 400 | `FEATURE_UNAVAILABLE` | The server lacks the service this needs. |
| 401 | `UNAUTHORIZED` | Refresh the session or sign in again. |
| 403 | `FORBIDDEN` | The role lacks the permission; hide the action. |
| 403 | `TENANT_SUSPENDED` | The business is suspended. |
| 403 | `INVITE_EMAIL_MISMATCH` | Sign in with the invited address. |
| 403 | `PLAN_LIMIT_REACHED`, `BUSINESS_LIMIT_REACHED` | No room on the plan; `limit` names which. |
| 404 | `NOT_FOUND` | No such route. |
| 404 | `TENANT_NOT_FOUND`, `BOT_NOT_FOUND`, `CONVERSATION_NOT_FOUND`, `TICKET_NOT_FOUND`, `DOCUMENT_NOT_FOUND`, `TOOL_NOT_FOUND`, `MEMBER_NOT_FOUND`, `INVITE_NOT_FOUND`, `KEY_NOT_FOUND`, `WEBHOOK_NOT_FOUND`, `USER_NOT_FOUND`, `MODEL_NOT_FOUND`, `TEMPLATE_NOT_FOUND` | The record doesn't exist, or is outside the caller's scope. |
| 405 | `METHOD_NOT_ALLOWED` | Use a supported method. |
| 408 | `REQUEST_CANCELLED` | The client disconnected. |
| 409 | `WORKSPACE_CONFLICT` | Reload, then reapply the change. |
| 409 | `INVALID_STATUS_CHANGE` | Reopen the closed ticket first. |
| 409 | `TICKET_EXISTS`, `BOT_EXISTS`, `TOOL_EXISTS`, `ALREADY_MEMBER`, `DUPLICATE_DOCUMENT` | Already exists. |
| 409 | `LAST_OWNER`, `OWN_ACCESS` | The change would leave no owner, or remove your own platform access. |
| 409 | `INVITE_USED`, `DOCUMENT_BUSY`, `KNOWLEDGE_BASE_FULL` | State conflicts. |
| 410 | `INVITE_REVOKED`, `INVITE_EXPIRED` | A new invitation is needed. |
| 413 | `BODY_TOO_LARGE` | The body is too large. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Send `Content-Type: application/json`. |
| 429 | `PLAN_LIMIT_REACHED` | The month's AI replies are used up. |
| 429 | `LLM_RATE_LIMITED` | The model provider is busy; retry shortly. |
| 500 | `INTERNAL_ERROR` | Unexpected; quote the request ID. |
| 502 | `DATABASE_ERROR`, `STORAGE_ERROR`, `RETRIEVAL_FAILED`, `LLM_PROVIDER_ERROR` | A backing service failed; `message` says which. |
| 503 | `SIGN_IN_NOT_CONFIGURED`, `ADMIN_NOT_CONFIGURED`, `PLAYGROUND_NOT_CONFIGURED`, `CHAT_NOT_CONFIGURED`, `DATABASE_NOT_CONFIGURED`, `LLM_NOT_CONFIGURED`, `REALTIME_NOT_CONFIGURED`, `CRON_NOT_CONFIGURED` | The server isn't configured for this. |
| 504 | `LLM_TIMEOUT`, `TIMEOUT` | The operation took too long; retry. |

**Model errors** come from the endpoints that generate replies (`POST /playground/run`, `POST /conversations/{id}/messages`):
- `UNKNOWN_TOOL`, `TOOL_UNAVAILABLE`
- `REQUEST_CANCELLED`
- `LLM_RATE_LIMITED`, `PLAN_LIMIT_REACHED`
- `LLM_PROVIDER_ERROR`, `LLM_NOT_CONFIGURED`, `LLM_TIMEOUT`

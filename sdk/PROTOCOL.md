# Widget ↔ server protocol

The Truplexy widget never talks to Truplexy directly: a chat key in a browser could be copied by anyone. It talks to **one route on your server**, which holds the key and calls the [chat API](../API_REFERENCE.md#chat-api-for-integrations). `@truplexy/server` implements this route for JavaScript runtimes. This page is for writing it in any other language. The dashboard's Website chat guide has ready-made versions for Python, PHP and Go, and [`wordpress/`](wordpress/) has a WordPress plugin.

## Requests

Every request is `POST <your route>` with a JSON object body:

```json
{ "action": "message", "session": "<token or null>", "text": "Where is my order?" }
```

| `action` | Extra fields | Your server calls | Responds with |
| --- | --- | --- | --- |
| `message` | `text`, `customer?` | `PUT /customer` then `POST /conversations` with `{customer_id}` if there's no valid session, then (only for a new conversation) `POST /conversations/{id}/ticket`, then `POST /conversations/{id}/messages` with `{message: text}` | `{session, message, reply, status, sources, ticket?}`, the API's fields plus a new session, and `ticket: {id, subject, status}` when this call opened one |
| `history` | n/a | `GET /conversations/{id}` | `{session, conversation: {status, escalated, messages}}`, or `{session: null}` when there's no valid session or the API says `CONVERSATION_NOT_FOUND` |
| `handoff` | n/a | `POST /conversations/{id}/handoff` | `{session, conversation}` |
| `profile` | n/a | `GET /profile`, which needs no session | `{business: {name, logo_url}, bot: {id, name, avatar_url}, widget?: {…}}`; leave out any field the API doesn't send |
| `live` | n/a | `POST /realtime/token` with `{conversation_id: id}` | `{url, publishable_key, conversation_topic}`, or `{}` when there's no session or the API answers `503 REALTIME_NOT_CONFIGURED` |

Rules:

- **Validate `text`**: trim it; it must be 1–4000 characters and must not start with `[Context only`, which the API treats as background rather than a question.
- **Forward only names, pictures and the look** from `/profile`: the fields above and nothing else. The widget shows them in its header, so a failure here (an older API answering 404, say) can simply return the error: the widget keeps its defaults.
- **Pass `widget` on, field by field.** It is how the business set the chat window to look in the Truplexy dashboard (Integrations → Chat widget), one setting for every site: `heading`, `subtitle`, `greeting`, `placeholder`, `accent` (`#rrggbb`), `theme` (`light`, `dark`, `auto`), `position` (`right`, `left`), `show_sources`, `details` (`ask`, `off`) and `picture_url` (an `https` link). Copy only those, checking each value's type, and leave `widget` out when the API sends none. The widget applies it beneath its own attributes, so a site that sets `accent` itself keeps its colour. A route that doesn't pass it on keeps the widget's plain defaults.
- **Never forward `bot_topic`** from `/realtime/token`. It carries every customer's conversations. `conversation_topic` is safe for the browser.
- **Trusted identity**: for a new conversation, run the server customer resolver first. A non-null `{contacts, name?, metadata?}` replaces browser details; null/undefined falls back to the form. Never accept a browser-supplied `customer_id` or trusted metadata. Use `details="off"` when the server supplies identity.
- **Customer details**: the widget asks for a name and email before a conversation's first message and sends `customer: {name, email}` with messages. When used, both fields are required: name 1–120 characters and email up to 254. Convert them to `{name, contacts: [{type: "email", value: <email>}]}` for `PUT /customer`. Start the conversation with the returned `customer_id`. Linking failure must stop creation; retry `409 CUSTOMER_EXISTS` once, never `CUSTOMER_CONFLICT`. Then send a `[Context only]` message describing the customer, and attempt to open a ticket with `{subject: "Chat with <name>"}` (`"Website chat"` without a name), adding `keep_open: true` when the site owner wants the tickets to stay open until the team closes them (otherwise they close on their own after the business's auto-close time). Pass on only its `{id, subject, status}`. Background context and ticket creation remain best effort. Details and the ticket are kept in the visitor's browser.
- **Hide background messages**: in `history` and `handoff`, drop `user` messages whose `content` starts with `[Context only`, and pass on only `id, role, content, author, agent, created_at` for each message. `author` is `customer`, `assistant`, `agent` (a team member's reply, named by `agent`) or `system` (a notice that a person joined or handed the conversation back, such as "Sam has joined and will reply here."); the widget shows a `system` message as a line, not a bubble, so pass it on unchanged.
- **Return a fresh `session`** in every successful response that has a conversation. The expiry then slides with activity.
- **Should**: when `message` gets `CONVERSATION_NOT_FOUND` for a valid session, start a new conversation and send the message there.
- **Should**: to give the assistant background (who's signed in, their plan), send `[Context only] …` as the first message of a new conversation, before the visitor's.

## Sessions

The browser keeps a signed token that names its conversation, so your server needs no database and visitors can't open each other's chats.

```
payload = "<conversation_id>.<issued_at>"              // e.g. conv_3f…a9.1791551109 (Unix seconds)
token   = base64url(payload) + "." + base64url(HMAC_SHA256(secret, payload))
```

- `base64url` is RFC 4648 §5 **without padding**.
- `secret` is `TRUPLEXY_SESSION_SECRET` if set, otherwise the chat key. Changing it ends every visitor's session; their next message starts a new conversation.
- **To verify:**
  1. Split on `.` into exactly two parts and decode both.
  2. Recompute the HMAC over the decoded payload and compare it in constant time.
  3. Match the payload against `^(conv_[0-9a-f]{32})\.(\d+)$`.
  4. Accept it if `now - issued_at` is between −300 and the TTL (30 days by default).
  
  Anything else counts as no session; it isn't an error.

## Errors

Answer failures with an HTTP status and:

```json
{ "error": { "code": "PLAN_LIMIT_REACHED", "message": "The assistant can't reply right now.", "request_id": "req_…" } }
```

`message` is shown to the visitor, so write it yourself and never pass on the API's message, which can contain internal detail. Suggested mapping:

| API answer | Your status and code |
| --- | --- |
| Invalid `text`, unknown action, bad JSON | `400 INVALID_REQUEST` |
| `CHANNEL_DISABLED`, `TENANT_SUSPENDED`, `PLAN_LIMIT_REACHED` | `503` with the same code |
| `LLM_RATE_LIMITED` | `429 LLM_RATE_LIMITED` |
| `LLM_TIMEOUT`, `TIMEOUT` | `504` with the same code |
| `401` (wrong or revoked chat key) | `500 NOT_CONFIGURED`, and log it |
| `CUSTOMER_CONFLICT`, exhausted `CUSTOMER_EXISTS` | `409` with the same code and a fixed visitor-safe message |
| Anything else | `502 UPSTREAM_ERROR` |

Keep `request_id` from the API's error (or its `X-Request-ID` header). It's what Truplexy support asks for.

## Protect the route

The route is public, like any contact form, and every message costs AI usage. Add the rate limiting you'd use on a form, such as 20 messages per IP per minute. Require sign-in if the chat is for customers only. Reply timeouts can reach 45 seconds, so allow your function at least 60.

## Full API and migration

See [CHAT_API.md](CHAT_API.md) for contact normalization and limits, the typed server client, channels, ticket controls, agent replies, live updates and account changes. The five browser actions and signed-session format stay compatible. Customer linking now stops new identified chats on failure. Existing conversations retain their original customer; identification does not grant access to earlier conversations. Realtime returns `{}` only for `REALTIME_NOT_CONFIGURED`, not channel or authentication errors.

# Customer chat API

The contract is [API_REFERENCE.md](../API_REFERENCE.md#chat-api-for-integrations). Call `https://api.truplexy.com/v3` from your server with a chat key. Do not send staff scope headers. Customer administration (`/customers`), billing, knowledge, and platform APIs are outside this SDK.

## Server client

```ts
import { createChatClient, TruplexyApiError } from '@truplexy/server';

const chat = createChatClient(); // TRUPLEXY_CHAT_KEY, optional TRUPLEXY_API_BASE
const customer = await chat.upsertCustomer({
  name: 'Ann',
  contacts: [
    { type: 'app', value: 'user-42' },
    { type: 'email', value: 'ann@example.com', primary: true, label: 'work' },
  ],
  metadata: { plan: 'pro' },
  // Optional: the bot's custom properties, and the person's picture on your platform.
  properties: { loyalty_tier: 'gold' },
  avatar_url: 'https://cdn.example.com/avatars/42.png',
});
const conversation = await chat.createConversation({ customer_id: customer.id });
const result = await chat.sendMessage(conversation.id, 'Where is my order?');
if (result.reply !== null) deliverToCustomer(result.reply);
// Implement deliverToCustomer for your platform. Inspect result.status as below.
```

Options: `chatKey`, `apiBase` (default production `/v3`), and `fetch`. Environment defaults are read for each call. The client returns API objects using their original snake_case fields. It exports `ChatClient`, `ChatClientOptions`, `CustomerInput`, `ContactInput`, `Contact`, `Customer`, `Profile`, `ConversationInput`, `Conversation`, `Message`, `MessageResult`, `ReplyStatus`, `Source`, `TicketInput`, `Ticket`, `ReplyInput`, `ReplyResult`, and `RealtimeToken`.

| Client method | API request | Result / behavior |
| --- | --- | --- |
| `getProfile()` | `GET /profile` | Business and bot names and optional pictures; may be cached privately for 60 seconds |
| `upsertCustomer(input)` | `PUT /customer` | Customer; 201 new or 200 existing |
| `createConversation({customer_id?, channel_id?, context?, ticket?}?)` | `POST /conversations` | Conversation; 201. `context` (up to 4000 characters) is stored as a `[Context only]` message for the assistant; `ticket` (`{subject?, priority?, keep_open?}`) opens its ticket, returned as `ticket`. Both best effort, in the same call |
| `getConversation(id)` | `GET /conversations/{id}` | Latest 200 messages, oldest first, and the current `ticket` (the open one, else the latest, which is then `closed` with `closed_at`) |
| `sendMessage(id, text \| {text?, images?, attachments?, idempotencyKey?, ifTicketClosed?, signal?})` | `POST /conversations/{id}/messages` | `{message, reply, status, sources}`; text 1–4000 characters (may be empty with pictures: [coming soon](#sending-pictures-coming-soon)). Sources are cited documents or, when the bot searches the web, web pages (`kind: "web"`, a `url` and no `document_id`) |
| `handoff(id)` | `POST /conversations/{id}/handoff` | Flags the conversation and adds confirmation; AI keeps replying |
| `escalate(id)` | `POST /conversations/{id}/escalate` | Opens/escalates a ticket; AI stops replying; safe to repeat |
| `resume(id)` | `POST /conversations/{id}/resume` | Ends escalation; ticket stays open; safe to repeat |
| `createTicket(id, {subject?, priority?, keep_open?}?)` | `POST /conversations/{id}/ticket` | Opens or returns the open ticket, without escalation; `keep_open: true` stops a new ticket closing on its own |
| `closeTicket(id)` | `POST /conversations/{id}/ticket/close` | Closes the open ticket, ends escalation, clears handoff; returns the latest ticket if already closed. A later `sendMessage` is still answered, unless it passes `ifTicketClosed: 'reject'`: then it fails with `409 TICKET_CLOSED` and nothing is stored (what the browser widget's route does) |
| `sendReply(id, input)` | `POST /conversations/{id}/replies` | `{message, ticket_id, escalated}`; opens a ticket if necessary |
| `getRealtimeToken(conversationId?)` | `POST /realtime/token` | Server topics, URL, publishable key, events |
| `getAttachmentConfig()` | `GET /profile` | *Coming soon.* `profile.attachments`, or `{enabled: false}` while the API doesn't serve pictures |
| `uploadImage(id, image, options?)` | `POST /conversations/{id}/attachments`, then `PUT` to storage | *Coming soon.* Hashes, registers and uploads one picture; resolves to the attachment ID |
| `registerImage(id, image \| details, options?)` | `POST /conversations/{id}/attachments` | *Coming soon.* `{attachmentId, url, headers, …}` for a browser to `PUT`; uploads nothing |
| `createAttachment(id, {filename, content_type, size, sha256})` | `POST /conversations/{id}/attachments` | *Coming soon.* The raw registration: `{attachment, url, method, headers, expires_at}` |

`sendReply` takes `content` (1–8000 characters), optional `author` (up to 64), `external_id` (up to 128), and `escalate` (default false). Reusing a platform message ID as `external_id` makes retries safe: a new reply returns 201, a repeated one 200. Ticket priorities are `low`, `normal`, `high`, `urgent`; statuses are `open` or `closed`.

## Sending pictures (coming soon)

> **Not live yet.** The API doesn't serve image input: `attachments` is refused with `400 INVALID_REQUEST` and the new route answers `404 NOT_FOUND`. These methods are ready for the day it does. Until then `getAttachmentConfig()` resolves to `{ enabled: false }`, and nothing else in the client changes. The contract is in [API_REFERENCE.md](../API_REFERENCE.md#image-input-planned-2026-10-19).

A customer can attach 1–3 pictures to a message and the assistant reads them. A picture takes three steps: register it, `PUT` the file to the presigned storage URL with exactly the returned headers, then send the message with the attachment ID. The client does all three:

```ts
const chat = createChatClient();
if ((await chat.getAttachmentConfig()).enabled) {
  const result = await chat.sendMessage(conversation.id, {
    text: 'This error appears when I log in',
    images: [screenshotBytes],            // a File, Blob, ArrayBuffer or Uint8Array; use { data, filename } to name bytes
    idempotencyKey: 'order-42-message-1', // optional: a retry of this message is safe
    signal,                               // optional AbortSignal
  });
}
```

- **What it does.** For each image: SHA-256, then `POST …/attachments` with `{filename, content_type, size, sha256}`, then `PUT` to the returned `url` with exactly the returned `headers` (never the chat key; that request goes to storage), then one `POST …/messages` with `attachments: [ids]`. Images upload in parallel, and nothing is sent if one fails. The type is the file's own, else the first bytes'; the API reads the real bytes and has the last word.
- **Retries.** A failed `PUT` (a network error or a 5xx) is retried twice, after 500 ms and then 1500 ms (`backoffMs`). Any other answer, like `403` for an expired signature, is final and raises `UPLOAD_FAILED`. The message itself is never replayed automatically; send it again with the same `idempotencyKey`. An attachment is single-use, so a retry that has to start over uploads the picture again.
- **Progress and cancelling.** `signal` cancels at any point, including while waiting to retry, and rejects with `AbortError`. `onProgress` reports `hashing`, `registering`, `uploading` and `done` with byte counts; `fetch` can't report bytes in flight, so `uploading` is reported at its start and end. Use `putImage` from `@truplexy/web` in a browser for byte-level progress.
- **Pictures already uploaded.** `uploadImage(id, image)` resolves to the ID; pass it as `attachments: [id]` within an hour, once.
- **A browser widget** never holds the chat key. Your server calls `registerImage(id, details)` with the `{filename, content_type, size, sha256}` the browser computed (`describeImage` in `@truplexy/web`), and returns `{attachmentId, url, headers}`. The browser `PUT`s the file straight to storage (`putImage`), and your server sends the message with `attachments: [attachmentId]`. The website's origin needs the storage bucket's CORS rule to allow `PUT` with `Content-Type`. [Example](examples/widget-pictures).
- **Messages carry pictures.** A customer message may have `attachments: [{id, content_type, width, height, size, url, url_expires_at}]`. The values describe the stored copy: shrunk to at most 1280 px, a JPEG of at most 1 MiB, metadata removed. `url` is signed for one hour and works in an `<img>`; fetch the conversation again for a fresh one, and never store or log it.
- **Limits** come from `getAttachmentConfig()` (`max_bytes`, `max_per_message`, `content_types`); don't copy them. Today: 20 MB per upload, JPEG, PNG and WebP only.
- **Errors** are `TruplexyApiError`s; match on `code`. `error.limit` is `image_input` when the plan has no picture input.

| `code` | HTTP | Meaning |
| --- | --- | --- |
| `UNSUPPORTED_IMAGE_TYPE` | 400 | Not a JPEG, PNG or WebP picture. Ask for another file. |
| `INVALID_IMAGE` | 400 | Unreadable, under 8 px or over 16,384 px on a side, or too big to open safely. `message` says why. |
| `IMAGE_TOO_LARGE` | 413 | Over 20 MB, or can't be shrunk under 1 MiB without ruining it. |
| `ATTACHMENT_NOT_UPLOADED` | 409 | The message named a picture whose `PUT` hadn't finished. Wait, then send again. |
| `ATTACHMENT_NOT_FOUND` | 404 | Expired (an hour), already sent, or from another conversation. Register and upload it again. |
| `PLAN_LIMIT_REACHED` | 403 | With `limit: "image_input"`: the plan has no picture input. |
| `FEATURE_UNAVAILABLE` | 400 | No assistant model can read pictures right now. |
| `UPLOAD_FAILED` | storage's | The `PUT` failed after its retries. Not an API answer. |

A picture error happens before anything is stored or paid for, so there is nothing to clean up. Don't retry `INVALID_IMAGE`, `UNSUPPORTED_IMAGE_TYPE` or `IMAGE_TOO_LARGE`. The assistant sees a picture only in the reply to the message that carried it. A message that only says `[sent an attachment in Discord]`, with no `attachments`, still gets a request to describe it; sending the real picture replaces that.

`ATTACHMENT_ERROR_CODES` lists the five picture codes. Try it with no key against the mock: `IMAGES=1 node playground/mock-api.mjs`, then `node examples/send-picture.mjs examples/sample.png "Is this OK?"`.

## Customer identity

- Supply 1–20 contacts. Each is `{type, value, label?, primary?}`. `type` is 2–32 lowercase letters, digits, hyphens or underscores, starting with a letter. Values are 1–254 characters; labels up to 60.
- Email contacts are lowercased. Phone contacts lose spaces, dashes, dots and parentheses and must be 5–20 digits with an optional leading `+`. Other values preserve case. Use strings for platform IDs.
- Names allow 120 characters; the API collapses whitespace. Metadata is a JSON object up to 4 KB. Omitted name/metadata keep their existing value; supplied metadata replaces the object.
- `properties` sets the bot's custom properties (defined in the dashboard under Settings → Properties) by key. They are merged: keys you send replace their value, `null` clears one, others stay. An unknown key or a value of the wrong type is `INVALID_REQUEST`. Required properties aren't enforced here. Sensitive properties are never returned to a chat key; their keys appear in `masked_properties`.
- `avatar_url` is an https link to the person's picture on your platform (PNG, JPEG or WebP, up to 512 KB). Truplexy copies it once per link, so an expiring CDN link is fine. A picture someone on the team uploaded is never replaced, and a link that can't be fetched leaves the picture as it was without failing the request. The response's `avatar_url` is Truplexy's copy.
- The API finds a customer matching any supplied contact and adds missing contacts. Existing primary flags remain unchanged. At most one contact per type is primary; the first is primary when none is marked.
- Contacts are unique within a bot. `CUSTOMER_CONFLICT` means the supplied contacts identify different customers; nothing changes. Resolve that conflict in the dashboard. `CUSTOMER_EXISTS` means another request claimed the contact; the client and language helpers retry once, then throw.
- Store the returned `cus_…` ID on **new** conversations. Their tickets inherit the customer. Existing conversations cannot be relinked through this API. Identifying a customer does not authenticate them or authorize access to their other conversations.
- Use sender/user IDs as contacts, and chat/thread/ticket IDs for routing. The guides namespace account-scoped Shopify, HubSpot and Zendesk identities with their account. Telegram group routing includes both chat and sender. Slack and Teams staff replies attach to an existing customer conversation.

An identified conversation must not silently become anonymous if customer saving fails. Calling `createConversation()` without a customer remains supported. A channel-bound key supplies the channel automatically; `channel_id` overrides it. An inactive bound channel disables every chat endpoint with `CHANNEL_DISABLED`. A chat key reaches chat API conversations for its bot, including those created using another key for that bot.

## Errors and replies

`TruplexyApiError` exposes `status`, `code`, `requestId`, `details` (additional API error fields such as `limit`), and `retryAfter`. Its message is server data: log or handle it on the server, never forward it directly to visitors. Network/invalid JSON failures become `UPSTREAM_ERROR`. The only automatic retry is the single customer contact-race retry; messages and other mutations are not replayed automatically.

Handle `CUSTOMER_NOT_FOUND` and `CHANNEL_NOT_FOUND` by correcting the new-conversation input. `TICKET_NOT_FOUND` on closure means the conversation never had a ticket. `PLAN_LIMIT_REACHED`, `CHANNEL_DISABLED`, and model errors need explicit handling, with the request ID retained for support.

For `answered`, `clarification_required`, and `no_answer`, show `reply`. For `handoff_offered`, also offer the handoff action. `handoff` means the team was notified but the AI can continue. `escalated` and `context` have `reply: null`; render no reply. Sources contain `{document_id, title, section?, url?, score}` and are populated only for `answered`.

## Live replies

Never give a browser `bot_topic`: it includes other customers and internal notes. Give it only its authorized conversation's `url`, `publishable_key`, and `conversation_topic`. Treat broadcasts as prompts to refetch history. Fall back to polling for `REALTIME_NOT_CONFIGURED`, not for authorization or channel failures.

Webhooks deliver staff `message.created` and `ticket.updated` events for chat API conversations. They exclude notes, playground chats, and integration-originated actions; `/resume` and `/replies` are not echoed. Verify the raw body with `X-Truplexy-Signature` HMAC-SHA256 and a five-minute timestamp window. Acknowledge within 2.5 seconds, queue work durably, and deduplicate `X-Truplexy-Delivery`: a failed delivery can be retried once using the same ID. Route a staff reply to its platform explicitly when using `/replies`.

## Website identity and migration

The widget asks for a self-reported name/email by default. `details="off"` skips the form; it does not disable automatic ticket creation. `setCustomer(name, email)` only updates browser details; the server links them when starting a new conversation. The browser's `Customer` type is this form data, separate from the server client's full API `Customer`.

For signed-in users, set the handler's `customer(request)` resolver to return trusted contacts and metadata. A non-null result replaces browser details completely; null/undefined falls back to the form. Use `details="off"` when identity comes from your server. Python/PHP routes expose `resolve_customer`; Go exposes `resolveCustomer`; WordPress exposes `truplexy_chat_customer`. These resolvers run only when a new conversation starts.

Existing handler signatures and the signed-session format stay compatible. The behavior change is intentional: customer linking failures now stop a new identified chat instead of creating an unlinked one. Background context and automatic ticket creation are still best effort.

`reset()` forgets the conversation but retains the visitor's details. For account changes, dispose of the old client and use a separate `storageKey` per authenticated identity, or clear its store and recreate it. Never reuse an old signed conversation session for a different signed-in user. Your server must enforce authorization; changing a browser storage key is not access control.

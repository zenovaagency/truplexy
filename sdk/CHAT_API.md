# Customer chat API

The contract is [API_REFERENCE.md](../API_REFERENCE.md#chat-api-for-integrations). Call `https://api.truplexy.com/v2` from your server with a chat key. Do not send staff scope headers. Customer administration (`/customers`), billing, knowledge, and platform APIs are outside this SDK.

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
});
const conversation = await chat.createConversation({ customer_id: customer.id });
const result = await chat.sendMessage(conversation.id, 'Where is my order?');
if (result.reply !== null) deliverToCustomer(result.reply);
// Implement deliverToCustomer for your platform. Inspect result.status as below.
```

Options: `chatKey`, `apiBase` (default production `/v2`), and `fetch`. Environment defaults are read for each call. The client returns API objects using their original snake_case fields. It exports `ChatClient`, `ChatClientOptions`, `CustomerInput`, `ContactInput`, `Contact`, `Customer`, `Profile`, `ConversationInput`, `Conversation`, `Message`, `MessageResult`, `ReplyStatus`, `Source`, `TicketInput`, `Ticket`, `ReplyInput`, `ReplyResult`, and `RealtimeToken`.

| Client method | API request | Result / behavior |
| --- | --- | --- |
| `getProfile()` | `GET /profile` | Business and bot names and optional pictures; may be cached privately for 60 seconds |
| `upsertCustomer(input)` | `PUT /customer` | Customer; 201 new or 200 existing |
| `createConversation({customer_id?, channel_id?}?)` | `POST /conversations` | Empty conversation; 201 |
| `getConversation(id)` | `GET /conversations/{id}` | Latest 200 messages, oldest first |
| `sendMessage(id, text)` | `POST /conversations/{id}/messages` | `{message, reply, status, sources}`; text 1–4000 characters |
| `handoff(id)` | `POST /conversations/{id}/handoff` | Flags the conversation and adds confirmation; AI keeps replying |
| `escalate(id)` | `POST /conversations/{id}/escalate` | Opens/escalates a ticket; AI stops replying; safe to repeat |
| `resume(id)` | `POST /conversations/{id}/resume` | Ends escalation; ticket stays open; safe to repeat |
| `createTicket(id, {subject?, priority?, keep_open?}?)` | `POST /conversations/{id}/ticket` | Opens or returns the open ticket, without escalation; `keep_open: true` stops a new ticket closing on its own |
| `closeTicket(id)` | `POST /conversations/{id}/ticket/close` | Closes the open ticket, ends escalation, clears handoff; returns the latest ticket if already closed |
| `sendReply(id, input)` | `POST /conversations/{id}/replies` | `{message, ticket_id, escalated}`; opens a ticket if necessary |
| `getRealtimeToken(conversationId?)` | `POST /realtime/token` | Server topics, URL, publishable key, events |

`sendReply` takes `content` (1–8000 characters), optional `author` (up to 64), `external_id` (up to 128), and `escalate` (default false). Reusing a platform message ID as `external_id` makes retries safe: a new reply returns 201, a repeated one 200. Ticket priorities are `low`, `normal`, `high`, `urgent`; statuses are `open` or `closed`.

## Customer identity

- Supply 1–20 contacts. Each is `{type, value, label?, primary?}`. `type` is 2–32 lowercase letters, digits, hyphens or underscores, starting with a letter. Values are 1–254 characters; labels up to 60.
- Email contacts are lowercased. Phone contacts lose spaces, dashes, dots and parentheses and must be 5–20 digits with an optional leading `+`. Other values preserve case. Use strings for platform IDs.
- Names allow 120 characters; the API collapses whitespace. Metadata is a JSON object up to 4 KB. Omitted name/metadata keep their existing value; supplied metadata replaces the object.
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

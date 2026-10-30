# @truplexy/web

The Truplexy chat widget as one custom element, `<truplexy-chat>`, for any website or framework. It has no dependencies, renders in a Shadow DOM and weighs about 19 KB gzipped. The package also includes `TruplexyClient`, the same chat without any UI.

The widget talks to a route on **your** server, which holds the chat key. Add that route first with [`@truplexy/server`](https://www.npmjs.com/package/@truplexy/server) (or see the [protocol](https://truplexy.com/docs/web-sdk#protocol)).

## Install

**Script tag (any site):**

```html
<script src="https://cdn.jsdelivr.net/npm/@truplexy/web@0/dist/truplexy.min.js"
        data-endpoint="/api/truplexy" defer></script>
```

Every `data-*` attribute becomes an element attribute. Add `data-manual` to mount it yourself with `Truplexy.init({...})`.

**npm:**

```bash
npm i @truplexy/web
```

```js
import "@truplexy/web"; // registers <truplexy-chat>; safe to import during server rendering
```

```html
<truplexy-chat endpoint="/api/truplexy"></truplexy-chat>
```

Or from code: `import { mount } from "@truplexy/web"; mount({ endpoint: "/api/truplexy" })`.

React and Vue have wrappers: [`@truplexy/react`](https://www.npmjs.com/package/@truplexy/react) and [`@truplexy/vue`](https://www.npmjs.com/package/@truplexy/vue).

## Attributes

| Attribute | What it does | Default |
| --- | --- | --- |
| `endpoint` | Your server route | `/api/truplexy` |
| `heading`, `subtitle` | Header text | your business name (read from Truplexy), "Ask us anything…" |
| `greeting` | First message (Markdown); empty hides it | "Hi there! How can we help you today?" |
| `placeholder` | Message box hint | "Write a message…" |
| `accent` | Any CSS colour | `#0a0a0a` |
| `avatar` | Header image URL | your business logo (read from Truplexy), else Bubbly, the Truplexy assistant |
| `theme` | `light`, `dark`, `auto` | `light` |
| `position` | `right`, `left` | `right` |
| `mode` | `floating`, or `inline` for a chat box in the page | `floating` |
| `open` | Start open | closed |
| `show-sources` | Link the articles and web pages answers came from | off |
| `demo` | Canned replies, no server | off |
| `details` | `ask`: a name and email form before the first message; `off`: skip the form. Both modes attempt to open a ticket | `ask` |
| `storage-key` | localStorage key for the conversation | `truplexy:<endpoint>` |
| `closed-retention-days` | Days a conversation whose ticket was closed stays in the browser, read-only, before it is forgotten | `3` |

The `labels` property replaces any string, for translations (see `DEFAULT_LABELS`). The panel ends with a small "Powered by Truplexy" link to truplexy.com; translate it with the `poweredBy` label.

**Styling.** CSS variables on the element:

- `--truplexy-accent`, `--truplexy-accent-ink`, `--truplexy-background`, `--truplexy-surface`, `--truplexy-ink`, `--truplexy-muted`, `--truplexy-line`
- `--truplexy-radius`, `--truplexy-font`, `--truplexy-width`, `--truplexy-height`
- `--truplexy-offset-x`, `--truplexy-offset-y`, `--truplexy-z-index`

Parts: `launcher`, `panel`, `header`, `log`, `message`, `composer`, `handoff`.

## Methods and events

`open()`, `close()`, `toggle()`, `send(text)`, `reset()` are available on the element. Anywhere in your app, `truplexy.open()` acts on the first widget on the page. With the script tag, use `window.Truplexy`.

These events bubble to `document`:

| Event | `detail` |
| --- | --- |
| `truplexy:open`, `truplexy:close` | `null` |
| `truplexy:message` | `{ messages }`: new assistant or team replies |
| `truplexy:status` | `{ status }`: `answered`, `handoff_offered`, `escalated`… |
| `truplexy:error` | `{ error: { code, message, requestId } }` |

## Headless

```js
import { TruplexyClient } from "@truplexy/web";

const chat = new TruplexyClient({ endpoint: "/api/truplexy" });
chat.subscribe((state) => render(state)); // customer, needsDetails, profile, ticket, closed, messages, sending, offerHandoff, handoff, escalated, unread, error
await chat.start();
if (chat.setCustomer("Ann", "ann@example.com")) {
  await chat.send("Where is my order?");
}
await chat.handoff();      // "Talk to a person"
// When state.closed is true the team closed the ticket: show the messages read-only,
// send() does nothing, and chat.reset() starts a new conversation. The closed chat stays
// in the browser for closedRetentionDays (default 3).
chat.setOpen(true);        // your UI is visible: clears unread, polls faster
```

## Customer details and sessions

`details` defaults to `ask`. With no session or customer, `send()` sets `needsDetails` and waits; call `setCustomer(name, email)` then send the pending text again. Names allow 120 characters. `cancelDetails()` dismisses that request. `customer` is self-reported browser form data, `profile` contains the business/bot names and pictures, and `ticket` is the automatically opened ticket reference.

For trusted identities, configure the server's `customer(request)` resolver and use `details: 'off'`. The browser never supplies trusted metadata or a customer ID. The server requires successful customer linking before it creates an identified conversation.

`reset()` retains customer details. On account changes, destroy the old client and use separate storage per user or clear the store and recreate it; the server must still enforce authorization. See [customer identity, errors and migration](https://github.com/zenovaagency/truplexy/blob/main/sdk/CHAT_API.md).

## Pictures from a browser (coming soon)

The API doesn't serve image input yet. When it does, a browser never holds the chat key, so your server registers each picture (`chat.registerImage()` in `@truplexy/server`) and the browser puts the file straight into storage:

```ts
import { uploadImage } from "@truplexy/web";

const id = await uploadImage(file, (details) =>
  fetch("/api/pictures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details) }).then((r) => r.json()),
);
// then your server sends the message with attachments: [id]
```

`describeImage(file)` hashes a picture and returns `{filename, content_type, size, sha256}`; `putImage(file, { url, headers }, { signal, onProgress })` does the `PUT` with exactly those headers, no cookies and no `Authorization` header, retrying a network error or 5xx twice (`onProgress` is byte-level). Failures are `TruplexyUploadError`s with `code: "UPLOAD_FAILED"`. The storage bucket's CORS rule must allow `PUT` and `Content-Type` from your site's origin. The `<truplexy-chat>` widget itself has no attach button yet. See the [guide](https://github.com/zenovaagency/truplexy/blob/main/sdk/CHAT_API.md#sending-pictures-coming-soon) and [example](https://github.com/zenovaagency/truplexy/tree/main/sdk/examples/widget-pictures).

## Types for JSX frameworks

`TruplexyChatAttributes` describes the attributes. In Solid, for example:

```ts
import type { TruplexyChatAttributes } from "@truplexy/web";
declare module "solid-js" {
  namespace JSX { interface IntrinsicElements { "truplexy-chat": TruplexyChatAttributes & JSX.HTMLAttributes<HTMLElement> } }
}
```

MIT licensed.

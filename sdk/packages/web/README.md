# @truplexy/web

The Truplexy chat widget as one custom element, `<truplexy-chat>`, for any website or framework. It has no dependencies, renders in a Shadow DOM and weighs about 12 KB gzipped. The package also includes `TruplexyClient`, the same chat without any UI.

The widget talks to a route on **your** server, which holds the chat key. Add that route first with [`@truplexy/server`](https://www.npmjs.com/package/@truplexy/server) (or see the [protocol](https://zenovasolution.xyz/docs/web-sdk#protocol)).

## Install

**Script tag (any site):**

```html
<script src="https://cdn.jsdelivr.net/npm/@truplexy/web@0/dist/truplexy.min.js"
        data-endpoint="/api/truplexy" data-heading="Support" defer></script>
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
<truplexy-chat endpoint="/api/truplexy" heading="Support"></truplexy-chat>
```

Or from code: `import { mount } from "@truplexy/web"; mount({ endpoint: "/api/truplexy" })`.

React and Vue have wrappers: [`@truplexy/react`](https://www.npmjs.com/package/@truplexy/react) and [`@truplexy/vue`](https://www.npmjs.com/package/@truplexy/vue).

## Attributes

| Attribute | What it does | Default |
| --- | --- | --- |
| `endpoint` | Your server route | `/api/truplexy` |
| `heading`, `subtitle` | Header text | "Support", "Ask us anything…" |
| `greeting` | First message (Markdown); empty hides it | "Hi there! How can we help you today?" |
| `placeholder` | Message box hint | "Write a message…" |
| `accent` | Any CSS colour | `#2338e6` |
| `avatar` | Header image URL | a bot icon |
| `theme` | `light`, `dark`, `auto` | `light` |
| `position` | `right`, `left` | `right` |
| `mode` | `floating`, or `inline` for a chat box in the page | `floating` |
| `open` | Start open | closed |
| `show-sources` | Link the articles answers came from | off |
| `demo` | Canned replies, no server | off |
| `storage-key` | localStorage key for the conversation | `truplexy:<endpoint>` |

The `labels` property replaces any string, for translations (see `DEFAULT_LABELS`).

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
chat.subscribe((state) => render(state)); // messages, sending, offerHandoff, handoff, escalated, unread, error
await chat.start();
await chat.send("Where is my order?");
await chat.handoff();      // "Talk to a person"
chat.setOpen(true);        // your UI is visible: clears unread, polls faster
```

## Types for JSX frameworks

`TruplexyChatAttributes` describes the attributes. In Solid, for example:

```ts
import type { TruplexyChatAttributes } from "@truplexy/web";
declare module "solid-js" {
  namespace JSX { interface IntrinsicElements { "truplexy-chat": TruplexyChatAttributes & JSX.HTMLAttributes<HTMLElement> } }
}
```

MIT licensed.

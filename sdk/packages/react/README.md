# @truplexy/react

The Truplexy chat widget for React 18/19, Next.js (App and Pages Router), Remix / React Router and Gatsby. It wraps [`@truplexy/web`](https://www.npmjs.com/package/@truplexy/web).

```bash
npm i @truplexy/react
```

You also need the server route the widget talks to. See [`@truplexy/server`](https://www.npmjs.com/package/@truplexy/server).

## The widget

```tsx
import { TruplexyChat } from "@truplexy/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <TruplexyChat endpoint="/api/truplexy" onStatus={(s) => console.log(s)} />
      </body>
    </html>
  );
}
```

It is marked `'use client'` and renders as an empty `<truplexy-chat>` on the server, so it can go straight into a Next.js server layout.

| Prop | |
| --- | --- |
| `endpoint`, `heading`, `subtitle`, `greeting`, `placeholder`, `accent`, `avatar`, `theme`, `position`, `mode`, `showSources`, `demo`, `details`, `storageKey` | Same as the element's attributes |
| `open` | Controls the panel when set |
| `labels` | Replaces any UI string |
| `onOpen`, `onClose`, `onMessage(messages)`, `onStatus(status)`, `onError(error)` | Events |
| `className`, `style` | On the element |

`ref` gives `open()`, `close()`, `toggle()`, `send(text)`, `reset()` and `element`. From anywhere: `import { truplexy } from "@truplexy/react"; truplexy.open()`.

## Your own UI

```tsx
import { useTruplexyChat } from "@truplexy/react";

const chat = useTruplexyChat({ endpoint: "/api/truplexy" });
// chat.customer, chat.needsDetails, chat.profile, chat.ticket, chat.messages, chat.sending, chat.offerHandoff, chat.escalated, chat.unread, chat.error
// chat.setCustomer(name, email), chat.cancelDetails(), chat.send(text), chat.handoff(), chat.retry(id), chat.reset(), chat.setOpen(open)
```

With the default `details: 'ask'`, collect a name/email and call `chat.setCustomer(name, email)` before sending. If `chat.needsDetails` is true, keep the draft, collect details, then call `chat.send(draft)` again. Use `details: 'off'` when identity comes from the server's `customer(request)` resolver. Render `chat.ticket` and `chat.profile` when available.

Names allow 120 characters. Linking errors stop a new identified conversation. `reset()` keeps the visitor details; recreate the client with isolated storage on account changes. See the [customer chat guide](https://github.com/zenovaagency/truplexy/blob/main/sdk/CHAT_API.md).

The client is created in an effect, so it never runs during server rendering and survives StrictMode.

MIT licensed.

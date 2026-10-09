# @truplexy/vue

The Truplexy chat widget for Vue 3 and Nuxt. It wraps [`@truplexy/web`](https://www.npmjs.com/package/@truplexy/web).

```bash
npm i @truplexy/vue
```

You also need the server route the widget talks to. See [`@truplexy/server`](https://www.npmjs.com/package/@truplexy/server).

## Vue

```vue
<script setup lang="ts">
import { TruplexyChat } from "@truplexy/vue";
</script>

<template>
  <RouterView />
  <TruplexyChat endpoint="/api/truplexy" heading="Support" @status="(s) => console.log(s)" />
</template>
```

Or register it everywhere with `app.use(TruplexyPlugin)`.

## Nuxt

```vue
<!-- app.vue -->
<script setup lang="ts">
import { TruplexyChat } from "@truplexy/vue";
</script>

<template>
  <NuxtPage />
  <ClientOnly>
    <TruplexyChat endpoint="/api/truplexy" heading="Support" />
  </ClientOnly>
</template>
```

The route goes in `server/api/truplexy.post.ts`:

```ts
import { createHandler } from "@truplexy/server";
const truplexy = createHandler({ chatKey: process.env.TRUPLEXY_CHAT_KEY });
export default defineEventHandler((event) => truplexy(toWebRequest(event)));
```

## Props and events

- **Props** are the same as the element's attributes: `endpoint`, `heading`, `subtitle`, `greeting`, `placeholder`, `accent`, `avatar`, `theme`, `position`, `mode`, `show-sources`, `demo`, `storage-key`. There are also `open`, which controls the panel when set, and `labels`.
- **Events:** `@open`, `@close`, `@message`, `@status`, `@error`.
- **Template ref:** exposes `open()`, `close()`, `toggle()`, `send(text)`, `reset()`.

## Your own UI

```ts
import { useTruplexyChat } from "@truplexy/vue";

const { state, send, handoff, retry, reset, setOpen } = useTruplexyChat({ endpoint: "/api/truplexy" });
// state.value.messages, sending, offerHandoff, escalated, unread, error
```

MIT licensed.

/**
 * Install recipes for the Truplexy website SDK, per framework: the server
 * route (step 2) and the widget (step 3). The dashboard's Website chat guide
 * loads this file when opened, and the marketing site's /docs/web-sdk page
 * imports it, so keep it free of imports.
 */

export interface RecipeFile {
  name: string;
  code: string;
}

export interface Recipe {
  id: string;
  label: string;
  /** The install command. */
  install?: string;
  files: RecipeFile[];
  /** A line shown under the code. */
  note?: string;
}

export const CDN_URL = 'https://cdn.jsdelivr.net/npm/@truplexy/web@0/dist/truplexy.min.js';

/** Step 2: the route the widget talks to. It holds the chat key. */
export const SERVER_RECIPES: Recipe[] = [
  {
    id: 'nextjs',
    label: 'Next.js',
    install: 'npm i @truplexy/server',
    files: [
      {
        name: 'app/api/truplexy/route.ts',
        code: `import { createHandler } from "@truplexy/server";

// Reads TRUPLEXY_CHAT_KEY from the environment (.env.local, or your host's settings).
export const POST = createHandler();
export const maxDuration = 60; // replies can take up to 45 seconds`,
      },
    ],
    note: 'Pages Router: in pages/api/truplexy.ts, export default createNodeHandler() from "@truplexy/server/node".',
  },
  {
    id: 'nuxt',
    label: 'Nuxt',
    install: 'npm i @truplexy/server',
    files: [
      {
        name: 'server/api/truplexy.post.ts',
        code: `import { createHandler } from "@truplexy/server";

const truplexy = createHandler({ chatKey: process.env.TRUPLEXY_CHAT_KEY });

export default defineEventHandler((event) => truplexy(toWebRequest(event)));`,
      },
    ],
  },
  {
    id: 'sveltekit',
    label: 'SvelteKit',
    install: 'npm i @truplexy/server',
    files: [
      {
        name: 'src/routes/api/truplexy/+server.ts',
        code: `import { createHandler } from "@truplexy/server";
import { TRUPLEXY_CHAT_KEY } from "$env/static/private";
import type { RequestHandler } from "./$types";

const truplexy = createHandler({ chatKey: TRUPLEXY_CHAT_KEY });

export const POST: RequestHandler = ({ request }) => truplexy(request);`,
      },
    ],
  },
  {
    id: 'remix',
    label: 'Remix / React Router',
    install: 'npm i @truplexy/server',
    files: [
      {
        name: 'app/routes/api.truplexy.ts',
        code: `import { createHandler } from "@truplexy/server";

const truplexy = createHandler();

export const action = ({ request }: { request: Request }) => truplexy(request);`,
      },
    ],
  },
  {
    id: 'astro',
    label: 'Astro',
    install: 'npm i @truplexy/server',
    files: [
      {
        name: 'src/pages/api/truplexy.ts',
        code: `import type { APIRoute } from "astro";
import { createHandler } from "@truplexy/server";

export const prerender = false; // needs a server adapter (Vercel, Netlify, Node…)

const truplexy = createHandler({ chatKey: import.meta.env.TRUPLEXY_CHAT_KEY });

export const POST: APIRoute = ({ request }) => truplexy(request);`,
      },
    ],
  },
  {
    id: 'express',
    label: 'Express',
    install: 'npm i @truplexy/server',
    files: [
      {
        name: 'server.js',
        code: `import express from "express";
import { createNodeHandler } from "@truplexy/server/node";

const app = express();

// Reads TRUPLEXY_CHAT_KEY from the environment.
app.post("/api/truplexy", createNodeHandler());

app.listen(3000);`,
      },
    ],
    note: 'Fastify, Koa and Angular SSR work the same way: createNodeHandler() takes Node’s (req, res).',
  },
  {
    id: 'hono',
    label: 'Hono',
    install: 'npm i @truplexy/server',
    files: [
      {
        name: 'src/index.ts',
        code: `import { Hono } from "hono";
import { env } from "hono/adapter";
import { createHandler } from "@truplexy/server";

const app = new Hono();

app.post("/api/truplexy", (c) => createHandler({ chatKey: env<{ TRUPLEXY_CHAT_KEY: string }>(c).TRUPLEXY_CHAT_KEY })(c.req.raw));

export default app;`,
      },
    ],
  },
  {
    id: 'workers',
    label: 'Cloudflare Workers',
    install: 'npm i @truplexy/server && npx wrangler secret put TRUPLEXY_CHAT_KEY',
    files: [
      {
        name: 'src/index.ts',
        code: `import { createHandler } from "@truplexy/server";

export default {
  fetch(request: Request, env: { TRUPLEXY_CHAT_KEY: string }) {
    if (new URL(request.url).pathname !== "/api/truplexy") return new Response("Not found", { status: 404 });
    return createHandler({
      chatKey: env.TRUPLEXY_CHAT_KEY,
      // The site the widget is on, when it isn't served by this Worker.
      allowedOrigins: ["https://www.example.com"],
    })(request);
  },
};`,
      },
    ],
  },
  {
    id: 'vercel',
    label: 'Vercel function (any site)',
    install: 'npm i @truplexy/server',
    files: [
      {
        name: 'api/truplexy.js',
        code: `import { createHandler } from "@truplexy/server";

// For a site with no server of its own (static HTML, Webflow, Wix, Squarespace…):
// deploy this one file to Vercel and point the widget's endpoint at it.
export const POST = createHandler({ allowedOrigins: ["https://www.example.com"] });
export const OPTIONS = POST;
export const maxDuration = 60;`,
      },
    ],
    note: 'Netlify: put the same handler in netlify/functions/truplexy.mjs as export default, with export const config = { path: "/api/truplexy" }.',
  },
];

/** Step 3: the chat button on the site. */
export const WIDGET_RECIPES: Recipe[] = [
  {
    id: 'html',
    label: 'HTML / any site',
    files: [
      {
        name: 'index.html',
        code: `<!-- Before </body>. data-endpoint is your route from step 2. -->
<script
  src="${CDN_URL}"
  data-endpoint="/api/truplexy"
  defer
></script>`,
      },
    ],
    note: 'Webflow, Wix, Squarespace and Shopify themes: paste it into the custom code (footer) setting, with the full URL of your route as data-endpoint.',
  },
  {
    id: 'react',
    label: 'React',
    install: 'npm i @truplexy/react',
    files: [
      {
        name: 'App.tsx',
        code: `import { TruplexyChat } from "@truplexy/react";

export default function App() {
  return (
    <>
      {/* …your app… */}
      <TruplexyChat endpoint="/api/truplexy" />
    </>
  );
}`,
      },
    ],
    note: 'Gatsby and Vite work the same way. Open it from your own button with truplexy.open(), imported from "@truplexy/react".',
  },
  {
    id: 'nextjs',
    label: 'Next.js',
    install: 'npm i @truplexy/react',
    files: [
      {
        name: 'app/layout.tsx',
        code: `import { TruplexyChat } from "@truplexy/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <TruplexyChat endpoint="/api/truplexy" />
      </body>
    </html>
  );
}`,
      },
    ],
  },
  {
    id: 'remix',
    label: 'Remix / React Router',
    install: 'npm i @truplexy/react',
    files: [
      {
        name: 'app/root.tsx',
        code: `import { TruplexyChat } from "@truplexy/react";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>{/* Meta, Links… */}</head>
      <body>
        {children}
        <TruplexyChat endpoint="/api/truplexy" />
        {/* ScrollRestoration, Scripts… */}
      </body>
    </html>
  );
}`,
      },
    ],
  },
  {
    id: 'vue',
    label: 'Vue',
    install: 'npm i @truplexy/vue',
    files: [
      {
        name: 'App.vue',
        code: `<script setup lang="ts">
import { TruplexyChat } from "@truplexy/vue";
</script>

<template>
  <RouterView />
  <TruplexyChat endpoint="/api/truplexy" />
</template>`,
      },
    ],
  },
  {
    id: 'nuxt',
    label: 'Nuxt',
    install: 'npm i @truplexy/vue',
    files: [
      {
        name: 'app.vue',
        code: `<script setup lang="ts">
import { TruplexyChat } from "@truplexy/vue";
</script>

<template>
  <NuxtPage />
  <ClientOnly>
    <TruplexyChat endpoint="/api/truplexy" />
  </ClientOnly>
</template>`,
      },
    ],
  },
  {
    id: 'svelte',
    label: 'Svelte / SvelteKit',
    install: 'npm i @truplexy/web',
    files: [
      {
        name: 'src/routes/+layout.svelte',
        code: `<script>
  import { onMount } from "svelte";
  let { children } = $props();
  onMount(() => import("@truplexy/web"));
</script>

{@render children()}
<truplexy-chat endpoint="/api/truplexy"></truplexy-chat>`,
      },
    ],
  },
  {
    id: 'angular',
    label: 'Angular',
    install: 'npm i @truplexy/web',
    files: [
      {
        name: 'src/app/app.component.ts',
        code: `import { Component, CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import "@truplexy/web";

@Component({
  selector: "app-root",
  imports: [RouterOutlet],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: \`
    <router-outlet />
    <truplexy-chat endpoint="/api/truplexy"></truplexy-chat>
  \`,
})
export class AppComponent {}`,
      },
    ],
  },
  {
    id: 'astro',
    label: 'Astro',
    install: 'npm i @truplexy/web',
    files: [
      {
        name: 'src/layouts/Layout.astro',
        code: `<slot />
<truplexy-chat endpoint="/api/truplexy"></truplexy-chat>

<script>
  import "@truplexy/web";
</script>`,
      },
    ],
  },
  {
    id: 'solid',
    label: 'Solid',
    install: 'npm i @truplexy/web',
    files: [
      {
        name: 'src/App.tsx',
        code: `import "@truplexy/web";
import type { TruplexyChatAttributes } from "@truplexy/web";

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "truplexy-chat": TruplexyChatAttributes & JSX.HTMLAttributes<HTMLElement>;
    }
  }
}

export default function App() {
  return (
    <>
      {/* …your app… */}
      <truplexy-chat endpoint="/api/truplexy" />
    </>
  );
}`,
      },
    ],
  },
];

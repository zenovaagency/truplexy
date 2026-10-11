# Truplexy — marketing site

**One conversation. Everywhere.** The homepage positions Truplexy as a continuous AI
customer-support layer across channels, not a single website chatbot.

Astro 7 + React islands + Tailwind v4, with GSAP/Lenis for motion. Structure mirrors `zenova-v2`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:4321 |
| `npm run build` | Static build to `dist/` |
| `npm run check` | Type-check (`astro check`) |
| `npm run verify` | Honesty audit of `dist/index.html` (run after build) |
| `npm run brand` | Regenerate trimmed logos, favicons and the OG card from `/logo` |

## Deploying

`vercel.json` deploys this site and the dashboard (`dashboard/`) as one Vercel project with two
services: `dashboard` on `app.` hosts (`app.truplexy.com`), `site` on every other host.
`vercel dev` runs both locally (the dashboard at `http://app.localhost:3000`).

## Where things live

- `src/data/channels.ts` — **channel registry**. Every badge, diagram node and footer
  list reads `status` from here. Flip a channel to `'live'` and the whole page follows.
- `src/data/demo.ts` — every sample conversation, from one fictional cast. The build
  fails if a demo uses a channel that isn't live.
- `src/data/site.ts` — name, domain, email and CTA links.
- `src/components/home/*` — one file per homepage section, in page order in `src/pages/index.astro`.
- `src/islands/*` — the interactive parts: the hero card stack (sample conversation playback) and the unified inbox.

## Website SDK

`sdk/` holds the website chat SDK: the `<truplexy-chat>` widget (`@truplexy/web`), React and Vue wrappers, the server route (`@truplexy/server`) and a WordPress plugin. It is its own npm workspace. Run `cd sdk && npm install && npm test`, and see `sdk/README.md`.

Its install guide is `src/pages/docs/web-sdk.astro` (`/docs/web-sdk`). That page reads the framework recipes from `dashboard/src/features/integrations/snippets/web-sdk.ts`, the same file the dashboard's Website chat guide uses. Its live demo widget is built from `sdk/packages/web/src`.

## Before launch

Search for `PLACEHOLDER`:

- `src/data/site.ts` — contact email, sign-up URL and demo-booking URL (currently
  `mailto:` links). The domain (`url`) is mirrored in `astro.config.mjs` (`site`) and `public/robots.txt`.
- `src/components/home/Context.astro` — the one-line privacy note under "No unnecessary
  repetition". Confirm it matches how Truplexy actually handles conversation data.

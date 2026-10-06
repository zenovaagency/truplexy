# Truplexy dashboard

The browser app for the Truplexy API (`../API_REFERENCE.md`): overview, tickets, knowledge base, the AI pages (LLM, Tools, Playground), integrations, API keys, team, logs, settings, and the platform admin console. It uses the landing page's design tokens and button system, from `../src/styles/tokens.css` and `buttons.css`.

## Run it

```bash
npm install
npm run dev:mock      # demo mode: sample data in your browser, no backend needed
npm run dev           # against a real API (configure .env.local first)
npm run build         # type-check and build to dist/
npm run build:mock    # a demo build, e.g. for a preview deploy
```

Node 22.12 or later.

## Configuration

Copy `.env.example` to `.env.local`:

| Variable | Meaning |
| --- | --- |
| `VITE_API_BASE_URL` | The API, e.g. `https://api.truplexy.com/v2` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Auth, for sign-in and live updates |
| `VITE_DASHBOARD_URL` | This app's public URL, used in invitation links |
| `VITE_USE_MOCKS` | `true` serves every call from the in-browser mock API |

Only browser-safe values belong here. Never add `ADMIN_API_KEY`, `PLAYGROUND_API_KEY`, chat keys or the Supabase secret key: the dashboard signs people in and sends their own access token.

Model list prices come from OpenRouter's public model list (`https://openrouter.ai/api/v1/models`), which needs no key; if it can't be reached, prices show as unavailable and nothing else changes.

When pointing at a real API:
- Add the dashboard's origin to the API's `CORS_ALLOWED_ORIGINS`.
- Allow `PUT` from that origin on the R2 bucket, so knowledge uploads can go straight to storage.
- Add `<VITE_DASHBOARD_URL>/auth/callback` to Supabase Auth's redirect URLs, for magic links and Google.

## Demo mode

`npm run dev:mock` signs you in as Alex Rivera, with four sample businesses, tickets, documents, tools, keys and 30 days of usage. Data is kept in `localStorage` and refreshed daily.

The account menu (avatar, top right) has demo controls:
- **Preview as role** switches your role in the current business (owner, admin, editor, agent, viewer). The mock API enforces the same permission table as the real one, so hidden tabs and refused actions behave as they would in production.
- **Platform admin** turns the platform console on or off.
- **Reset demo data** restores the samples.

A simulated customer writes a follow-up every 45 seconds while a business is open, so live updates can be seen.

The mock layer (`src/lib/api/mock`) is loaded only when `VITE_USE_MOCKS=true`, and production builds leave it out entirely.

## Structure

```
src/
  main.tsx              boot: mock transport (demo only), then render
  app/                  router (lazy routes), guards, nav config, app shell
  components/
    ui/                 buttons, fields, dialogs, sheets, menus, tables, states
    layout/             sidebar, scope switcher, user menu, command palette
    charts/             recharts wrappers (lazy-loaded), bar lists, sparklines
    domain/             status badges, stat cards
  features/             one folder per tab
    llm/                LLM page (system prompt, model, usage & costs) and draft.tsx,
                        the unsaved bot configuration shared with tools/ and playground/
    integrations/       channel catalog and setup guides; snippets/<lang>.ts holds the
                        server code per language, each loaded only when picked
  lib/
    api/                typed client, endpoint hooks (React Query), types, mock API
    auth/               Supabase Auth provider
    session/            the current business, bot and permissions
    openrouter.ts       OpenRouter list prices, cached for an hour
    realtime.ts         live ticket updates (Supabase Broadcast), with polling fallback
    upload.ts           hash, register, PUT to R2, process until indexed
  styles/app.css        dashboard tokens, dark theme, component classes
```

### Conventions

- **Scope in the URL.** Business pages live at `/t/:tenant/:bot/<tab>`, so links can be shared. `/` returns to the last business used.
- **Permissions.** `useScopeCtx().can('tickets.write')` reads the role table from `GET /me`. Tabs a role can't open are hidden from the sidebar and the command palette, and show a no-access state when opened by URL. Actions a role lacks are hidden or disabled.
- **Server state.** Each endpoint group in `lib/api/endpoints` exports React Query hooks. Keys are built with `qk.tenant(scope, …)` and `qk.bot(scope, …)`, so switching bots never shows another bot's data. Errors toast globally with their request ID; set `meta.silent` or `meta.silentCodes` when a page shows the error itself.
- **Shortcuts.** `Ctrl/⌘ K` opens the command palette. `G` then a letter jumps to a tab (`G T` tickets, `G L` LLM, `G W` tools, `G P` playground). `J` and `K` move through the ticket queue.
- **Themes.** Light, dark or system, from the account menu. Colours are CSS variables, redefined under `[data-theme='dark']`: neutral greys like shadcn's dark theme, with the brand indigo kept for accents, the main action and charts.
- **One bot draft.** LLM, Tools and Playground edit the same unsaved copy of the bot's configuration (`useBotDraft()`), so a change can be tried in the Playground before "Save for customers". Leaving those pages, or switching bot, asks first.
- **Integration code.** To add a language or channel, add or extend a pack in `features/integrations/snippets` and list the language in the channel's `langs` in `catalog.tsx`.

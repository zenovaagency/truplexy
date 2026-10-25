# Truplexy dashboard

The browser app for the Truplexy API (`../API_REFERENCE.md`): overview, tickets, knowledge base, usage, the AI pages (Tools, Playground), integrations, API keys, team, logs, settings, and the platform admin console. It uses the landing page's design tokens and button system, from `../src/styles/tokens.css` and `buttons.css`.

## Run it

```bash
npm install
npm run dev:mock      # demo mode: sample data in your browser, no backend needed
npm run dev           # against a real API (configure .env.local first)
npm run build         # type-check and build to dist/
npm run build:mock    # a demo build, e.g. for a preview deploy
npm test              # vitest: unit tests, plus the playground and guide rendered against a fake API
npm run typecheck
```

Node 22.12 or later.

## Configuration

Copy `.env.example` to `.env.local`:

| Variable | Meaning |
| --- | --- |
| `VITE_API_BASE_URL` | The API, e.g. `https://api.truplexy.com/v3` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Auth, for sign-in and live updates |
| `VITE_DASHBOARD_URL` | This app's public URL, used in invitation links |
| `VITE_USE_MOCKS` | `true` serves every call from the in-browser mock API |

Only browser-safe values belong here. Never add `ADMIN_API_KEY`, `PLAYGROUND_API_KEY`, chat keys or the Supabase secret key: the dashboard signs people in and sends their own access token.

### Invitations

- The API returns an invitation's `link` when its `DASHBOARD_URL` is set to this app's URL. Otherwise the dashboard builds the link from `VITE_DASHBOARD_URL`.
- With `SUPABASE_SECRET_KEY` set as well, the API emails the invitation through Supabase Auth. Both the Invite user and Magic Link emails land on `/auth/callback?next=/invite/<token>`.
- Supabase's redirect URLs must allow that query string. Add `<VITE_DASHBOARD_URL>/auth/callback**`.
- `/auth/callback` accepts the default `{{ .ConfirmationURL }}` templates, which put the session in the URL hash. It also accepts templates built on `{{ .TokenHash }}`, such as `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}`. `/auth/confirm` and `/auth/callback` behave the same, and a `next` that is itself the callback URL goes straight to its own `next`.

Model list prices come from OpenRouter's public model list (`https://openrouter.ai/api/v1/models`), which needs no key; if it can't be reached, prices show as unavailable and nothing else changes.

When pointing at a real API:
- Add the dashboard's origin to the API's `CORS_ALLOWED_ORIGINS`.
- Allow `PUT` from that origin on the R2 bucket, so knowledge uploads (and, once the API serves them, pictures in the playground) can go straight to storage. The rule needs `PUT` with `Content-Type`.
- Add `<VITE_DASHBOARD_URL>/auth/callback` to Supabase Auth's redirect URLs, for magic links and Google.

## Image input (planned)

The API will let customers, and people testing in the playground, attach pictures to a message. It doesn't serve this yet (`GET /playground/attachments/config` is `404`), and the dashboard is built to cost nothing until it does:

- Everything keys off `GET /playground/attachments/config`, asked once per bot and kept for the session (`src/lib/images/feature.ts`). `404`, `enabled: false` or a failed call hide the attach button, the drop zone and paste handling, and the playground is exactly what it was. `reason: "plan"` shows an upgrade hint where the composer is; `no_vision_model` shows a hint to platform admins only. The limits (count, types, size) always come from the config.
- Upload and sending live in `src/lib/images/` (`pictures.ts` is the upload queue; `put.ts` is the `PUT` to R2, which carries only the headers the registration returned and never the app's token); the thumbnails are `components/domain/PictureComposer.tsx`, and pictures in messages (playground and tickets) are `components/domain/MessageImages.tsx`. Signed picture links last an hour, are never stored, and are renewed by reloading the conversation or ticket once.
- The integration guide's "Sending pictures" section (Integrations → API, and API keys) is labelled **Coming soon** until the same check says the API serves it. Set `VITE_IMAGE_INPUT_GUIDE=hidden` at build time to leave it out. The public docs (`../src`) never import it or its snippets (`src/features/integrations/snippets/images.ts`); a test fails if they do.
- Platform admins can fix "no model can read pictures" without a redeploy. Platform → Models has a **Vision model** card (`GET`/`PATCH /platform/settings`; it is left out against an API that predates it), a model has a **Reads pictures** switch (`supports_vision`), and a business's limit overrides include **Pictures in messages** (`image_input`; Free has none). Saving either refreshes the playground's picture check.
- Demo mode serves image input only when asked, so by default it answers like the API today. In the browser console: `localStorage.setItem('truplexy.mock.imageInput', 'on')` (or `plan`, `no_vision`, `on-expired` for links that are dead the first time), then reload. `localStorage.setItem('truplexy.mock.imageFail', 'invalid')` (also `not_found`, `not_uploaded`, `too_large`, `unsupported`) fails the next send once, and `localStorage.setItem('truplexy.mock.imageFlaky', '1')` cuts off the first `PUT` of each file. `VITE_MOCK_IMAGE_INPUT=on` sets the mode at build time.
- Demo mode serves the Performance pages by default. To see each situation they handle, run `localStorage.setItem('truplexy.mock.performance', mode)` and reload: `off` (the routes answer 404, so the page drops out of the menu), `no_http` (request statistics are off), `sampled` (a 25% sample), `no_models` (model calls aren't stored), `old` (most reply time is "other"), `empty` (no activity), `noreplies` (requests but no replies) and `high` (a high error rate). `on` is the default.

## Custom properties

Businesses define typed fields (text, number, date, single and multiple choice, email, phone, link, yes/no) for a bot's records under **Settings → Properties** (`src/features/settings/PropertiesTab.tsx`, API reference "Custom properties"). Customers are the first records with them.

- The tab, and every later screen that shows properties, keys off one cheap `GET /properties` per bot (`src/lib/features.ts`). Until it succeeds, nothing about properties shows, so an API without them, or with migration `0041` not applied, looks as it did before.
- `src/components/domain/Properties.tsx` has the inputs (`PropertyFields`) and the read-only list (`PropertyList`) for any record; `src/lib/properties.ts` moves values between the API and the fields. Edits send only the values that changed, so a value the API would no longer accept (a removed option) isn't sent again.
- Sensitive properties come back masked (`masked_properties`) to people who can't edit the record; they show as **Hidden**.
- Demo mode serves properties, with three on Acme's support bot, and checks values with the API's rules (`src/lib/api/mock/properties.ts`).
- **Customers** show their picture (`avatar_url`; agents and up can upload or remove one), their properties in the detail sheet and form, up to three property columns (remembered per browser), and a filter over choice and yes/no properties. The open customer is in the address (`/customers/cus_…`), so it can be linked to from tickets.
- The chat API's `PUT /customer` takes `avatar_url` and `properties` too, but the SDK (`sdk/`), `sdk/CHAT_API.md` and the public docs' `CUSTOMER_RULES` (`src/features/integrations/snippets/chat-api.ts`) don't mention them yet: an API without them refuses unknown fields. Add them there once the API serves them.

## Products

**Products** (`src/features/products/`) is the bot's catalog: search, a status and property filter, an add/edit sheet with the product's properties, and imports. It shows in the menu once `GET /products` answers (`src/lib/features.ts`).

- **Import** reads a file (CSV, JSON, PDF, Word, Markdown, text, HTML) or a web page into drafts (`ImportDialog.tsx`); files go straight to storage like knowledge uploads (`putObject` in `src/lib/upload.ts`). Nothing is saved until someone reviews the drafts on `/products/imports/:id` (`ImportReviewPage.tsx`), unticks or fixes rows, and saves; only the indexes and the fields changed are sent, so big imports stay small.
- Files read by their columns (CSV, JSON) and pages with product data cost nothing; the rest are read with AI, billed as a reply, which the dialog says before it starts.
- Product pictures are links to other sites, shown with `referrerPolicy="no-referrer"` and a placeholder when they don't load.
- Settings → Properties gets a Products tab once the catalog is served.
- Demo mode imports a CSV as the API would (`src/lib/api/mock/products.ts`); other files and pages give a small sample shop. A link with `fail` in it shows a page that couldn't be read, and one with `ai` a page read with AI.

## Deploying

The repo deploys to Vercel as one project with two services (`../vercel.json`). This app is the `dashboard` service and is served on any host starting with `app.`, i.e. `https://app.truplexy.com`. Every other host, including `*.vercel.app` preview URLs, gets the marketing site, so a dashboard preview needs a branch domain that starts with `app.`.

- Set the `VITE_*` variables in the Vercel project's environment. They are read at build time, so redeploy after changing them. Use `VITE_USE_MOCKS=false` for production; `true` gives a demo deploy.
- Add `https://app.truplexy.com` to the API's `CORS_ALLOWED_ORIGINS` and the R2 bucket's CORS, and `https://app.truplexy.com/auth/callback` to Supabase Auth's redirect URLs.
- Run both services locally with `vercel dev` from the repo root, then open `http://app.localhost:3000`.

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
    llm/                draft.tsx, the unsaved bot configuration shared with tools/ and
                        playground/ (there is no LLM page: the platform sets the model)
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

- **Scope out of the URL.** Business pages live at `/<tab>` (`/overview`, `/tickets/:id`); the business and bot are never in the address bar. Each tab keeps its own scope (sessionStorage), and a new tab returns to the last business used. Switching scope is a navigation with `state.scope` (`scopeLink()`). Shared links ("Copy link") use `/t/:tenant/:bot/<tab>`, which selects that scope and redirects to the plain URL.
- **Permissions.** `useScopeCtx().can('tickets.write')` reads the role table from `GET /me`. Tabs a role can't open are hidden from the sidebar and the command palette, and show a no-access state when opened by URL. Actions a role lacks are hidden or disabled.
- **Server state.** Each endpoint group in `lib/api/endpoints` exports React Query hooks. Keys are built with `qk.tenant(scope, …)` and `qk.bot(scope, …)`, so switching bots never shows another bot's data. Errors toast globally with their request ID; set `meta.silent` or `meta.silentCodes` when a page shows the error itself.
- **Shortcuts.** `Ctrl/⌘ K` opens the command palette. `G` then a letter jumps to a tab (`G T` tickets, `G L` LLM, `G W` tools, `G P` playground). `J` and `K` move through the ticket queue.
- **Themes.** Light, dark or system, from the account menu. Colours are CSS variables, redefined under `[data-theme='dark']`: neutral greys like shadcn's dark theme, with the brand indigo kept for accents, the main action and charts.
- **One bot draft.** LLM, Tools and Playground edit the same unsaved copy of the bot's configuration (`useBotDraft()`), so a change can be tried in the Playground before "Save for customers". Leaving those pages, or switching bot, asks first.
- **Integration code.** To add a language or channel, add or extend a pack in `features/integrations/snippets` and list the language in the channel's `langs` in `catalog.tsx`.

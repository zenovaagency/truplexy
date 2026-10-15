# Truplexy launch film: scene design (Step 2, for review)

> **v3 story (2026-10-14), supersedes scenes 02, 03, 04 and 08 below.** Truplexy is an AI assistant on every channel plus one platform where the team manages everything; it does not link one customer across channels, so the website-to-Telegram memory story was removed. 02 is now "Juggling apps" (three separate inboxes, a missed message, a customer waiting); 03 connects the mark to "AI assistant" and "Your team"; 04 is the dashboard's unified Tickets inbox (one row per channel, resolved / AI summary / waiting for the team); 08 ends on "Every channel. One platform." Headlines use one voice-synced style throughout. See `docs/production-report.md` for the delivered version.

92.0 s · 1920×1080 · 30 fps (2,760 frames) · white theme in every scene, with no dark frames and no fades to black.

## 1. Brand system (extracted from the repo)

| Token | Value | Source |
|---|---|---|
| Canvas / paper / surface-2 | `#FFFFFF` / `#F7F8FC` / `#F1F3FA` | `src/styles/tokens.css` |
| Ink / muted / faint | `#0E1222` / `#4A5068` / `#61688A` | tokens.css |
| Lines | `#E3E6F0`, strong `#CBD0E0` | tokens.css |
| **Accent (text, active word, buttons)** | **`#2338E6`**, soft `#EEF0FF` | tokens.css |
| Brand ramp (decorative only) | cyan `#45D4FF` → blue `#1F7BFF` → indigo `#2338E6` → violet `#6A2BFF`, lilac `#D9B8FF` | tokens.css `--gradient-brand` |
| Text-safe gradient (headline keywords) | blue → indigo → violet | `--gradient-text` |
| Status pairs | AI `#2338E6`/`#EEF0FF` · Human `#9A4B00`/`#FFF1DD` · Resolved `#15803D`/`#E6F6EB` | tokens.css |
| Type | **Plus Jakarta Sans Variable** (headlines, UI, subtitles) · Geist Mono (labels, timestamps) | `@fontsource-variable/*`, already installed |
| Radii / shadows | 8 / 12 / 16 / 24 / 32 px · indigo-tinted soft shadows `0 28px 64px rgb(35 56 230 / .10)` | tokens.css |
| Easing | `cubic-bezier(.22,1,.36,1)` (out-expo), spring `(.34,1.56,.64,1)` for small pops only | tokens.css |
| Logo | `src/assets/brand/mark.png` (874×928) + `wordmark-dark.png` (1887×482); the gradient ribbon-triangle mark | repo |
| Tagline | "One conversation. Everywhere." | `src/data/site.ts` |

**UI sources, recreated as motion components in light theme:**
- Website chat widget: `src/islands/TryChat.tsx`, `components/channels/demo/SiteWidget.astro`
- Phone/messaging chat: `components/channels/demo/PhoneChat.astro`
- Dashboard shell (sidebar, scope bar): `dashboard/src/components/layout/*`
- Tickets list and ticket detail (bubbles, status badges, "Handed off", assignee): `dashboard/src/features/tickets/*`
- Knowledge base table (Indexed / Processing status): `dashboard/src/features/knowledge/KnowledgePage.tsx`
- Team-hours / "Truplexy is online" day cycle: `src/islands/DayCycle.tsx`

The dashboard has a light theme, so no dark-only adaptation is needed.

**Claims guard:** every channel shown is `live` in `src/data/channels.ts`. Source citations are real (the chat API returns `sources`, and the widget has a "show sources" option). Every person, store and order is fictional, and on-screen UI carries a small "Sample data" tag as the site does. No metrics, logos of customers, certifications or testimonials.

## 2. Timeline (narration = authoritative)

| # | Scene | In → Out | VO clip (len) | VO starts at |
|---|---|---|---|---|
| 01 | Customers never stop asking | 0.0 → 11.0 | scene-01 (7.84 s) | 1.2 s |
| 02 | Disconnected conversations | 11.0 → 20.0 | scene-02 (6.08 s) | 11.8 s |
| 03 | Meet Truplexy | 20.0 → 31.0 | scene-03 (6.80 s) | 21.6 s |
| 04 | One conversation, across channels | 31.0 → 43.0 | scene-04 (7.04 s) | 31.8 s |
| 05 | Human-like support, 24/7 | 43.0 → 61.0 | scene-05 (7.20 s) | 44.0 s |
| 06 | Business knowledge | 61.0 → 72.0 | scene-06 (6.80 s) | 61.8 s |
| 07 | AI efficiency, human connection | 72.0 → 83.0 | scene-07 (6.40 s) | 72.8 s |
| 08 | Final brand moment | 83.0 → 92.0 | scene-08 (5.68 s) | 83.6 s |

Narration totals 53.8 s. The other ~38 s go to UI demonstrations and musical beats, where the music rises between lines. Exact VO starts are re-snapped once word timestamps are measured.

## 3. Scenes

### 01 · Your customers never stop asking (0–11 s)
- **Visual:** pure white field. One notification card drops in (website chat, "Where is my order?"). Then cards arrive on a rhythm from WhatsApp, Instagram, Messenger, Telegram, Discord and Email, each with its real brand glyph from `public/brands`. The lines are "Can I talk to someone?", "Is this available?", "What are your delivery charges?" and "Hello? Anyone there?". The cards stack in 2.5D depth with a slow push-in. Unread badges count up and the frame gets busy but stays composed.
- **Headlines** (top-left, large, ink with an indigo keyword): "YOUR CUSTOMERS DON'T STOP ASKING." then "BUT YOUR TEAM CAN'T BE EVERYWHERE."
- **Transition:** the cards freeze for a beat, then split into two lanes, which leads into Scene 02.

### 02 · Disconnected conversations (11–20 s)
- **Visual:** two separate light chat panels, "Website chat" on the left and "Telegram" on the right, with a gap between them. A fictional customer, Sarah, asks about order #4821 on the web. On Telegram she has to retype it while a generic "Can you share your order number again?" pops up. These panels are deliberately unbranded, showing life *without* Truplexy.
- **Kinetic type:** "SAME CUSTOMER." / "DIFFERENT CHANNEL." / "STARTING OVER." in three stamped beats.
- **Transition:** the panels slide together and their messages fall into a single vertical timeline. A thin brand-gradient line runs down the centre, and that line becomes the logo's path.

### 03 · Meet Truplexy (20–31 s)
- **Visual:** the timeline cards orbit inward on a clean white stage, and the gradient line traces the triangular ribbon of the mark. The real `mark.png` resolves with a soft scale and light sweep, then the wordmark slides out beside it. Three small labels connect to the mark: **Customers · AI · Team**, matching "connecting your customers, your AI, and your team".
- **Type:** "MEET TRUPLEXY." then "ONE CONVERSATION. EVERYWHERE." The subtitles sit low so they don't compete with the mark.

### 04 · One conversation, across channels (31–43 s)
- **Data:** the site's own "James Wong" story from `src/data/demo.ts` `CONTEXT`, with the opening question reworded to the brief's line. The business here is **Truplexy's own sales chat** (website and Telegram bot), because the question is about Truplexy's real Starter and Pro plans; a clothing store answering it would not make sense.
  - **Website chat, Tuesday:** "Which plan would be best for my team?" → "For a team of three, Starter covers the core support features — Pro mainly adds advanced automation."
  - **Telegram, Wednesday:** "What was the plan you suggested?" → "The plan we discussed earlier was Starter…"
- **Visual:** the web widget is on the left. The mark docks between the two panels as a hub. The first message's card physically travels to a **shared context panel** (Customer · Linked channels: Website, Telegram · Interest: Starter plan) and then into the Telegram phone, where the AI's reply highlights the recalled item. A soft "context preserved" chime marks the moment.
- **Type:** "DIFFERENT CHANNELS." / "ONE CONTINUOUS CONVERSATION."

### 05 · Human-like support, 24/7 (43–61 s), the longest demo
- **Store:** Loom & Lane, the sample store the site already uses, with its website-chat widget.
  - **Product question:** "Do you have this jacket in black?" → typing dots → "Yes! It's available in black. Would you like to see the available sizes?" An Atlas Jacket product card animates in with its thumbnail (a drawn illustration, not a stock photo), colour swatches with Black selected, and sizes S–XL.
  - **Order question:** "Where's my order?" → an order card reading **Order #1048 · Out for delivery · Estimated arrival: Tomorrow** (the brief's values, approved), tagged "Sample data". Order lookups are supported through the store integrations and custom tools.
- **24/7 beat** (after the voice ends, with the music up): a small clock in the widget header advances from 5:58 PM to 9:40 PM. A "Team offline" chip slides in, and a "Truplexy is online" green dot stays lit, using the site's DayCycle language. A third question is answered at 9:41 PM. The canvas stays white.
- **Type:** "NATURAL CONVERSATIONS." / "HELPFUL ANSWERS." / "24/7."

### 06 · Your business knowledge (61–72 s)
- **Visual:** the dashboard Knowledge base page, recreated in light theme and restyled for Loom & Lane. It lists "Returns and refunds", "Shipping policy", "Product catalog 2026.pdf" and "Size guide", each marked **Indexed**. The rows lift off the table as cards.
- A customer bubble asks "What is your return policy?". The "Returns and refunds" card glows, and a thin line runs from it into the answer: "You have 30 days from delivery to return anything unworn, tags on. Returns are free anywhere in the US." A **Source: Returns and refunds** chip sits under the reply.
- **Type:** "YOUR BUSINESS KNOWLEDGE." / "POWERING BETTER ANSWERS."

### 07 · AI efficiency, human connection (72–83 s)
- **Visual:** the chat widget again, with the brief's lines.
  - Customer: "I need help with a special refund request."
  - Truplexy: "Let me connect you with our support team."
- The conversation flies into the dashboard **ticket detail**. The handoff packet assembles from the site's real packet fields: Customer · History (Website → Telegram) · Intent: refund request · Previous actions · Suggested next step. The status changes from **AI handling** to **Handed off**, and the assignee avatar **Priya · Billing** joins. Priya's reply: "Hi! I've reviewed your request. Let me help." The thread above her stays visible, so the customer never repeats anything.
- **Type:** "AI WHEN IT CAN." / "HUMANS WHEN THEY MATTER." This is the site's own line from the Human + AI section.

### 08 · Final brand moment (83–92 s)
- **Visual:** a quick recap with about 0.4 s per callback: notification card, the web-to-Telegram hop, the context panel, the jacket reply, the source chip, the handoff avatar. The callbacks arrange around the centre, then the camera pulls back and they collapse into the mark. The full lock-up (mark + wordmark) appears on white with a single gradient sweep.
- **End card** (held for the last ~3 s with the subtitles cleared): the Truplexy lock-up · "One conversation. Everywhere." · a **Start free trial** button (the site's primary CTA, approved) · **truplexy.com**. The last frame stays white.

## 4. Subtitles
- Lower-centre, max 2 lines, 3–7 words per group, Plus Jakarta Sans 600 at ~44 px. Text is ink `#0E1222`, and the active word turns indigo `#2338E6` with a soft `#EEF0FF` pill behind it.
- The captions move to the top band when the lower third holds a demo UI (Scenes 05 and 07). They fade out before the end-card hold.
- Timings come from measured word timestamps of the approved clips (ElevenLabs Scribe, or local forced alignment if needed), never an even split. An SRT is exported from the same data.

## 5. Audio plan (built in a later step)
- **Music:** one bright, modern electronic bed, made with ElevenLabs Music (licensed for use) so it's original. Tension in 01–02, a lift at the reveal at 20 s, a peak and resolution at the end.
- **SFX:** ElevenLabs sound effects or original synthesis: soft notification ticks, sent/received blips, a context-preserved chime, a reveal shimmer, a handoff chord, and the final sonic logo.
- **Mix:** narration-driven ducking of about −14 dB under the voice, with ~120 ms attack and ~400 ms release envelopes computed from word timestamps. Target −14 LUFS integrated, ≤ −1 dBTP.

## 6. Build
- `launch-video/`: its own Remotion 4 + React + TypeScript package, using npm like the repo. It imports `src/styles/tokens.css` values and copies the logo PNGs into `launch-video/public/`. Fonts load from the installed `@fontsource-variable` packages, so nothing is fetched remotely at render time.
- The production site and dashboard code are not modified.

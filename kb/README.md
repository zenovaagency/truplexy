# Truplexy's own knowledge base

Content for the bot that answers questions on truplexy.com. Written 2026-11-22 from the site's data files (`src/data/*`), the dashboard's integration catalog and the backend's plan limits. Re-check it when pricing, plans or channels change.

## Upload

1. In the dashboard (https://app.truplexy.com) create the business and a bot for the website.
2. Knowledge → Upload. Drag in the numbered `.md` files and `faq.csv` together (not this README). The CSV becomes one section per row (`question` / `answer` columns).
3. Optional: per file, under "Source and filters", set a source link such as `https://truplexy.com/pricing` so answers cite the live page.
4. Use the retrieval test on the Knowledge page with the questions in `eval/truplexy-kb-questions.jsonl`.
5. Create a chat key (Integrations → Website chat) and set it as `TRUPLEXY_CHAT_KEY` on the site's Vercel project. See the main README, "The site's own chat".

Starter allows 300 documents per bot, so this set (15 files) fits easily.

## Suggested bot instructions

If the bot has a settings or instructions field, something like: "You are the Truplexy website assistant. Answer only questions about Truplexy (plans, features, channels, setup, security, billing) from the knowledge base. Never invent prices, features or links. If a question isn't covered, say so and offer to connect the visitor with the team or point them to hello@truplexy.com or https://truplexy.com/demo. Do not write code, poems or general advice unrelated to Truplexy."

A past test found that a new bot can drift off-topic (a store bot wrote a poem when asked), so check this with a few off-topic questions.

## Decisions made while writing

- HubSpot, Zendesk, Slack and Microsoft Teams are written as **coming soon**. The marketing registry (`src/data/channels.ts`) still marks them `live`, while the dashboard catalog marks them `soon` and the backend has no code for them. The registry and the pricing/FAQ copy should be fixed separately.
- WhatsApp, Messenger and Instagram are written as **your own Meta app** (IDs and tokens, 24-hour reply window). Some site copy still says "one click, sign in with Meta".
- Web search is described as the pricing page lists it (Pro and above). The backend also allows it on Starter. Confirm which is right.
- Left out on purpose: the "Founding 100" offer (not launched), MCP (parked), picture input (not switched on, mentioned only to say it is unavailable), and any customers or reviews (none yet).
- `hello@truplexy.com` is a placeholder inbox in `src/data/site.ts`. Make sure it is monitored before the bot sends people there.
- Retention periods (90 days / 1 year / 7 days) come from the privacy page. They were not found enforced in the backend, so treat them as stated policy.

# Truplexy — Channels and Integrations

Every channel: https://truplexy.com/channels

## Which channels does Truplexy work on?
Truplexy works on website chat, WhatsApp, Messenger, Instagram, Telegram, Discord and Email. It also connects to Shopify, WooCommerce and WordPress, and has a REST API, webhooks and custom integrations for your own apps. All of these are included on Starter and Pro.

## Which channels connect from the dashboard?
- Discord: add Truplexy's ready-made bot to your server from the dashboard.
- Shopify: install the Truplexy app on your store.
- WhatsApp, Messenger and Instagram: connect from the dashboard through your own Meta app. See the Meta channels article.
- WordPress and WooCommerce: install the Truplexy Chat plugin and paste your chat key.

## Which channels need my own server code?
- Website chat: add the chat widget and one route on your server. The route holds the chat key.
- Telegram: create a bot with @BotFather and point it at a webhook handler on your server.
- Email: route your support address to an inbound mail webhook (Postmark, SendGrid, Mailgun or similar) and use a handler on your server. Email drafts answers to support emails.

## Which integrations are coming soon?
HubSpot, Zendesk, Slack and Microsoft Teams are coming soon. They are not available yet and cannot be connected today. The plan is for HubSpot and Zendesk to answer conversations and tickets, and for Slack and Teams to receive escalations so teammates can reply from the thread. The pricing page lists them under Pro and above.

## Do customers need Slack or Teams?
No. Customers stay on their own channel. Slack and Teams are planned only as places where your team sees escalations and answers them.

## Is there a REST API?
Yes. Starter has a limited REST API and Pro and Enterprise have the full REST API. Webhooks are on Pro and Enterprise. See the developers article.

## Does Truplexy connect to an app that isn't listed?
Yes, through the REST API, webhooks and custom tools (HTTP API tools the assistant can call). Custom integrations are a section of https://truplexy.com/docs/api.

## Does one customer who writes on two channels count as two people?
No. Truplexy keeps one customer history across channels. Customers are matched by their contacts, such as an email address or phone number.

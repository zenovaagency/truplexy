# Truplexy — Discord, Telegram and Email

## How does the Discord channel work?
Add Truplexy's ready-made Discord bot to your server from the dashboard under Integrations. Members open a private support ticket channel with an "Open a ticket" button, and your assistant answers first. The bot also has moderation commands and welcome messages.

## Does the Discord bot need an active plan?
AI replies and tickets need an active plan. On a linked server with no active plan, moderation and welcome messages still work, but tickets and AI replies are off.

## How does the Telegram channel work?
Telegram is a bot that answers in private chats and in groups. Create the bot with @BotFather (run /newbot), keep the token as a server secret, then point Telegram at a webhook handler on your server. This needs a developer. Telegram is not one-click.

## Does Telegram work in groups?
Yes. Add the bot to a group and it answers text messages there, as well as in private chats.

## How does the Email channel work?
Email drafts answers to support emails. Route your support address to an inbound mail webhook (Postmark, SendGrid, Mailgun or similar) and use the thread's Message-ID or the sender's address to keep one conversation per thread. This needs a handler on your server.

## Which email providers work?
Any inbound mail service that posts emails to a webhook, such as Postmark, SendGrid or Mailgun.

## Where are the setup guides?
Telegram and Email guides, with server code for several languages, are at https://truplexy.com/docs and in the dashboard under Integrations.

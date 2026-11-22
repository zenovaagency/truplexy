# Truplexy — API, Webhooks and Getting Started

Docs: https://truplexy.com/docs

## How do I get started?
1. Create an account at https://app.truplexy.com and start the 7-day free trial of Starter or Pro.
2. Create a bot and add your knowledge: articles, FAQs and files.
3. Connect a channel under Integrations (website chat, WhatsApp, Messenger, Instagram, Discord, Shopify, WordPress and others).
4. Invite your team and set who takes over when a person is needed.
5. Test the assistant on the playground, then switch the channel on.
The quickstart is at https://truplexy.com/docs#quickstart.

## How long does setup take?
Most of setup is connecting your channels and adding your knowledge. The website chat is a short snippet or the WordPress plugin. WhatsApp, Messenger and Instagram take longer because they go through your own Meta app. How long the rest takes depends on how much knowledge you add, such as help articles, policies and product details.

## Do I need a developer?
Not for the dashboard, Discord, Shopify or WordPress. A developer is needed for the website chat server route, Telegram, Email, and for the REST API, webhooks and custom tools.

## Is there a REST API?
Yes. Starter has a limited REST API. Pro and Enterprise have the full REST API. The base URL is https://api.truplexy.com/v3. Docs are at https://truplexy.com/docs/api.

## What are webhooks?
Webhooks send signed events from Truplexy to your server. They are available on Pro and Enterprise. Your endpoint should answer with a 2xx status within 2.5 seconds, and verify each event with the `X-Truplexy-Signature` header.

## What is a chat key?
A chat key is the secret your server uses to talk to the Truplexy API for the website chat. Never put it in browser code. Create one in the dashboard under Integrations → Website chat.

## What is a ticket?
A ticket is a conversation that needs a person. When the assistant hands off, it opens a ticket in the inbox with the full history.

## How do I get help?
Email hello@truplexy.com. Starter includes email support, Pro has priority support, and Enterprise has dedicated support. To talk to a person before buying, book a demo at https://truplexy.com/demo.

## What can I see in a demo?
A live walkthrough of the assistant, the inbox and handoff; your channels and tools; plans and Enterprise pricing; and data handling, AI accuracy and setup.

## Where is the changelog?
At https://truplexy.com/changelog.

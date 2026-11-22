# Truplexy — Website Chat and SDK

Install guide: https://truplexy.com/docs/web-sdk

## What is the Truplexy website chat?
The website chat is a ready-made chat widget (`<truplexy-chat>`, package `@truplexy/web`) for any site. It is about 12 KB gzipped, runs in a Shadow DOM so your site's styles don't clash with it, and has no dependencies. It works with React, Next.js, Vue, Nuxt, Svelte, Angular, Astro and plain HTML.

## How do I add the chat to my website?
There are two parts:
1. Add one route to your server (the `@truplexy/server` package gives you a ready-made handler). The route holds your chat key and keeps a signed session for each visitor, with no database needed.
2. Add the widget to your pages, either with a script tag from the jsDelivr CDN or by importing `@truplexy/web` in your app.
React and Vue wrappers are available as `@truplexy/react` and `@truplexy/vue`.

## Where do I get a chat key?
In the dashboard under Integrations → Website chat. The chat key is a secret your server uses. It must never go in browser code. The widget only talks to your own server route, and that route talks to the Truplexy API.

## Do I need a developer to add the chat?
Not necessarily. On WordPress, install the Truplexy Chat plugin and paste the key. For other sites the chat needs a snippet plus one server route, which a developer or a no-code-friendly framework recipe can cover.

## Can I change how the chat looks?
Yes. Set the title, greeting, colour, picture and position in the dashboard under Integrations → Chat widget. Any CSS colour works as the accent colour, and the default colour is black. Developers can also set options on the element and CSS variables such as `--truplexy-accent`.

## Can the widget show suggested questions?
Yes. The widget can show up to 4 suggested-question chips that visitors tap to start a chat.

## Do team replies arrive live in the chat?
Yes. When a teammate takes over, their replies reach the visitor in real time. If a live connection isn't available, the widget polls instead. The customer sees a notice such as "Name has joined and will reply here."

## Does the widget use cookies?
No. The widget sets no cookies. It keeps the visitor's name, email and a signed session token in the browser's local storage.

## What happens to a chat after it is closed?
A closed chat stays readable in the widget for 3 days, with a button to start a new chat. A business can also choose to reject new messages on a closed ticket.

## Can visitors send pictures in the chat?
Not yet. Picture input is not switched on, and the widget has no attach button. Do not promise it.

## Who is the "Bubbly" mascot?
Bubbly is Truplexy's mascot. It is the chat button on truplexy.com and in the widget's default look.

## Does Truplexy have a WordPress plugin?
Yes. The Truplexy Chat plugin (truplexy-chat.zip) adds the chat to every page by itself, with no theme edits. It works on any WordPress site and on WooCommerce stores. See the WordPress article.

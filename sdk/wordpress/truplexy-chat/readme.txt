=== Truplexy Chat ===
Contributors: tanvirhossen
Tags: chat, live chat, support, ai, chatbot
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: MIT

AI customer support that keeps one conversation going, with handoff to your team. Your chat key stays on your server.

== Description ==

Adds the Truplexy chat button to every page. Visitors get instant answers from your Truplexy knowledge base, can ask for a person, and see your team's replies right in the chat. It works on any WordPress site, including WooCommerce stores: the chat appears on shop, product, cart and checkout pages without a separate plugin.

The browser only talks to your own site (`/wp-json/truplexy/v1/chat`). The plugin calls Truplexy with your chat key, which never reaches visitors.

== External service ==

This plugin connects your site to Truplexy (https://truplexy.com), a hosted AI customer-support service. It cannot work without it.

* **What is sent:** each message a visitor types into the chat, and optionally the name and email they enter in the chat form, the background text your own code adds with the `truplexy_chat_context` and `truplexy_chat_customer` filters, and your chat key. Nothing is sent until a visitor sends a message, apart from a request for the chat's title, colours and picture when the widget loads.
* **Where it goes:** from your server to `https://api.truplexy.com`. The visitor's browser only talks to your own site (`/wp-json/truplexy/v1/chat`).
* **The widget script:** `truplexy.min.js` is included in the plugin and served from your site. No third-party CDN is used unless you delete that file.
* Terms of service: https://truplexy.com/terms
* Privacy policy: https://truplexy.com/privacy

You need a Truplexy account to get a chat key.

== Installation ==

1. In the Truplexy dashboard, open Integrations → Website chat, add a channel and issue its chat key.
2. In WordPress, open Plugins → Add New and install this plugin (or Upload Plugin with the zip), then activate it.
3. Paste the chat key on the Settings → Truplexy Chat page that opens, then save. It says Connected when the key works. Advanced: define `TRUPLEXY_CHAT_KEY` in `wp-config.php` to keep the key out of the database.
4. In the Truplexy dashboard, open Integrations → Chat widget to set the title, greeting, colour, picture and position. They apply to this site and to every other place the chat is shown.

== Frequently Asked Questions ==

= Where does the widget script come from? =

From the plugin folder (`truplexy.min.js`, the `@truplexy/web` widget). If that file is removed, the plugin falls back to jsDelivr.

= Do I need a separate plugin for WooCommerce? =

No. WooCommerce is a WordPress plugin, so this one already works on every WooCommerce page.

= Can the assistant know who the visitor is? =

Yes. Use the `truplexy_chat_context` filter to return background text, such as the customer's name and plan. It is sent once, privately, when a conversation starts. The filter gets the REST request and the signed-in user's ID (0 for guests):

`add_filter('truplexy_chat_context', function ($context, $request, $user_id) {
    if (!$user_id) return $context;
    $user = get_userdata($user_id);
    return 'Signed in as ' . $user->display_name . ' (' . $user->user_email . ')';
}, 10, 3);`

= How do I link a signed-in customer? =

The default form collects a name (up to 120 characters) and email. The plugin calls PUT /customer and starts the conversation with customer_id; its ticket inherits that identity. Linking failure stops a new identified chat. CUSTOMER_EXISTS is retried once; CUSTOMER_CONFLICT needs correction in the dashboard.

Use truplexy_chat_customer for verified contacts and metadata. The filter runs only for a new conversation and takes precedence over the form; return null to use the form. Its user_id is validated from the WordPress login cookie. Metadata must be a JSON object up to 4 KB.

`add_filter('truplexy_chat_customer', function ($customer, $request, $user_id) {
    if (!$user_id) return null;
    $user = get_userdata($user_id);
    return ['name' => $user->display_name, 'contacts' => [
        ['type' => 'wordpress', 'value' => get_current_blog_id() . ':' . $user_id],
        ['type' => 'email', 'value' => $user->user_email],
    ]];
}, 10, 3);`

TRUPLEXY_CHANNEL_ID in wp-config.php optionally overrides the key's channel. Existing conversations are never relinked. Background context and automatic ticket creation remain best effort. Only REALTIME_NOT_CONFIGURED falls back to polling; channel and authentication failures surface as errors.

When the server supplies identity, skip the form for signed-in users with `add_filter('truplexy_chat_details', function ($details) { return is_user_logged_in() ? 'off' : $details; });`. Guests still see the default details form.

The widget stores its signed session and details in the browser. reset() retains details; use separate storage per account with `add_filter('truplexy_chat_storage_key', function () { return 'truplexy:' . get_current_blog_id() . ':' . get_current_user_id(); });` and reload after signing in or out. This separates browser history; your server still controls authorization. See https://truplexy.com/docs/web-sdk#customers for the identity and server options.

= How do I change the rate limit? =

Visitors can send 20 messages a minute by default. Change it with `add_filter('truplexy_chat_rate_limit', fn () => 40);`, or return 0 for no limit.

== Changelog ==

= 1.0.0 =
* First release on WordPress.org.
* The widget script is bundled with the plugin instead of loaded from a CDN.
* A conversation whose ticket the team closed is shown read-only for a few days, and the visitor starts a new chat instead of continuing it.
* Settings are removed when the plugin is deleted.
* After activation the plugin opens its settings page, reminds you on the Plugins screen until a key is set, and shows whether the key works.
* Settings screen and rate limiter escape and sanitise their values.

= 0.3.0 =
* How the chat looks (title, greeting, colour, picture, side of the page, theme) is now set once in the Truplexy dashboard under Integrations → Chat widget and shared with every other place the chat is shown. The settings page no longer has those fields; saved values are ignored.

= 0.2.0 =
* Settings: "Keep website chat tickets open" stops the tickets the chat opens from closing on their own after your business's auto-close time.
* Sources can link web pages the assistant searched as well as your articles.

= 0.1.0 =
* First release.

== Upgrade Notice ==

= 1.0.0 =
First WordPress.org release. The chat widget is now bundled with the plugin, and the settings page checks that your chat key works.

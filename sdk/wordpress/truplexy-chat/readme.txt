=== Truplexy Chat ===
Contributors: truplexy
Tags: chat, live chat, support, ai, chatbot
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.1.0
License: MIT

AI customer support that keeps one conversation going, with handoff to your team. Your chat key stays on your server.

== Description ==

Adds the Truplexy chat button to every page. Visitors get instant answers from your Truplexy knowledge base, can ask for a person, and see your team's replies right in the chat. It works with WooCommerce stores too.

The browser only talks to your own site (`/wp-json/truplexy/v1/chat`). The plugin calls Truplexy with your chat key, which never reaches visitors.

== Installation ==

1. In the Truplexy dashboard, open Integrations → Website chat, add a channel and issue its chat key.
2. Add the key to `wp-config.php`, above "That's all, stop editing!":
   `define('TRUPLEXY_CHAT_KEY', 'tpx_...');`
3. Upload the `truplexy-chat` folder to `/wp-content/plugins/` and activate it under Plugins.
4. Open Settings → Truplexy Chat to set the heading, greeting, colour and position.

== Frequently Asked Questions ==

= Where does the widget script come from? =

From jsDelivr (`@truplexy/web`). To serve it yourself, put `truplexy.min.js` in the plugin folder and the plugin uses that copy instead.

= Can the assistant know who the visitor is? =

Yes. Use the `truplexy_chat_context` filter to return background text, such as the customer's name and plan. It is sent once, privately, when a conversation starts. The filter gets the REST request and the signed-in user's ID (0 for guests):

`add_filter('truplexy_chat_context', function ($context, $request, $user_id) {
    if (!$user_id) return $context;
    $user = get_userdata($user_id);
    return 'Signed in as ' . $user->display_name . ' (' . $user->user_email . ')';
}, 10, 3);`

= How do I change the rate limit? =

Visitors can send 20 messages a minute by default. Change it with `add_filter('truplexy_chat_rate_limit', fn () => 40);`, or return 0 for no limit.

== Changelog ==

= 0.1.0 =
* First release.

/**
 * The Truplexy Chat WordPress plugin: the same file as
 * sdk/wordpress/truplexy-chat/truplexy-chat.php (an SDK test keeps them identical).
 */
export const WORDPRESS_PLUGIN = String.raw`<?php
/**
 * Plugin Name:       Truplexy Chat
 * Plugin URI:        https://zenovasolution.xyz/docs/web-sdk
 * Description:       Adds the Truplexy AI support chat to your site. Your chat key stays on the server.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * License:           MIT
 * Text Domain:       truplexy-chat
 *
 * Put your chat key in wp-config.php:  define('TRUPLEXY_CHAT_KEY', 'tpx_...');
 * Then open Settings → Truplexy Chat to style it.
 */

if (!defined('ABSPATH')) {
    exit;
}

const TRUPLEXY_CHAT_VERSION = '0.1.0';
const TRUPLEXY_CHAT_CDN = 'https://cdn.jsdelivr.net/npm/@truplexy/web@0/dist/truplexy.min.js';

function truplexy_chat_settings(): array {
    return wp_parse_args(get_option('truplexy_chat', []), [
        'enabled'      => '1',
        'chat_key'     => '',
        'heading'      => '',
        'subtitle'     => '',
        'greeting'     => '',
        'accent'       => '',
        'position'     => 'right',
        'theme'        => 'light',
        'show_sources' => '',
    ]);
}

/** The chat key: wp-config.php first, then the settings page. */
function truplexy_chat_key(): string {
    return defined('TRUPLEXY_CHAT_KEY') ? (string) TRUPLEXY_CHAT_KEY : (string) truplexy_chat_settings()['chat_key'];
}

function truplexy_chat_api_base(): string {
    return rtrim(defined('TRUPLEXY_API_BASE') ? TRUPLEXY_API_BASE : 'https://api.zenovasolution.xyz/v2', '/');
}

/* -------------------------------------------------------------------------
 * Sessions: a signed conversation ID the visitor's browser keeps (see PROTOCOL.md).
 * ---------------------------------------------------------------------- */

function truplexy_chat_secret(): string {
    return defined('TRUPLEXY_SESSION_SECRET') ? (string) TRUPLEXY_SESSION_SECRET : truplexy_chat_key();
}

function truplexy_chat_b64(string $bytes): string {
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function truplexy_chat_unb64(string $text) {
    if (!preg_match('/^[A-Za-z0-9_-]*$/', $text)) {
        return false;
    }
    return base64_decode(strtr($text, '-_', '+/') . str_repeat('=', (4 - strlen($text) % 4) % 4), true);
}

function truplexy_chat_sign(string $conversation): string {
    $payload = $conversation . '.' . time();
    return truplexy_chat_b64($payload) . '.' . truplexy_chat_b64(hash_hmac('sha256', $payload, truplexy_chat_secret(), true));
}

/** The conversation ID of a valid, unexpired session, or null. */
function truplexy_chat_verify($token): ?string {
    if (!is_string($token) || strlen($token) > 512 || substr_count($token, '.') !== 1) {
        return null;
    }
    list($p, $s) = explode('.', $token);
    $payload = truplexy_chat_unb64($p);
    $signature = truplexy_chat_unb64($s);
    if ($payload === false || $signature === false) {
        return null;
    }
    if (!hash_equals(hash_hmac('sha256', $payload, truplexy_chat_secret(), true), $signature)) {
        return null;
    }
    if (!preg_match('/^(conv_[0-9a-f]{32})\.(\d{1,12})$/', $payload, $m)) {
        return null;
    }
    $age = time() - (int) $m[2];
    return ($age >= -300 && $age <= 30 * DAY_IN_SECONDS) ? $m[1] : null;
}

/* -------------------------------------------------------------------------
 * The chat API.
 * ---------------------------------------------------------------------- */

class Truplexy_Chat_Error extends Exception {
    public $api_code;
    public $request_id;

    public function __construct(string $api_code, string $request_id = '') {
        parent::__construct($api_code);
        $this->api_code = $api_code;
        $this->request_id = $request_id;
    }
}

function truplexy_chat_api(string $method, string $path, ?array $body = null): array {
    $res = wp_remote_request(truplexy_chat_api_base() . $path, [
        'method'  => $method,
        'timeout' => 55,
        'headers' => ['Authorization' => 'Bearer ' . truplexy_chat_key(), 'Content-Type' => 'application/json'],
        'body'    => $body === null ? null : wp_json_encode($body),
    ]);
    if (is_wp_error($res)) {
        throw new Truplexy_Chat_Error('UPSTREAM_ERROR');
    }
    $status = (int) wp_remote_retrieve_response_code($res);
    $data = json_decode(wp_remote_retrieve_body($res), true);
    if ($status >= 300) {
        $code = $status === 401 ? 'NOT_CONFIGURED' : ($data['error']['code'] ?? 'UPSTREAM_ERROR');
        throw new Truplexy_Chat_Error($code, (string) ($data['error']['request_id'] ?? wp_remote_retrieve_header($res, 'x-request-id')));
    }
    return is_array($data) ? $data : [];
}

/** What the visitor may see: no background context, only the public fields. */
function truplexy_chat_public(array $conversation): array {
    $messages = [];
    foreach ($conversation['messages'] ?? [] as $m) {
        if ($m['role'] === 'user' && strpos($m['content'], '[Context only') === 0) {
            continue;
        }
        $messages[] = array_intersect_key($m, array_flip(['id', 'role', 'content', 'author', 'agent', 'created_at']));
    }
    return ['status' => $conversation['status'] ?? 'open', 'escalated' => !empty($conversation['escalated']), 'messages' => $messages];
}

/** An error the widget can show. Never passes on the API's own message. */
function truplexy_chat_error(string $code, string $request_id = ''): WP_REST_Response {
    $known = [
        'INVALID_REQUEST'    => [400, 'Messages must be 1–4000 characters.'],
        'RATE_LIMITED'       => [429, 'You are sending messages too quickly. Please wait a moment.'],
        'CHANNEL_DISABLED'   => [503, 'Chat is turned off right now.'],
        'TENANT_SUSPENDED'   => [503, 'Chat is turned off right now.'],
        'PLAN_LIMIT_REACHED' => [503, "The assistant can't reply right now. Please try again later."],
        'LLM_RATE_LIMITED'   => [429, 'The assistant is busy. Please try again in a moment.'],
        'LLM_TIMEOUT'        => [504, 'The reply took too long. Please try again.'],
        'TIMEOUT'            => [504, 'The reply took too long. Please try again.'],
        'NOT_CONFIGURED'     => [500, 'Chat is not set up yet.'],
    ];
    if (!isset($known[$code])) {
        $code = 'UPSTREAM_ERROR';
    }
    list($status, $message) = $known[$code] ?? [502, 'Chat is unavailable right now.'];
    $error = ['code' => $code, 'message' => $message];
    if ($request_id !== '') {
        $error['request_id'] = $request_id;
    }
    return new WP_REST_Response(['error' => $error], $status);
}

/** A simple per-visitor limit on messages; change it with the truplexy_chat_rate_limit filter. */
function truplexy_chat_allow(): bool {
    $limit = (int) apply_filters('truplexy_chat_rate_limit', 20);
    $key = 'truplexy_rl_' . md5($_SERVER['REMOTE_ADDR'] ?? '');
    $count = (int) get_transient($key);
    if ($limit > 0 && $count >= $limit) {
        return false;
    }
    set_transient($key, $count + 1, MINUTE_IN_SECONDS);
    return true;
}

/* -------------------------------------------------------------------------
 * The route the widget talks to: POST /wp-json/truplexy/v1/chat
 * ---------------------------------------------------------------------- */

add_action('rest_api_init', function () {
    register_rest_route('truplexy/v1', '/chat', [
        'methods'             => 'POST',
        'permission_callback' => '__return_true',
        'callback'            => 'truplexy_chat_route',
    ]);
});

function truplexy_chat_route(WP_REST_Request $request) {
    $in = $request->get_json_params();
    if (!is_array($in)) {
        return truplexy_chat_error('INVALID_REQUEST');
    }
    if (truplexy_chat_key() === '') {
        return truplexy_chat_error('NOT_CONFIGURED');
    }
    $action = (string) ($in['action'] ?? '');
    $conv = truplexy_chat_verify($in['session'] ?? null);

    try {
        switch ($action) {
            case 'message':
                $text = trim((string) ($in['text'] ?? ''));
                if ($text === '' || mb_strlen($text) > 4000 || strpos($text, '[Context only') === 0) {
                    return truplexy_chat_error('INVALID_REQUEST');
                }
                if (!truplexy_chat_allow()) {
                    return truplexy_chat_error('RATE_LIMITED');
                }
                if (!$conv) {
                    $conv = truplexy_chat_api('POST', '/conversations')['id'];
                    // REST requests from the widget carry no nonce, so read the login cookie directly. Used only for context.
                    $user_id = (int) wp_validate_auth_cookie('', 'logged_in');
                    $context = (string) apply_filters('truplexy_chat_context', '', $request, $user_id);
                    if ($context !== '') {
                        truplexy_chat_api('POST', "/conversations/$conv/messages", ['message' => mb_substr('[Context only] ' . $context, 0, 4000)]);
                    }
                }
                $r = truplexy_chat_api('POST', "/conversations/$conv/messages", ['message' => $text]);
                return [
                    'session' => truplexy_chat_sign($conv),
                    'message' => $r['message'] ?? null,
                    'reply'   => $r['reply'] ?? null,
                    'status'  => $r['status'] ?? 'answered',
                    'sources' => $r['sources'] ?? [],
                ];

            case 'history':
                if (!$conv) {
                    return ['session' => null];
                }
                return ['session' => truplexy_chat_sign($conv), 'conversation' => truplexy_chat_public(truplexy_chat_api('GET', "/conversations/$conv"))];

            case 'handoff':
                if (!$conv) {
                    return truplexy_chat_error('INVALID_REQUEST');
                }
                return ['session' => truplexy_chat_sign($conv), 'conversation' => truplexy_chat_public(truplexy_chat_api('POST', "/conversations/$conv/handoff"))];

            case 'live':
                if (!$conv) {
                    return new stdClass();
                }
                $live = truplexy_chat_api('POST', '/realtime/token', ['conversation_id' => $conv]);
                // Only the conversation's own topic: the bot topic carries every customer's messages.
                return (object) array_intersect_key($live, array_flip(['url', 'publishable_key', 'conversation_topic']));
        }
        return truplexy_chat_error('INVALID_REQUEST');
    } catch (Truplexy_Chat_Error $e) {
        if ($action === 'history' && $e->api_code === 'CONVERSATION_NOT_FOUND') {
            return ['session' => null];
        }
        if ($action === 'live') {
            return new stdClass();
        }
        error_log('[truplexy-chat] ' . $e->api_code . ($e->request_id ? ' request_id=' . $e->request_id : ''));
        return truplexy_chat_error($e->api_code, $e->request_id);
    }
}

/* -------------------------------------------------------------------------
 * The widget on every page.
 * ---------------------------------------------------------------------- */

add_action('wp_enqueue_scripts', function () {
    $s = truplexy_chat_settings();
    if (!$s['enabled'] || truplexy_chat_key() === '') {
        return;
    }
    // A copy of truplexy.min.js beside this file is used first; otherwise the CDN.
    $local = file_exists(plugin_dir_path(__FILE__) . 'truplexy.min.js');
    wp_enqueue_script('truplexy-chat', $local ? plugins_url('truplexy.min.js', __FILE__) : TRUPLEXY_CHAT_CDN, [], TRUPLEXY_CHAT_VERSION, true);
});

add_filter('script_loader_tag', function ($tag, $handle) {
    if ($handle !== 'truplexy-chat') {
        return $tag;
    }
    $s = truplexy_chat_settings();
    $attrs = ['data-endpoint' => rest_url('truplexy/v1/chat'), 'data-position' => $s['position'], 'data-theme' => $s['theme']];
    foreach (['heading', 'subtitle', 'greeting', 'accent'] as $key) {
        if ($s[$key] !== '') {
            $attrs['data-' . $key] = $s[$key];
        }
    }
    $html = '';
    foreach ($attrs as $name => $value) {
        $html .= ' ' . $name . '="' . esc_attr($value) . '"';
    }
    if ($s['show_sources']) {
        $html .= ' data-show-sources';
    }
    return str_replace(' src=', $html . ' defer src=', $tag);
}, 10, 2);

/* -------------------------------------------------------------------------
 * Settings → Truplexy Chat
 * ---------------------------------------------------------------------- */

add_action('admin_init', function () {
    register_setting('truplexy_chat', 'truplexy_chat', [
        'type'              => 'array',
        'sanitize_callback' => function ($in) {
            $in = is_array($in) ? $in : [];
            $old = truplexy_chat_settings();
            return [
                'enabled'      => empty($in['enabled']) ? '' : '1',
                // A blank key field keeps the saved key.
                'chat_key'     => !empty($in['chat_key']) ? sanitize_text_field($in['chat_key']) : $old['chat_key'],
                'heading'      => sanitize_text_field($in['heading'] ?? ''),
                'subtitle'     => sanitize_text_field($in['subtitle'] ?? ''),
                'greeting'     => sanitize_textarea_field($in['greeting'] ?? ''),
                'accent'       => sanitize_hex_color($in['accent'] ?? '') ?: '',
                'position'     => ($in['position'] ?? '') === 'left' ? 'left' : 'right',
                'theme'        => in_array($in['theme'] ?? '', ['light', 'dark', 'auto'], true) ? $in['theme'] : 'light',
                'show_sources' => empty($in['show_sources']) ? '' : '1',
            ];
        },
    ]);
});

add_action('admin_menu', function () {
    add_options_page('Truplexy Chat', 'Truplexy Chat', 'manage_options', 'truplexy-chat', 'truplexy_chat_settings_page');
});

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
    array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=truplexy-chat')) . '">Settings</a>');
    return $links;
});

function truplexy_chat_settings_page() {
    $s = truplexy_chat_settings();
    $field = function ($key) {
        return 'truplexy_chat[' . $key . ']';
    };
    ?>
    <div class="wrap">
        <h1>Truplexy Chat</h1>
        <form method="post" action="options.php">
            <?php settings_fields('truplexy_chat'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row">Chat</th>
                    <td><label><input type="checkbox" name="<?php echo esc_attr($field('enabled')); ?>" value="1" <?php checked($s['enabled'], '1'); ?>> Show the chat on my site</label></td>
                </tr>
                <tr>
                    <th scope="row"><label for="truplexy-key">Chat key</label></th>
                    <td>
                        <?php if (defined('TRUPLEXY_CHAT_KEY')) : ?>
                            <p>Set in <code>wp-config.php</code>.</p>
                        <?php else : ?>
                            <input id="truplexy-key" type="password" class="regular-text" autocomplete="off" name="<?php echo esc_attr($field('chat_key')); ?>" placeholder="<?php echo $s['chat_key'] ? 'Saved. Leave blank to keep it.' : 'tpx_...'; ?>">
                            <p class="description">Issue one in the Truplexy dashboard under Integrations → Website chat. Safer: <code>define('TRUPLEXY_CHAT_KEY', 'tpx_...');</code> in <code>wp-config.php</code>.</p>
                        <?php endif; ?>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="truplexy-heading">Heading</label></th>
                    <td><input id="truplexy-heading" class="regular-text" name="<?php echo esc_attr($field('heading')); ?>" value="<?php echo esc_attr($s['heading']); ?>" placeholder="Support"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="truplexy-subtitle">Subtitle</label></th>
                    <td><input id="truplexy-subtitle" class="regular-text" name="<?php echo esc_attr($field('subtitle')); ?>" value="<?php echo esc_attr($s['subtitle']); ?>" placeholder="Ask us anything. We usually reply in seconds."></td>
                </tr>
                <tr>
                    <th scope="row"><label for="truplexy-greeting">Greeting</label></th>
                    <td><textarea id="truplexy-greeting" class="large-text" rows="2" name="<?php echo esc_attr($field('greeting')); ?>" placeholder="Hi there! How can we help you today?"><?php echo esc_textarea($s['greeting']); ?></textarea></td>
                </tr>
                <tr>
                    <th scope="row"><label for="truplexy-accent">Accent colour</label></th>
                    <td><input id="truplexy-accent" type="color" name="<?php echo esc_attr($field('accent')); ?>" value="<?php echo esc_attr($s['accent'] ?: '#2338e6'); ?>"></td>
                </tr>
                <tr>
                    <th scope="row">Position</th>
                    <td>
                        <label><input type="radio" name="<?php echo esc_attr($field('position')); ?>" value="right" <?php checked($s['position'], 'right'); ?>> Bottom right</label>&nbsp;&nbsp;
                        <label><input type="radio" name="<?php echo esc_attr($field('position')); ?>" value="left" <?php checked($s['position'], 'left'); ?>> Bottom left</label>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="truplexy-theme">Theme</label></th>
                    <td>
                        <select id="truplexy-theme" name="<?php echo esc_attr($field('theme')); ?>">
                            <option value="light" <?php selected($s['theme'], 'light'); ?>>Light</option>
                            <option value="dark" <?php selected($s['theme'], 'dark'); ?>>Dark</option>
                            <option value="auto" <?php selected($s['theme'], 'auto'); ?>>Match the visitor's device</option>
                        </select>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Sources</th>
                    <td><label><input type="checkbox" name="<?php echo esc_attr($field('show_sources')); ?>" value="1" <?php checked($s['show_sources'], '1'); ?>> Link the articles an answer came from</label></td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}
`;

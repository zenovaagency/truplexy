import { indent, PUBLIC_API, type IntegrationCode, type LangPack } from './types';
import { WORDPRESS_PLUGIN } from './wordpress-plugin';

/** PHP 8.1+: one script per endpoint, curl for HTTP. */

const answerNow = `http_response_code(200);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();   // answer at once, keep working`;

/** The Truplexy Chat plugin: the widget's route, a settings page, and the widget on every page. */
const wordpress: IntegrationCode = { file: 'truplexy-chat.php', standalone: true, handler: WORDPRESS_PLUGIN };

/** Meta's Messenger and Instagram webhooks share a shape. */
const meta = (route: string, prefix: string, tokenEnv: string, skipEcho: boolean): IntegrationCode => ({
  file: `${route}.php`,
  handler: `<?php // ${route}.php — the webhook URL in Meta's dashboard
require __DIR__ . '/truplexy.php';

$body = json_decode(file_get_contents('php://input'), true);
${answerNow}

foreach ($body['entry'] ?? [] as $entry) {
    foreach ($entry['messaging'] ?? [] as $ev) {
        $text = $ev['message']['text'] ?? '';
        if ($text === ''${skipEcho ? " || !empty($ev['message']['is_echo'])" : ''}) continue;
        $r = ask('${prefix}:' . $ev['sender']['id'], $text);
        if ($r['reply']) send_meta($ev['sender']['id'], $r['reply']);
    }
}

function send_meta(string $id, string $text): void {
    post_json('https://graph.facebook.com/v21.0/me/messages?access_token=' . getenv('${tokenEnv}'),
        ['recipient' => ['id' => $id], 'message' => ['text' => $text]]);
}`,
  deliver: `post_json('https://graph.facebook.com/v21.0/me/messages?access_token=' . getenv('${tokenEnv}'),
    ['recipient' => ['id' => substr($thread, ${prefix.length + 1})], 'message' => ['text' => $text]]);`,
});

const pack: LangPack = {
  files: { server: 'chat.php', helper: 'truplexy.php', webhook: 'webhook.php', verify: 'verify.php' },

  helper: `<?php // truplexy.php — runs on your server only.
// TRUPLEXY_CHAT_KEY lives in your secret manager, never in a browser or app.
const TRUPLEXY_API = '${PUBLIC_API}';

/** Calls an API with a JSON body and returns the decoded answer. */
function post_json(string $url, ?array $body = null, array $headers = [], string $method = 'POST'): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
    ]);
    if ($method !== 'GET') curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body ?? new stdClass()));
    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($res === false || $status >= 300) throw new RuntimeException("$url answered $status: $res");
    return json_decode($res, true) ?? [];
}

function truplexy(string $path, ?array $body = null): array {
    return post_json(TRUPLEXY_API . $path, $body, ['Authorization: Bearer ' . getenv('TRUPLEXY_CHAT_KEY')]);
}

// One Truplexy conversation per customer thread. Use your database in production.
function threads(?array $save = null): array {
    $file = __DIR__ . '/threads.json';
    if ($save !== null) file_put_contents($file, json_encode($save), LOCK_EX);
    return $save ?? (json_decode(@file_get_contents($file) ?: '{}', true));
}

function thread_for(string $conversationId): ?string {
    return array_search($conversationId, threads(), true) ?: null;
}

function ask(string $thread, string $text): array {
    $threads = threads();
    $id = $threads[$thread] ??= truplexy('/conversations')['id'];
    threads($threads);
    $r = truplexy("/conversations/$id/messages", ['message' => mb_substr($text, 0, 4000)]);
    // "escalated" (a person has it) and "context" have no reply: send nothing.
    return ['reply' => $r['reply'], 'status' => $r['status'], 'conversationId' => $id];
}

function handoff(string $conversationId): array {
    return truplexy("/conversations/$conversationId/handoff");
}`,

  verify: `<?php // verify.php
function verify_truplexy(string $rawBody, string $header, string $secret): bool {
    $parts = [];
    foreach (explode(',', $header) as $part) {
        [$k, $v] = explode('=', $part, 2) + [1 => ''];
        $parts[$k] = $v;
    }
    $t = $parts['t'] ?? '';
    $expected = hash_hmac('sha256', "$t.$rawBody", $secret);
    return ctype_digit($t) && abs(time() - (int) $t) < 300 && hash_equals($expected, $parts['v1'] ?? '');
}`,

  receiver: ({ deliver, escalation }) => `<?php // webhook.php — your team acted in Truplexy → act on it here.
require __DIR__ . '/truplexy.php';
require __DIR__ . '/verify.php';

$raw = file_get_contents('php://input');
if (!verify_truplexy($raw, $_SERVER['HTTP_X_TRUPLEXY_SIGNATURE'] ?? '', getenv('TRUPLEXY_WEBHOOK_SECRET'))) {
    http_response_code(401);
    exit;
}
${answerNow}

$event = json_decode($raw, true);
$data = $event['data'];
$conversationId = $data['conversation_id'] ?? null;${
    deliver
      ? `
if ($event['type'] === 'message.created') {   // your team replied
    $text = $data['message']['content'];
    $agent = $data['message']['agent'] ?? 'Support';
    $thread = thread_for($conversationId);
    ${indent(deliver, '    ')}
}`
      : ''
  }${
    escalation
      ? `
if ($event['type'] === 'ticket.updated' && !empty($data['ticket']['escalated'])) {
    $ticket = $data['ticket'];
    ${indent(escalation, '    ')}
}`
      : ''
  }`,

  integrations: {
    web: {
      file: 'chat.php',
      standalone: true,
      handler: `<?php // chat.php — the route the Truplexy widget talks to. Set the widget's endpoint to this URL.
// PHP 8.1+ with curl. TRUPLEXY_CHAT_KEY lives in your server's environment, never in a page.
const TRUPLEXY_API = '${PUBLIC_API}';

/* Sessions: a signed conversation ID the visitor's browser keeps. No database needed. */
function session_secret(): string {
    return getenv('TRUPLEXY_SESSION_SECRET') ?: (string) getenv('TRUPLEXY_CHAT_KEY');
}

function b64(string $bytes): string {
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function unb64(string $text): string|false {
    return preg_match('/^[A-Za-z0-9_-]*$/', $text) ? base64_decode(strtr($text, '-_', '+/') . str_repeat('=', (4 - strlen($text) % 4) % 4), true) : false;
}

function sign_session(string $conv): string {
    $payload = $conv . '.' . time();
    return b64($payload) . '.' . b64(hash_hmac('sha256', $payload, session_secret(), true));
}

function verify_session(mixed $token): ?string {
    if (!is_string($token) || substr_count($token, '.') !== 1) return null;
    [$p, $s] = explode('.', $token);
    $payload = unb64($p);
    $signature = unb64($s);
    if ($payload === false || $signature === false) return null;
    if (!hash_equals(hash_hmac('sha256', $payload, session_secret(), true), $signature)) return null;
    if (!preg_match('/^(conv_[0-9a-f]{32})\\.(\\d{1,12})$/', $payload, $m)) return null;
    $age = time() - (int) $m[2];
    return ($age >= -300 && $age <= 30 * 86400) ? $m[1] : null;
}

class UpstreamError extends Exception {
    public function __construct(public string $apiCode, public string $requestId = '') {
        parent::__construct($apiCode);
    }
}

function api(string $method, string $path, ?array $body = null): array {
    $ch = curl_init(TRUPLEXY_API . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . getenv('TRUPLEXY_CHAT_KEY')],
    ]);
    if ($method !== 'GET') curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body ?? new stdClass()));
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $data = json_decode((string) $raw, true) ?? [];
    if ($raw === false || $status >= 300) {
        throw new UpstreamError($status === 401 ? 'NOT_CONFIGURED' : ($data['error']['code'] ?? 'UPSTREAM_ERROR'), $data['error']['request_id'] ?? '');
    }
    return $data;
}

/** What the visitor may see: no background "[Context only" messages. */
function public_conversation(array $conv): array {
    $messages = [];
    foreach ($conv['messages'] ?? [] as $m) {
        if ($m['role'] === 'user' && str_starts_with($m['content'], '[Context only')) continue;
        $messages[] = array_intersect_key($m, array_flip(['id', 'role', 'content', 'author', 'agent', 'created_at']));
    }
    return ['status' => $conv['status'], 'escalated' => $conv['escalated'], 'messages' => $messages];
}

/** Messages the visitor sees. Never pass on the API's own message. */
function fail(string $code, string $requestId = ''): never {
    $known = [
        'INVALID_REQUEST' => [400, 'Messages must be 1–4000 characters.'],
        'CHANNEL_DISABLED' => [503, 'Chat is turned off right now.'],
        'PLAN_LIMIT_REACHED' => [503, "The assistant can't reply right now. Please try again later."],
        'LLM_RATE_LIMITED' => [429, 'The assistant is busy. Please try again in a moment.'],
        'LLM_TIMEOUT' => [504, 'The reply took too long. Please try again.'],
    ];
    if (!isset($known[$code])) $code = 'UPSTREAM_ERROR';
    [$status, $message] = $known[$code] ?? [502, 'Chat is unavailable right now.'];
    http_response_code($status);
    exit(json_encode(['error' => ['code' => $code, 'message' => $message, 'request_id' => $requestId]]));
}

header('Content-Type: application/json');
$in = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $in['action'] ?? '';
$conv = verify_session($in['session'] ?? null);

try {
    switch ($action) {
        case 'message':
            $text = trim((string) ($in['text'] ?? ''));
            if ($text === '' || mb_strlen($text) > 4000 || str_starts_with($text, '[Context only')) fail('INVALID_REQUEST');
            $conv ??= api('POST', '/conversations')['id'];
            $r = api('POST', "/conversations/$conv/messages", ['message' => $text]);
            echo json_encode(['session' => sign_session($conv), 'message' => $r['message'], 'reply' => $r['reply'], 'status' => $r['status'], 'sources' => $r['sources'] ?? []]);
            break;
        case 'history':
            echo json_encode($conv ? ['session' => sign_session($conv), 'conversation' => public_conversation(api('GET', "/conversations/$conv"))] : ['session' => null]);
            break;
        case 'handoff':
            if (!$conv) fail('INVALID_REQUEST');
            echo json_encode(['session' => sign_session($conv), 'conversation' => public_conversation(api('POST', "/conversations/$conv/handoff"))]);
            break;
        case 'profile':
            // The business and bot name and picture; the widget shows them in its header.
            $p = api('GET', '/profile');
            echo json_encode([
                'business' => ['name' => $p['business']['name'] ?? null, 'logo_url' => $p['business']['logo_url'] ?? null],
                'bot' => ['id' => $p['bot']['id'] ?? null, 'name' => $p['bot']['name'] ?? null, 'avatar_url' => $p['bot']['avatar_url'] ?? null],
            ]);
            break;
        case 'live':
            // Only the conversation's own topic: bot_topic carries every customer's messages.
            $live = $conv ? api('POST', '/realtime/token', ['conversation_id' => $conv]) : [];
            echo json_encode((object) array_intersect_key($live, array_flip(['url', 'publishable_key', 'conversation_topic'])));
            break;
        default:
            fail('INVALID_REQUEST');
    }
} catch (UpstreamError $e) {
    if ($action === 'history' && $e->apiCode === 'CONVERSATION_NOT_FOUND') exit(json_encode(['session' => null]));
    if ($action === 'live') exit('{}');
    fail($e->apiCode, $e->requestId);
}`,
    },

    whatsapp: {
      file: 'whatsapp.php',
      handler: `<?php // whatsapp.php — the webhook URL in Meta's dashboard
require __DIR__ . '/truplexy.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {   // Meta's verification handshake (PHP turns "hub.x" into "hub_x")
    if (($_GET['hub_verify_token'] ?? '') !== getenv('WA_VERIFY_TOKEN')) {
        http_response_code(403);
        exit;
    }
    exit($_GET['hub_challenge']);
}

$body = json_decode(file_get_contents('php://input'), true);
${answerNow}

foreach ($body['entry'][0]['changes'][0]['value']['messages'] ?? [] as $msg) {
    if ($msg['type'] !== 'text') continue;
    $r = ask('wa:' . $msg['from'], $msg['text']['body']);
    if ($r['reply']) send_whatsapp($msg['from'], $r['reply']);
}

function send_whatsapp(string $to, string $body): void {
    post_json('https://graph.facebook.com/v21.0/' . getenv('WA_PHONE_ID') . '/messages',
        ['messaging_product' => 'whatsapp', 'to' => $to, 'text' => ['body' => $body]],
        ['Authorization: Bearer ' . getenv('WA_TOKEN')]);
}`,
      deliver: `post_json('https://graph.facebook.com/v21.0/' . getenv('WA_PHONE_ID') . '/messages',
    ['messaging_product' => 'whatsapp', 'to' => substr($thread, 3), 'text' => ['body' => $text]],
    ['Authorization: Bearer ' . getenv('WA_TOKEN')]);`,
    },

    telegram: {
      file: 'telegram.php',
      handler: `<?php // telegram.php — the URL you gave setWebhook
require __DIR__ . '/truplexy.php';

$update = json_decode(file_get_contents('php://input'), true);
${answerNow}

$msg = $update['message'] ?? null;
if (!empty($msg['text'])) {
    $r = ask('tg:' . $msg['chat']['id'], $msg['text']);
    if ($r['reply']) {
        post_json('https://api.telegram.org/bot' . getenv('TELEGRAM_TOKEN') . '/sendMessage',
            ['chat_id' => $msg['chat']['id'], 'text' => $r['reply']]);
    }
}`,
      deliver: `post_json('https://api.telegram.org/bot' . getenv('TELEGRAM_TOKEN') . '/sendMessage',
    ['chat_id' => substr($thread, 3), 'text' => "$agent: $text"]);`,
    },

    messenger: meta('messenger', 'fb', 'FB_PAGE_TOKEN', false),
    instagram: meta('instagram', 'ig', 'IG_PAGE_TOKEN', true),

    email: {
      file: 'inbound-email.php',
      handler: `<?php // inbound-email.php — Postmark's inbound webhook
require __DIR__ . '/truplexy.php';

$mail = json_decode(file_get_contents('php://input'), true);
${answerNow}

$r = ask('mail:' . $mail['From'], "{$mail['Subject']}\\n\\n{$mail['TextBody']}");
if ($r['reply']) send_email($mail['From'], 'Re: ' . $mail['Subject'], $r['reply'], $mail['MessageID']);`,
      deliver: `send_email(substr($thread, 5), 'Re: your request', $text);`,
    },

    shopify: {
      file: 'shopify-chat.php',
      handler: `<?php // App Proxy: https://{shop}/apps/support/chat → https://your-server.com/shopify-chat.php
require __DIR__ . '/truplexy.php';

if (!valid_proxy_signature($_SERVER['QUERY_STRING'] ?? '', getenv('SHOPIFY_SECRET'))) {
    http_response_code(401);
    exit;
}
$in = json_decode(file_get_contents('php://input'), true);
$customer = ($_GET['logged_in_customer_id'] ?? '') ?: $in['visitorId'];
header('Content-Type: application/json');
echo json_encode(ask("shop:{$_GET['shop']}:$customer", $in['text']));

// Shopify signs proxy requests: sorted "key=value" pairs, joined without separators.
function valid_proxy_signature(string $query, string $secret): bool {
    $pairs = [];
    $signature = '';
    foreach (explode('&', $query) as $part) {
        [$k, $v] = array_map('urldecode', explode('=', $part, 2) + [1 => '']);
        if ($k === 'signature') $signature = $v;
        else $pairs[$k][] = $v;
    }
    ksort($pairs);
    $message = implode('', array_map(fn ($k) => "$k=" . implode(',', $pairs[$k]), array_keys($pairs)));
    return hash_equals(hash_hmac('sha256', $message, $secret), $signature);
}`,
      deliver: `// Keep the reply for the storefront widget, which polls for it.
store_reply($thread, ['from' => $agent, 'text' => $text]);`,
    },

    woocommerce: wordpress,
    wordpress,

    hubspot: {
      file: 'hubspot.php',
      handler: `<?php // hubspot.php — your app's webhook URL
require __DIR__ . '/truplexy.php';

const HUBSPOT_THREADS = 'https://api.hubapi.com/conversations/v3/conversations/threads/';
$auth = ['Authorization: Bearer ' . getenv('HUBSPOT_TOKEN')];

$events = json_decode(file_get_contents('php://input'), true);
${answerNow}

foreach ($events as $e) {
    $msg = post_json(HUBSPOT_THREADS . "{$e['objectId']}/messages/{$e['messageId']}", null, $auth, 'GET');
    if ($msg['direction'] !== 'INCOMING') continue;
    save_last_channel($e['objectId'], $msg);   // so your team's replies use the same channel
    $r = ask('hs:' . $e['objectId'], $msg['text']);
    if ($r['reply']) {
        post_json(HUBSPOT_THREADS . "{$e['objectId']}/messages", [
            'type' => 'MESSAGE', 'text' => $r['reply'], 'senderActorId' => getenv('HS_ACTOR'),
            'channelId' => $msg['channelId'], 'channelAccountId' => $msg['channelAccountId'],
        ], $auth);
    }
}`,
      deliver: `$threadId = substr($thread, 3);
$channel = last_channel($threadId);
post_json("https://api.hubapi.com/conversations/v3/conversations/threads/$threadId/messages", [
    'type' => 'MESSAGE', 'text' => $text, 'senderActorId' => getenv('HS_ACTOR'),
    'channelId' => $channel['channelId'], 'channelAccountId' => $channel['channelAccountId'],
], ['Authorization: Bearer ' . getenv('HUBSPOT_TOKEN')]);`,
    },

    zendesk: {
      file: 'zendesk.php',
      handler: `<?php // zendesk.php — the webhook your "Ticket is created" trigger calls
require __DIR__ . '/truplexy.php';

$in = json_decode(file_get_contents('php://input'), true);   // fields from your trigger's JSON body
${answerNow}

$r = ask('zd:' . $in['ticket_id'], $in['description']);
if ($r['reply'] && $r['status'] === 'answered') zendesk_comment($in['ticket_id'], $r['reply']);

// Keep this in a shared file: the webhook uses it too.
function zendesk_comment($ticketId, string $text): void {
    $auth = base64_encode(getenv('ZENDESK_EMAIL') . '/token:' . getenv('ZENDESK_TOKEN'));
    post_json('https://' . getenv('ZENDESK_SUBDOMAIN') . ".zendesk.com/api/v2/tickets/$ticketId",
        ['ticket' => ['comment' => ['body' => $text, 'public' => true]]], ["Authorization: Basic $auth"], 'PUT');
}`,
      deliver: `zendesk_comment(substr($thread, 3), $text);`,
    },

    api: {
      file: 'example.php',
      handler: `<?php
require __DIR__ . '/truplexy.php';

$conv = truplexy('/conversations');
$r = truplexy("/conversations/{$conv['id']}/messages", ['message' => 'Where is my order?']);
echo $r['status'], ': ', $r['reply'], PHP_EOL;`,
      deliver: `// Deliver the reply to the customer's thread on your platform.
deliver($thread, $text, $agent);`,
    },
  },
};

export default pack;

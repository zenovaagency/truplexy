import type { Channel } from '@/lib/api/types';
import type { Integration } from './catalog';
import { CHAT_API_ENDPOINTS, CUSTOMER_RULES } from './snippets/chat-api';
import { IMAGE_CURL, IMAGE_ERRORS, IMAGE_LIMITS, IMAGE_SNIPPETS } from './snippets/images';
import { IMAGE_GUIDE_HIDDEN } from './ImageGuide';
import { LANG_LABEL, PUBLIC_API, WEB_SDK_DOCS, type IntegrationCode, type Lang, type LangPack } from './snippets/types';

const fence = (code: string, lang = '') => `\`\`\`${lang}\n${code.replace(/\s+$/, '')}\n\`\`\``;

/**
 * A guide as one Markdown document, to paste into an AI assistant that will write
 * the integration. It holds code and rules, never a key or secret.
 */
export function buildLlmGuide(o: {
  integration: Integration;
  botName: string;
  channels: Channel[];
  lang?: Lang;
  pack?: LangPack;
  code?: IntegrationCode;
  /** The webhook receiver for the language, when the integration has one. */
  hook?: string | null;
}): string {
  const { integration: i, pack, code, hook } = o;
  const out: string[] = [];
  const add = (...s: string[]) => out.push(s.join('\n\n'));

  add(`# Connect ${i.name} to Truplexy`);
  add(
    `Task: write the server code that connects ${i.widget ? 'a website or plugin' : i.name} to the Truplexy assistant "${o.botName}". ` +
      (i.widget
        ? "The Truplexy widget sends each message to one route on the customer's server, which asks Truplexy with a chat key. Team replies from Tickets show up in the widget by themselves."
        : i.teamSide
          ? 'Escalations are posted to the team, and their replies go back to the customer.'
          : `${i.name} sends each message to the customer's server, which asks Truplexy with a chat key and sends the reply back. When the team replies from Tickets, Truplexy signs a webhook so the server can deliver the message.`),
  );

  add(
    '## Rules',
    `- API base URL: ${PUBLIC_API}`,
    '- Call it from the server only, with `Authorization: Bearer $TRUPLEXY_CHAT_KEY`. Read the key from the environment. Never put it in a website, mobile app or theme file.',
    '- Keep the platform\'s own token (for example a bot token) in the environment too. Never hard-code or log secrets.',
    ...(i.teamSide || i.widget ? [] : ['- Verify the `X-Truplexy-Signature` header on every webhook (`TRUPLEXY_WEBHOOK_SECRET`), on the raw body, and answer 2xx within 2.5 seconds.']),
  );

  if (i.channelType) {
    add(
      `## Truplexy channels for ${i.name}`,
      o.channels.length
        ? o.channels.map((c) => `- ${c.name}${c.external_id ? ` (${c.external_id})` : ''}, id \`${c.id}\`${c.active ? '' : ', off'}`).join('\n')
        : '- None yet. Add one under Integrations → Your channels, then issue a chat key bound to it.',
      'A key bound to a channel marks every conversation it starts with that channel. `channel_id` on `POST /conversations` overrides it.',
    );
  }

  if (i.steps?.length) add(`## Setup on ${i.widget ? 'your site' : i.name}`, i.steps.map((s, n) => `${n + 1}. ${s}`).join('\n'));

  if (!i.teamSide) {
    add(
      '## Identify the customer before starting a conversation',
      CUSTOMER_RULES.map((r) => `- ${r}`).join('\n'),
      "Use the sender's platform user ID as a contact. Keep chat, thread and ticket IDs so replies can be routed back. Use durable storage for those mappings in production.",
    );
  }

  add('## Chat API', CHAT_API_ENDPOINTS.map(([method, path, , what]) => `- \`${method} ${path}\`: ${what}`).join('\n'));

  const lang = o.lang && LANG_LABEL[o.lang];
  if (code && pack) {
    add(`## Code (${lang})`, fence(code.handler, o.lang === 'node' ? 'js' : o.lang), '### Chat API helper');
    if (!code.standalone) add(fence(pack.helper, o.lang === 'node' ? 'js' : o.lang));
    if (pack.note) add(pack.note);
    if (hook) add(`## Webhook: deliver the team's replies (${lang})`, fence(hook, o.lang), '### Signature check', fence(pack.verify, o.lang));
  } else if (i.id === 'web') {
    add(`## Website chat`, `The widget, its options and the server route are documented at ${WEB_SDK_DOCS}.`);
  }

  // Not for the website widget, which has no attach button.
  if (!i.teamSide && !i.widget && !IMAGE_GUIDE_HIDDEN) {
    add(
      '## Sending pictures (optional)',
      'A customer can attach 1 to 3 pictures to a message and the assistant reads them. Only add this if the platform lets customers send pictures. Each picture takes three steps:',
      [
        '1. Register it: `POST /conversations/{id}/attachments` with `{filename, content_type, size, sha256}`. The answer has a presigned `url`, the `headers` to send and an attachment `id`.',
        '2. `PUT` the raw file to that `url` within 15 minutes, with exactly those headers. This goes to storage, not to Truplexy: never send the chat key with it.',
        '3. Send the message with `attachments: ["att_…"]` (1 to 3 IDs). `message` may then be empty, but text gives better answers.',
      ].join('\n'),
      'Before offering the feature, read `attachments` from `GET /profile` on the server: absent means the API does not serve pictures, and `enabled: false` means this business cannot use them. Show the attach option only when `attachments.enabled` is true, and take the limits from there.',
      IMAGE_LIMITS.map(([what, detail]) => `- ${what}: ${detail}`).join('\n'),
      'Errors happen before anything is stored or paid for. Match on `error.code`, never the text. Do not retry `INVALID_IMAGE`, `UNSUPPORTED_IMAGE_TYPE` or `IMAGE_TOO_LARGE`; retry a failed `PUT` (a network error or a 5xx) up to twice.',
      IMAGE_ERRORS.map(([name, status, what]) => `- \`${name}\` (${status}): ${what}`).join('\n'),
    );
    if (o.lang && code && pack) {
      add(`### Picture upload (${LANG_LABEL[o.lang]})`, 'Builds on the Chat API helper above.', fence(IMAGE_SNIPPETS[o.lang].code, o.lang === 'node' ? 'js' : o.lang));
    } else {
      add('### Picture upload (curl)', fence(IMAGE_CURL, 'sh'));
    }
  }

  add(
    '## Check it works',
    [
      `- Send a message on ${i.widget ? 'the site' : i.name}. The reply should arrive within a few seconds.`,
      ...(i.teamSide ? [] : ['- Open Customers and check the contact and conversation link.']),
      '- Ask for a person. The conversation should show under Tickets → Handoffs.',
      `- Take it over and reply from the ticket. The reply should appear on ${i.widget ? 'the site' : i.name}.`,
    ].join('\n'),
  );

  return out.join('\n\n').trim() + '\n';
}

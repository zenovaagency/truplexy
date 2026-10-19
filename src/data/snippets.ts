/**
 * Server code for the channel guides. It is not written here: the dashboard's
 * Integrations guides own the snippets (one pack per language), and these
 * helpers only arrange them into tabs for the public docs, so a fix made once
 * shows up in both places.
 */
import type { Tab } from '../components/docs/CodeTabs.astro';
import { LANG_LABEL, type Lang, type LangPack } from '../../dashboard/src/features/integrations/snippets/types';
import node from '../../dashboard/src/features/integrations/snippets/node';
import python from '../../dashboard/src/features/integrations/snippets/python';
import php from '../../dashboard/src/features/integrations/snippets/php';
import go from '../../dashboard/src/features/integrations/snippets/go';
import java from '../../dashboard/src/features/integrations/snippets/java';
import csharp from '../../dashboard/src/features/integrations/snippets/csharp';
import ruby from '../../dashboard/src/features/integrations/snippets/ruby';
import { IMAGE_CURL, IMAGE_SNIPPETS } from '../../dashboard/src/features/integrations/snippets/images';
import type { ChannelId } from './channels';

/** Most common first, like the dashboard. */
const PACKS: [Lang, LangPack][] = [
  ['node', node],
  ['python', python],
  ['php', php],
  ['go', go],
  ['java', java],
  ['csharp', csharp],
  ['ruby', ruby],
];

/** Channels that share another channel's code. */
const CODE_ID: Partial<Record<ChannelId, string>> = { custom: 'api', webhooks: 'api' };
const codeId = (id: ChannelId) => CODE_ID[id] ?? id;

/** Languages that have a guide for this channel. */
export function langsFor(id: ChannelId): Lang[] {
  return PACKS.filter(([, pack]) => pack.integrations[codeId(id)]).map(([lang]) => lang);
}

/** The server code to add: the channel's handler plus the chat-API helper it calls. */
export function codeTabs(id: ChannelId): Tab[] {
  return PACKS.flatMap(([lang, pack]) => {
    const code = pack.integrations[codeId(id)];
    if (!code) return [];
    return [
      {
        id: lang,
        label: LANG_LABEL[lang],
        files: [
          { name: code.file ?? pack.files.server, code: code.handler },
          ...(code.standalone ? [] : [{ name: pack.files.helper, code: pack.helper }]),
        ],
        note: pack.note,
      },
    ];
  });
}

/**
 * The webhook receiver (delivers the team's replies, or posts escalations)
 * and the signature check it uses. Empty when the channel needs no receiver.
 */
export function webhookTabs(id: ChannelId): Tab[] {
  return PACKS.flatMap(([lang, pack]) => {
    const code = pack.integrations[codeId(id)];
    if (!code) return [];
    const receiver = code.receiver ?? (code.deliver || code.escalation ? pack.receiver(code) : null);
    if (!receiver) return [];
    return [
      {
        id: lang,
        label: LANG_LABEL[lang],
        files: [
          { name: code.receiver ? `${code.file ?? pack.files.server}` : pack.files.webhook, code: receiver },
          { name: pack.files.verify, code: pack.verify },
        ],
      },
    ];
  });
}

/** Signature verification alone, per language, for the webhooks guide. */
export function verifyTabs(): Tab[] {
  return PACKS.map(([lang, pack]) => ({
    id: lang,
    label: LANG_LABEL[lang],
    files: [{ name: pack.files.verify, code: pack.verify }],
  }));
}

/**
 * "Send pictures" for the chat API guide: one complete script per language
 * (each builds on that language's helper file, shown in the guide's server-code
 * step) plus curl. They are plain HTTP: no SDK method is needed.
 */
export function pictureTabs(): Tab[] {
  return [
    ...PACKS.map(([lang]) => ({
      id: lang,
      label: LANG_LABEL[lang],
      files: [{ name: IMAGE_SNIPPETS[lang].file, code: IMAGE_SNIPPETS[lang].code }],
    })),
    { id: 'curl', label: 'curl', files: [{ name: 'curl', code: IMAGE_CURL }] },
  ];
}

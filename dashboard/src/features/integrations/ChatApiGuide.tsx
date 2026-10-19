import { CodeBlock } from '@/components/ui';
import { ALL_LANGS, LangPicker, useLang, useLangPack } from './languages';
import { PUBLIC_API } from './snippets/types';
import { CHAT_API_ENDPOINTS, CUSTOMER_RULES } from './snippets/chat-api';
import { SendingPictures } from './ImageGuide';

export function ChatApiQuickStart() {
  const [lang, setLang] = useLang(ALL_LANGS);
  const pack = useLangPack(lang);
  const code = pack.data?.integrations.api;
  const curl = `# Run on your server. Copy each returned id into the next command.
curl --fail-with-body -X PUT ${PUBLIC_API}/customer \\
  -H "Authorization: Bearer $TRUPLEXY_CHAT_KEY" -H "Content-Type: application/json" \\
  -d '{"contacts":[{"type":"app","value":"user-42"}]}'

curl --fail-with-body -X POST ${PUBLIC_API}/conversations \\
  -H "Authorization: Bearer $TRUPLEXY_CHAT_KEY" -H "Content-Type: application/json" \\
  -d '{"customer_id":"<customer id from above>"}'

curl --fail-with-body -X POST ${PUBLIC_API}/conversations/$CONVERSATION_ID/messages \\
  -H "Authorization: Bearer $TRUPLEXY_CHAT_KEY" -H "Content-Type: application/json" \\
  -d '{"message":"Where is my order?"}'`;
  return <div className="grid gap-3">
    <LangPicker langs={ALL_LANGS} value={lang} onChange={setLang} />
    {pack.data && code ? <CodeBlock key={lang} samples={[
      { label: code.file ?? pack.data.files.server, code: code.handler },
      ...(code.standalone ? [] : [{ label: pack.data.files.helper, code: pack.data.helper }]),
      { label: 'curl', code: curl },
    ]} /> : <p>{pack.isError ? 'Examples could not load. Reload to try again.' : 'Loading examples…'}</p>}
    {pack.data?.note && <p className="text-xs text-ink-muted">{pack.data.note}</p>}
  </div>;
}

export function CustomerGuide() {
  return <div className="grid gap-3 text-[0.8125rem] text-ink-muted">
    <p className="font-semibold text-ink">Identify the customer before starting the conversation</p>
    <ul className="list-disc space-y-2 pl-5">{CUSTOMER_RULES.map(rule => <li key={rule}>{rule}</li>)}</ul>
    <p>Use the sender’s platform user ID as a contact. Keep chat, thread, and ticket IDs for reply routing. The examples’ in-memory maps need durable storage in production. A returning customer can have multiple conversations; identification does not grant access to earlier chats.</p>
    <p>The website form collects a self-reported name and email. Use the server’s customer resolver for authenticated contacts and metadata. When identity is supplied, a linking error stops the new chat. Anonymous chat remains available when no identity is supplied.</p>
  </div>;
}

export function ChatApiReference() {
  return <div className="grid gap-4">
    <CustomerGuide />
    <div className="overflow-x-auto"><table className="table"><thead><tr><th>Endpoint</th><th>Server SDK</th><th>Behavior</th></tr></thead><tbody>
      {CHAT_API_ENDPOINTS.map(([method, path, sdk, description]) => <tr key={path + method}><td><code>{method} {path}</code></td><td><code>{sdk}</code></td><td>{description}</td></tr>)}
    </tbody></table></div>
    <p className="text-[0.8125rem] text-ink-muted">Chat keys reach chat API conversations for their bot. A channel-bound key supplies the default channel; channel_id can override it. Disabled channels return CHANNEL_DISABLED. These are server calls without scope headers. Customer management under /customers requires a staff token and scope; it is separate from the chat API.</p>
    <p className="text-[0.8125rem] text-ink-muted">Agent replies accept content (1–8000 characters), author (up to 64), external_id (up to 128), and escalate (default false). Integration replies and resume actions are not echoed to the webhook. Deliver the platform reply through your own routing.</p>
    <p className="text-[0.8125rem] text-ink-muted">Realtime includes conversation messages and ticket changes. Webhooks report staff replies and ticket changes, exclude notes and integration actions, require raw-body HMAC verification, and must be acknowledged within 2.5 seconds. Deduplicate X-Truplexy-Delivery: a failed delivery can be retried once. Only REALTIME_NOT_CONFIGURED triggers polling fallback.</p>
    <SendingPictures />
  </div>;
}

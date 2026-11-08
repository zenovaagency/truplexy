import { useEffect, useState } from 'react';
import { Bot as BotIcon, KeyRound } from 'lucide-react';
import { useBots, useCreateApiKey, useTenant } from '@/lib/api/endpoints/business';
import { useChannels } from '@/lib/api/endpoints/channels';
import type { AgentAccess, ApiKey, ApiKeyKind } from '@/lib/api/types';
import { ACCESS_HINT, ACCESS_LABEL } from '@/lib/agents';
import { useScopeCtx } from '@/lib/session/scope-context';
import { isShopifyChannel } from '@/lib/shopify';
import { Button, Callout, Dialog, Field, Input, SecretOnce, Segmented, Select } from '@/components/ui';
import { ConnectAgent } from './ConnectAgent';

/**
 * Whether the API issues AI agents' keys (it reports `limits.mcp`), and whether the plan includes them.
 * Undefined while the business loads.
 */
export function useAgentKeys(): { offered: boolean; included: boolean } | undefined {
  const tenant = useTenant();
  if (!tenant.data) return undefined;
  const mcp = tenant.data.limits.mcp;
  return { offered: mcp !== undefined, included: Boolean(mcp) };
}

/** Name + bot + channel → the key, shown once. Used by API keys and the integration guides. */
export function IssueKeyForm({
  defaultName = '',
  defaultChannel = '',
  defaultKind = 'chat',
  onIssued,
  compact,
}: {
  defaultName?: string;
  /** A channel of the current bot to bind the key to. */
  defaultChannel?: string;
  /** The kind of key to start with; the full form lets people switch when the API issues agent keys. */
  defaultKind?: ApiKeyKind;
  onIssued?: (k: ApiKey) => void;
  compact?: boolean;
}) {
  const { scope } = useScopeCtx();
  const bots = useBots();
  const create = useCreateApiKey();
  const agentKeys = useAgentKeys();
  const [kind, setKind] = useState<ApiKeyKind>(defaultKind);
  const [access, setAccess] = useState<AgentAccess>('read');
  const agent = kind === 'agent';
  const blocked = agent && agentKeys !== undefined && !agentKeys.included;
  const [name, setName] = useState(defaultName);
  const [bot, setBot] = useState(scope.bot);
  const [channel, setChannel] = useState(defaultChannel);
  const [issued, setIssued] = useState<ApiKey | null>(null);
  const channels = useChannels(bot);

  useEffect(() => setName(defaultName), [defaultName]);
  useEffect(() => setChannel(bot === scope.bot ? defaultChannel : ''), [defaultChannel, bot, scope.bot]);

  if (issued?.key) {
    return (
      <div className="grid gap-3">
        <SecretOnce value={issued.key} title={`“${issued.name}” is ready. Copy the key now.`} />
        {issued.kind === 'agent' && <ConnectAgent apiKey={issued.key} />}
        <Button size="xs" variant="ghost" className="justify-self-start" onClick={() => setIssued(null)}>
          Issue another key
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || blocked) return;
        const body = agent ? { name: name.trim(), bot_id: bot, kind, access } : { name: name.trim(), bot_id: bot, channel_id: channel || undefined };
        create.mutate(body, { onSuccess: (k) => (setIssued(k), onIssued?.(k)) });
      }}
      className={compact ? 'flex flex-wrap items-end gap-2' : 'grid gap-4'}
    >
      {!compact && agentKeys?.offered && (
        <Field label="Key for">
          <Segmented
            stretch
            value={kind}
            onChange={setKind}
            options={[
              { value: 'chat', label: 'Chat API' },
              { value: 'agent', label: 'AI agent (MCP)' },
            ]}
          />
        </Field>
      )}
      <Field
        label="Key name"
        hint={
          compact
            ? undefined
            : agent
              ? 'Name the agent, e.g. “Claude · Support lead”. Its replies to customers are signed with this name.'
              : 'Say where it is used, e.g. “Telegram · Production”, so it can be revoked safely later.'
        }
        className={compact ? 'min-w-[200px] flex-1' : undefined}
      >
        <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder={agent ? 'Claude · Support lead' : 'Telegram · Production'} size={compact ? 'sm' : 'md'} />
      </Field>
      <Field label="Bot" className={compact ? 'w-44' : undefined}>
        <Select size={compact ? 'sm' : 'md'} value={bot} onChange={(e) => setBot(e.target.value)} options={(bots.data ?? [{ id: scope.bot, name: scope.bot }]).map((b) => ({ value: b.id, label: b.name }))} />
      </Field>
      {agent ? (
        <Field label="Access" hint={ACCESS_HINT[access]}>
          <Segmented stretch value={access} onChange={setAccess} options={(['read', 'write'] as const).map((a) => ({ value: a, label: ACCESS_LABEL[a] }))} />
        </Field>
      ) : (
      <Field
        label="Channel"
        optional
        hint={compact ? undefined : "Marks the conversations and tickets it starts with the channel, and stops working while the channel is off. It can't be changed later."}
        className={compact ? 'w-48' : undefined}
      >
        <Select
          size={compact ? 'sm' : 'md'}
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="No channel"
          // Connected channels run on Truplexy's own app and take no key.
          options={(channels.data ?? []).filter((c) => !isShopifyChannel(c)).map((c) => ({ value: c.id, label: c.active ? `${c.name} · ${c.type_label}` : `${c.name} (off)`, disabled: !c.active }))}
        />
      </Field>
      )}
      {blocked && (
        <Callout tone="accent" title="AI agent keys come with Pro">
          Upgrade on the Plan page to let Claude, Cursor and other AI agents work this inbox through MCP.
        </Callout>
      )}
      <Button type="submit" size={compact ? 'sm' : 'sm'} variant="accent" loading={create.isPending} disabled={!name.trim() || blocked} leading={agent ? <BotIcon /> : <KeyRound />}>
        {agent ? 'Issue agent key' : 'Issue key'}
      </Button>
    </form>
  );
}

export function IssueKeyDialog({ open, onOpenChange, defaultKind = 'chat' }: { open: boolean; onOpenChange: (o: boolean) => void; defaultKind?: ApiKeyKind }) {
  const agentKeys = useAgentKeys();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (open) setDone(false);
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={agentKeys?.offered ? 'Issue an API key' : 'Issue a chat API key'}
      description={
        agentKeys?.offered
          ? "A chat key is for your integration's server and reaches only the conversations it starts. An AI agent key lets Claude, Cursor or another MCP client work one bot's inbox."
          : "For your integration's server. It can reach only conversations it starts for one bot."
      }
      footer={done && <Button variant="accent" onClick={() => onOpenChange(false)}>I've stored it safely</Button>}
    >
      <IssueKeyForm defaultKind={defaultKind} onIssued={() => setDone(true)} />
    </Dialog>
  );
}

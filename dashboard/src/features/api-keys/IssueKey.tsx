import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useBots, useCreateApiKey } from '@/lib/api/endpoints/business';
import { useChannels } from '@/lib/api/endpoints/channels';
import type { ApiKey } from '@/lib/api/types';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Button, Dialog, Field, Input, SecretOnce, Select } from '@/components/ui';

/** Name + bot + channel → the key, shown once. Used by API keys and the integration guides. */
export function IssueKeyForm({
  defaultName = '',
  defaultChannel = '',
  onIssued,
  compact,
}: {
  defaultName?: string;
  /** A channel of the current bot to bind the key to. */
  defaultChannel?: string;
  onIssued?: (k: ApiKey) => void;
  compact?: boolean;
}) {
  const { scope } = useScopeCtx();
  const bots = useBots();
  const create = useCreateApiKey();
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
        if (!name.trim()) return;
        create.mutate({ name: name.trim(), bot_id: bot, channel_id: channel || undefined }, { onSuccess: (k) => (setIssued(k), onIssued?.(k)) });
      }}
      className={compact ? 'flex flex-wrap items-end gap-2' : 'grid gap-4'}
    >
      <Field label="Key name" hint={compact ? undefined : 'Say where it is used, e.g. “Telegram · Production”, so it can be revoked safely later.'} className={compact ? 'min-w-[200px] flex-1' : undefined}>
        <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Telegram · Production" size={compact ? 'sm' : 'md'} />
      </Field>
      <Field label="Bot" className={compact ? 'w-44' : undefined}>
        <Select size={compact ? 'sm' : 'md'} value={bot} onChange={(e) => setBot(e.target.value)} options={(bots.data ?? [{ id: scope.bot, name: scope.bot }]).map((b) => ({ value: b.id, label: b.name }))} />
      </Field>
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
          options={(channels.data ?? []).map((c) => ({ value: c.id, label: c.active ? `${c.name} · ${c.type_label}` : `${c.name} (off)`, disabled: !c.active }))}
        />
      </Field>
      <Button type="submit" size={compact ? 'sm' : 'sm'} variant="accent" loading={create.isPending} disabled={!name.trim()} leading={<KeyRound />}>
        Issue key
      </Button>
    </form>
  );
}

export function IssueKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (open) setDone(false);
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Issue a chat API key"
      description="For your integration's server. It can reach only conversations it starts for one bot."
      footer={done && <Button variant="accent" onClick={() => onOpenChange(false)}>I've stored it safely</Button>}
    >
      <IssueKeyForm onIssued={() => setDone(true)} />
    </Dialog>
  );
}

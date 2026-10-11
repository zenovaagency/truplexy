import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { KeyRound, Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useApiKeys, useBots, useRevokeApiKey } from '@/lib/api/endpoints/business';
import { useChannelIcon, useChannels } from '@/lib/api/endpoints/channels';
import type { ApiKey } from '@/lib/api/types';
import { formatDate, formatRelative } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import {
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Page,
  PageHeader,
  SkeletonRows,
  Tip,
  useConfirm,
  type Column,
} from '@/components/ui';
import { ChannelBadge } from '@/components/domain/ChannelBadge';
import { ChatApiQuickStart, ChatApiReference } from '@/features/integrations/ChatApiGuide';
import { IssueKeyDialog } from './IssueKey';

const STATUSES: [string, string][] = [
  ['answered', 'Show `reply`.'],
  ['clarification_required', 'Show `reply`; it asks the customer a question.'],
  ['no_answer', "Show `reply`; the assistant didn't find an answer."],
  ['handoff_offered', 'Show `reply` with a button that calls /handoff.'],
  ['handoff', 'Show `reply`; the conversation is flagged for your team.'],
  ['escalated', 'Show nothing; a person has the conversation.'],
  ['context', 'Show nothing; the message was stored as history.'],
];

export default function ApiKeysPage() {
  const { can, scope } = useScopeCtx();
  const keys = useApiKeys();
  const bots = useBots();
  const revoke = useRevokeApiKey();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [showRevoked, setShowRevoked] = useState(false);
  const writable = can('integrations.write');
  const botName = (id: string) => bots.data?.find((b) => b.id === id)?.name ?? id;

  const rows = useMemo(
    () => (keys.data ?? []).filter((k) => showRevoked || k.status === 'active').sort((a, b) => (a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === 'active' ? -1 : 1)),
    [keys.data, showRevoked],
  );
  const revokedCount = (keys.data ?? []).filter((k) => k.status === 'revoked').length;

  const onRevoke = (k: ApiKey) =>
    confirm({
      title: `Revoke “${k.name}”?`,
      description: 'Anything using this key stops working within a minute. This cannot be undone; issue a new key to reconnect.',
      confirmLabel: 'Revoke key',
      tone: 'danger',
      typeToConfirm: k.key_prefix,
      onConfirm: () => revoke.mutateAsync(k.id),
    });

  const columns: Column<ApiKey>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (k) => (
        <span className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-ink-faint">
            <KeyRound className="size-4" />
          </span>
          <span className="grid min-w-0">
            <span className="truncate font-semibold text-ink">{k.name}</span>
            <code className="font-mono text-xs text-ink-faint">{k.key_prefix}…</code>
          </span>
        </span>
      ),
    },
    {
      key: 'bot',
      header: 'Bot',
      cell: (k) => (
        <span className="flex items-center gap-1.5">
          {botName(k.bot_id)}
          {k.bot_id === scope.bot && <Badge tone="outline" className="px-1.5 py-0 text-[0.65rem]">This bot</Badge>}
        </span>
      ),
    },
    { key: 'channel', header: 'Channel', hideBelowLg: true, cell: (k) => <KeyChannel apiKey={k} /> },
    { key: 'status', header: 'Status', cell: (k) => <Badge tone={k.status === 'active' ? 'live' : 'neutral'} dot>{k.status === 'active' ? 'Active' : 'Revoked'}</Badge> },
    { key: 'created', header: 'Created', hideBelowLg: true, cell: (k) => <span className="text-ink-muted">{formatDate(k.created_at)}</span> },
    { key: 'used', header: 'Last used', cell: (k) => <span className="text-ink-muted">{k.last_used_at ? formatRelative(k.last_used_at) : 'Never'}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      hideOnCard: !writable,
      cell: (k) =>
        writable && k.status === 'active' ? (
          <Tip content="Revoke">
            <Button size="xs" icon variant="quiet" className="hover:text-danger" onClick={() => void onRevoke(k)} aria-label={`Revoke ${k.name}`}>
              <Trash2 />
            </Button>
          </Tip>
        ) : null,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="API keys"
        description="Chat keys let your integrations talk to a bot through the chat API. Each key reaches chat API conversations for its bot."
        actions={
          writable && (
            <Button variant="accent" leading={<Plus />} onClick={() => setParams({ new: '1' })}>
              Issue key
            </Button>
          )
        }
      />

      <Callout tone="warn" icon={<ShieldCheck />} title="Server-side only">
        Use chat keys from your own server. A key in a web page, mobile app or public repository can be copied and used to run up your replies.
      </Callout>

      <Card
        flush
        title="Keys"
        actions={revokedCount > 0 && <Checkbox checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} label={`Show revoked (${revokedCount})`} />}
      >
        {keys.isPending ? (
          <SkeletonRows rows={4} className="p-4" />
        ) : keys.isError ? (
          <ErrorState error={keys.error} onRetry={() => keys.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getKey={(k) => k.id}
            empty={
              <EmptyState
                icon={<KeyRound />}
                title="No keys yet"
                description="Issue a key for each place you connect, so you can revoke one without breaking the others."
                action={writable && <Button variant="accent" leading={<Plus />} onClick={() => setParams({ new: '1' })}>Issue your first key</Button>}
              />
            }
          />
        )}
        {!writable && (
          <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-ink-faint">
            <Lock className="size-3.5" /> Only admins and owners can issue or revoke keys.
          </p>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card title="Quick start" description="Identify the customer, create their conversation, then send messages.">
          <ChatApiQuickStart />
        </Card>
        <Card title="What to show the customer" description="Every reply comes with a status." flush>
          <table className="table">
            <tbody>
              {STATUSES.map(([s, d]) => (
                <tr key={s}>
                  <td className="w-[44%]">
                    <code className="font-mono text-xs text-ink">{s}</code>
                  </td>
                  <td className="text-ink-muted">{d.replace(/`/g, '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Customer chat API"><ChatApiReference /></Card>

      {writable && <IssueKeyDialog open={params.get('new') === '1'} onOpenChange={(o) => !o && setParams({}, { replace: true })} />}
    </Page>
  );
}

/** The channel a key is bound to, read from its bot's channels. */
function KeyChannel({ apiKey: k }: { apiKey: ApiKey }) {
  const channels = useChannels(k.bot_id, Boolean(k.channel_id));
  const iconOf = useChannelIcon();
  if (!k.channel_id) return <span className="text-ink-faint">—</span>;
  const c = channels.data?.find((x) => x.id === k.channel_id);
  if (!c) return <span className="text-ink-faint">{channels.isPending ? '…' : 'Deleted channel'}</span>;
  return <ChannelBadge name={c.name} icon={iconOf(c.type)} muted={!c.active} className="max-w-[180px] text-ink-muted" />;
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Lock, Plus } from 'lucide-react';
import { hasCode, isApiError } from '@/lib/api/client';
import { useConnectChannel } from '@/lib/api/endpoints/channels';
import type { Channel } from '@/lib/api/types';
import { DISCORD_COMMANDS } from '@/lib/discord';
import { describeError } from '@/lib/errors';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Badge, Button, Callout, Dialog } from '@/components/ui';

const UNAVAILABLE = "Truplexy's Discord bot isn't set up on this server yet.";

/**
 * Sends the person to Discord to add Truplexy's bot to a server they manage. Discord brings
 * them back here, and the API links the server to this bot. `guildId` preselects a server
 * (from the bot's "Link this server" button); `open` shows the dialog straight away.
 */
export function DiscordConnectButton({
  guildId,
  open = false,
  size = 'sm',
  variant = 'accent',
  children,
}: {
  guildId?: string;
  open?: boolean;
  size?: 'xs' | 'sm';
  variant?: 'accent' | 'soft';
  children?: React.ReactNode;
}) {
  const { can, bot } = useScopeCtx();
  const connect = useConnectChannel();
  const [asking, setAsking] = useState(open);
  const [error, setError] = useState<string | null>(null);
  // Stays busy after success: the browser is on its way to Discord.
  const busy = connect.isPending || connect.isSuccess;

  useEffect(() => {
    if (open) setAsking(true);
  }, [open]);

  const go = () => {
    setError(null);
    connect.mutate(
      { type: 'discord', account: guildId ?? '' },
      {
        onError: (e) => {
          if (hasCode(e, 'CHANNEL_CONNECT_UNAVAILABLE')) setError(UNAVAILABLE);
          else if (hasCode(e, 'CHANNEL_TYPE_NOT_ALLOWED')) setError("Discord isn't available for this bot right now.");
          else if (hasCode(e, 'INVALID_REQUEST') && isApiError(e)) setError(e.message);
          else if (hasCode(e, 'CHANNEL_CONNECT_UNSUPPORTED')) setError(`${describeError(e).title}. ${describeError(e).detail ?? ''}`.trim());
        },
      },
    );
  };

  if (!can('channels.write'))
    return (
      <span className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Lock className="size-3" /> Ask an admin to connect
      </span>
    );
  return (
    <>
      <Button size={size} variant={variant} leading={<Plus />} onClick={() => setAsking(true)}>
        {children ?? 'Add to Discord'}
      </Button>
      <Dialog
        open={asking}
        onOpenChange={(o) => {
          setAsking(o);
          if (!o) setError(null);
        }}
        size="sm"
        title="Add Truplexy to your Discord server"
        description={
          guildId
            ? 'Discord asks you to approve the bot for the server you came from, then brings you back here.'
            : 'Discord asks you to pick a server you manage and approve the bot, then brings you back here.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button variant="accent" leading={<Plus />} loading={busy} onClick={go}>
              Continue to Discord
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-[0.8125rem] leading-relaxed text-ink-muted">
          {error && <Callout tone="danger" icon={<AlertTriangle />} title={error} />}
          <p>
            <span className="font-semibold text-ink">{bot.name}</span> answers the server's tickets. To use another bot, switch to it first.
          </p>
          <p>
            The bot asks to manage channels and roles for ticket channels, and to kick, ban, time out and delete messages for the moderation commands. Tickets and AI replies need an active plan; moderation works without one.
          </p>
          {guildId && (
            <p className="font-mono text-xs text-ink-faint">Server {guildId}</p>
          )}
        </div>
      </Dialog>
    </>
  );
}

/**
 * Discord: Truplexy's own bot, added in one click; a business running its own bot uses
 * the chat API guide instead (`onGuide`).
 */
export function DiscordCard({
  servers,
  invite,
  onGuide,
  className,
  head,
}: {
  /** The bot's channels linked to a Discord server. */
  servers: Channel[];
  /** The server the bot's "Link this server" button came from. */
  invite?: { guildId: string };
  onGuide: () => void;
  className: string;
  head: React.ReactNode;
}) {
  const { href } = useScopeCtx();
  const active = servers.filter((c) => c.active);
  const off = servers.filter((c) => !c.active);
  return (
    <div className={className}>
      {head}
      <button type="button" onClick={onGuide} className="mt-2 self-start text-xs font-semibold text-ink-muted hover:text-accent hover:underline">
        Running your own bot? Use the chat API →
      </button>
      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
        {active.length ? (
          <>
            <Badge tone="live" dot className="min-w-0">
              <span className="truncate">{active.length > 1 ? `Linked · ${active.length} servers` : `Linked · ${active[0]!.name}`}</span>
            </Badge>
            <span className="flex shrink-0 items-center gap-3">
              <DiscordConnectButton size="xs" variant="soft" guildId={invite?.guildId} open={Boolean(invite)}>
                Add server
              </DiscordConnectButton>
              <Link to={href('integrations')} className="text-[0.8125rem] font-semibold text-accent hover:underline">
                Manage →
              </Link>
            </span>
          </>
        ) : (
          <>
            <span className="text-xs text-ink-faint">{off.length ? 'Turned off' : 'Not linked'}</span>
            <DiscordConnectButton size="xs" guildId={invite?.guildId} open={Boolean(invite)} />
          </>
        )}
      </div>
    </div>
  );
}

/** What the team does inside Discord, for a linked server's channel sheet. */
export function DiscordCommands() {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-semibold text-ink">In your Discord server</span>
      <ul className="grid gap-1 text-xs text-ink-muted">
        {DISCORD_COMMANDS.map((c) => (
          <li key={c.name} className="flex gap-2">
            <code className="shrink-0 font-mono text-ink">{c.name}</code>
            <span>{c.does}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

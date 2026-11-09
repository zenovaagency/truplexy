import type { Channel } from '@/lib/api/types';

/* Discord servers linked to Truplexy's own bot (API_REFERENCE.md → POST /channels/connect, "Discord"). */

export const DISCORD = 'discord';

/** A Discord server ID: a snowflake. */
export const isGuildId = (v: string | null | undefined): v is string => Boolean(v && /^\d{15,25}$/.test(v));

/**
 * A server linked to Truplexy's bot: its channel's external_id is the server ID. A discord
 * channel added by hand for the business's own bot (chat API) has none, or something else.
 */
export const isDiscordServer = (c: Pick<Channel, 'type' | 'external_id'>) => c.type === DISCORD && isGuildId(c.external_id);

/** Why Discord sent the person back without linking the server, by `connect_error`. */
export const DISCORD_CONNECT_ERRORS: Record<string, string> = {
  denied: "Truplexy's bot wasn't added in Discord.",
  expired: 'That link expired or was already used. Add the bot again.',
  invalid: "That sign-in didn't come from Discord, or named a different server. Add the bot again.",
  store_connected_elsewhere: 'This server is already linked to another Truplexy business. Remove the bot there first, or ask that business to.',
  failed: 'Something went wrong linking your server. Try again.',
};

export const discordConnectErrorMessage = (code: string) => DISCORD_CONNECT_ERRORS[code] ?? DISCORD_CONNECT_ERRORS.failed!;

/** What the return from Discord says, or null when the query isn't one. */
export function readDiscordConnectReturn(params: URLSearchParams): { ok: true; channelId: string | null } | { ok: false; code: string } | null {
  const type = params.get('type');
  const connected = params.get('connected');
  const code = params.get('connect_error');
  if (connected === DISCORD && (type === DISCORD || type === null)) return { ok: true, channelId: params.get('channel_id') };
  if (code && type === DISCORD) return { ok: false, code };
  return null;
}

/**
 * The bot's "Link this server" button (and /setup) opens ?connect=discord&guild_id=<server>:
 * the server to preselect in Discord, or null when the query isn't one.
 */
export function readDiscordInvite(params: URLSearchParams): { guildId: string } | null {
  if (params.get('connect') !== DISCORD) return null;
  const guild = params.get('guild_id');
  return { guildId: isGuildId(guild) ? guild : '' };
}

/** The in-Discord commands, for the card and the channel sheet. */
export const DISCORD_COMMANDS: { name: string; does: string }[] = [
  { name: '/setup', does: 'Ticket category, staff roles and transcript channel' },
  { name: '/panel', does: 'Posts the "Open a ticket" button' },
  { name: '/ticket claim', does: 'A team member takes the ticket from the assistant' },
  { name: '/ticket close', does: 'Closes it and sends a transcript' },
  { name: '/ban, /kick, /timeout, /purge…', does: 'Moderation, with a linked server' },
];

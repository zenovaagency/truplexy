import { describe, expect, it } from 'vitest';
import { DISCORD_CONNECT_ERRORS, discordConnectErrorMessage, isDiscordServer, isGuildId, readDiscordConnectReturn, readDiscordInvite } from './discord';
import { connectReturnTo } from './shopify';

const q = (s: string) => new URLSearchParams(s);

describe('Discord servers', () => {
  it('knows a server ID and a linked server', () => {
    expect(isGuildId('1187340912665214976')).toBe(true);
    expect(isGuildId('12345')).toBe(false);
    expect(isGuildId('abc1187340912665214976')).toBe(false);
    expect(isGuildId(null)).toBe(false);
    expect(isDiscordServer({ type: 'discord', external_id: '1187340912665214976' })).toBe(true);
    // A discord channel added by hand for the business's own bot.
    expect(isDiscordServer({ type: 'discord', external_id: '' })).toBe(false);
    expect(isDiscordServer({ type: 'telegram', external_id: '1187340912665214976' })).toBe(false);
  });

  it('reads the return from Discord', () => {
    expect(readDiscordConnectReturn(q('connected=discord&channel_id=chn_1&type=discord'))).toEqual({ ok: true, channelId: 'chn_1' });
    expect(readDiscordConnectReturn(q('connected=discord'))).toEqual({ ok: true, channelId: null });
    expect(readDiscordConnectReturn(q('connect_error=denied&type=discord'))).toEqual({ ok: false, code: 'denied' });
    expect(readDiscordConnectReturn(q('connect_error=denied&type=shopify'))).toBeNull();
    expect(readDiscordConnectReturn(q('connected=shopify'))).toBeNull();
  });

  it("reads the bot's Link this server link", () => {
    expect(readDiscordInvite(q('connect=discord&guild_id=1187340912665214976'))).toEqual({ guildId: '1187340912665214976' });
    expect(readDiscordInvite(q('connect=discord&guild_id=nope'))).toEqual({ guildId: '' });
    expect(readDiscordInvite(q('connect=shopify'))).toBeNull();
  });

  it('says why a link failed, with a fallback', () => {
    expect(discordConnectErrorMessage('store_connected_elsewhere')).toContain('another Truplexy business');
    expect(discordConnectErrorMessage('nope')).toBe(DISCORD_CONNECT_ERRORS.failed);
  });

  it("leaves the bot's link parameters out of return_to", () => {
    const back = new URL(connectReturnTo('https://app.test/integrations/guides?connect=discord&guild_id=1187340912665214976&tab=x'));
    expect([...back.searchParams.keys()]).toEqual(['tab']);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/** The in-app mock API (demo mode) for WhatsApp numbers: POST /channels/whatsapp, GET and PUT /channels/{id}/whatsapp, and reply delivery. */
let db: MockDb;
const scoped = new Headers({ Authorization: 'Bearer demo', 'X-Truplexy-Tenant': 'acme', 'X-Truplexy-Bot': 'support' });

beforeEach(() => {
  localStorage.clear();
  db = loadDb(seedDb);
});

const call = (method: string, path: string, body?: unknown) => dispatch(db, { method, path, query: new URLSearchParams(), headers: scoped, body }).body as any;
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MockHttpError) return { status: e.status, code: e.code, field: e.extra.field };
    throw e;
  }
  throw new Error('expected an error');
};
const SECRET = '0123456789abcdef0123456789abcdef';
const input = (more: Record<string, unknown> = {}) => ({ phone_number_id: '106540352242922', waba_id: '102290129340398', access_token: 'EAAG' + 'x'.repeat(40), app_secret: SECRET, ...more });

describe('POST /channels/whatsapp', () => {
  it('adds a channel and answers with the webhook settings', () => {
    const n = call('POST', '/channels/whatsapp', input());
    expect(n.channel).toMatchObject({ type: 'whatsapp', external_id: '106540352242922', active: true });
    expect(n.webhook_url).toContain(n.channel.id);
    expect(n.verify_token).toMatch(/^tpx_/);
    expect(n.webhook_verified_at).toBeUndefined();
    expect(call('GET', `/channels/${n.channel.id}/whatsapp`)).toMatchObject({ phone_number_id: '106540352242922', verify_token: n.verify_token });
    // Connecting the same number again keeps the channel and its verify token.
    const again = call('POST', '/channels/whatsapp', input());
    expect(again.channel.id).toBe(n.channel.id);
    expect(again.verify_token).toBe(n.verify_token);
  });

  it('names the field Meta refused', () => {
    expect(fails(() => call('POST', '/channels/whatsapp', input({ phone_number_id: '+1 555' })))).toMatchObject({ status: 400, field: 'phone_number_id' });
    expect(fails(() => call('POST', '/channels/whatsapp', input({ access_token: 'bad-token-xxxxxxxxxxxxxxxx' })))).toMatchObject({ status: 400, field: 'access_token' });
    expect(fails(() => call('POST', '/channels/whatsapp', input({ app_secret: 'nope' })))).toMatchObject({ status: 400, field: 'app_secret' });
  });

  it('refuses a number another bot has', () => {
    const { channel } = call('POST', '/channels/whatsapp', input());
    db.channels.find((c) => c.id === channel.id)!.bot_id = 'another-bot';
    expect(fails(() => call('POST', '/channels/whatsapp', input()))).toMatchObject({ status: 409, code: 'WHATSAPP_NUMBER_TAKEN' });
  });
});

describe('GET and PUT /channels/{id}/whatsapp', () => {
  it('is 404 for a WhatsApp channel added by hand', () => {
    const hand = db.channels.find((c) => c.type === 'whatsapp' && c.tenant_id === 'acme')!;
    expect(fails(() => call('GET', `/channels/${hand.id}/whatsapp`))).toMatchObject({ status: 404, code: 'CHANNEL_NOT_FOUND' });
  });

  it('checks new credentials, and forgets the number when the channel is deleted', () => {
    const { channel } = call('POST', '/channels/whatsapp', input());
    expect(fails(() => call('PUT', `/channels/${channel.id}/whatsapp`, { access_token: 'bad-xxxxxxxxxxxxxxxxxxxx', app_secret: SECRET }))).toMatchObject({ field: 'access_token' });
    expect(call('PUT', `/channels/${channel.id}/whatsapp`, { access_token: 'EAAG' + 'y'.repeat(40), app_secret: SECRET }).phone_number_id).toBe('106540352242922');
    call('DELETE', `/channels/${channel.id}`);
    expect(db.whatsappNumbers?.[channel.id]).toBeUndefined();
  });
});

describe('replies to a WhatsApp ticket', () => {
  it('say whether WhatsApp took the reply', () => {
    const { channel } = call('POST', '/channels/whatsapp', input());
    const t = db.tickets.find((x) => x.tenant_id === 'acme' && x.bot_id === 'support' && x.conversation_id && x.status === 'open')!;
    Object.assign(t, { channel_id: channel.id, escalated: true, last_customer_at: new Date().toISOString() });
    expect(call('POST', `/tickets/${t.id}/replies`, { content: 'On its way.' }).delivery).toEqual({ status: 'sent' });
    t.last_customer_at = new Date(Date.now() - 25 * 3_600_000).toISOString();
    expect(call('POST', `/tickets/${t.id}/replies`, { content: 'Still there?' }).delivery.status).toBe('window_closed');
    // A note isn't sent anywhere.
    expect(call('POST', `/tickets/${t.id}/replies`, { content: 'Checked.', kind: 'note' }).delivery).toBeUndefined();
  });
});

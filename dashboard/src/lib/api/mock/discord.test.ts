import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, type MockDb } from './db';
import { seedDb } from './fixtures';
import { dispatch, MockHttpError } from './handlers';

/** The in-app mock API (demo mode) for Discord servers: POST /channels/connect with type discord. */
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
    if (e instanceof MockHttpError) return { status: e.status, code: e.code };
    throw e;
  }
  throw new Error('expected an error');
};
const back = `${window.location.origin}/integrations/guides?tab=x`;
const connect = (account?: string) => new URL(call('POST', '/channels/connect', { type: 'discord', ...(account === undefined ? {} : { account }), return_to: back }).url);
const servers = () => (call('GET', '/channels').data as any[]).filter((c) => c.type === 'discord');

describe('POST /channels/connect for Discord', () => {
  it('links a named server, or one picked in Discord, and comes back with the channel', () => {
    const u = connect('1187340912665214001');
    expect(u.searchParams.get('connected')).toBe('discord');
    expect(u.searchParams.get('type')).toBe('discord');
    expect(u.searchParams.get('tab')).toBe('x');
    expect(u.searchParams.get('channel_id')).toMatch(/^chn_/);
    // The same server turns its channel back on rather than adding another.
    connect('1187340912665214001');
    expect(servers()).toHaveLength(1);
    expect(servers()[0]).toMatchObject({ name: 'Demo community', external_id: '1187340912665214001', active: true });
    expect(connect('').searchParams.get('connected')).toBe('discord');
    expect(connect().searchParams.get('connected')).toBe('discord');
    expect(servers()).toHaveLength(3);
  });

  it('comes back with an error for a server ending in 0000', () => {
    const u = connect('1187340912665210000');
    expect(u.searchParams.get('connect_error')).toBe('denied');
    expect(u.searchParams.get('type')).toBe('discord');
    expect(servers()).toHaveLength(0);
  });

  it('refuses what the API refuses', () => {
    expect(fails(() => connect('my server'))).toEqual({ status: 400, code: 'INVALID_REQUEST' });
    expect(fails(() => call('POST', '/channels/connect', { type: 'discord', return_to: 'https://evil.example/x' }))).toEqual({ status: 400, code: 'INVALID_REQUEST' });
  });
});

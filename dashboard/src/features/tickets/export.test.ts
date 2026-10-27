import { afterEach, describe, expect, it } from 'vitest';
import { configureApi } from '@/lib/api/client';
import type { Ticket, TicketDetail } from '@/lib/api/types';
import { exportTickets, transcriptMarkdown } from './export';

const scope = { tenant: 'acme', bot: 'support' };

const ticket = (n: number): Ticket =>
  ({
    id: `tkt_${n}`,
    subject: n === 1 ? 'Where is my order? #42/7' : `Ticket ${n}`,
    status: 'open',
    priority: 'normal',
    escalated: false,
    source: 'customer',
    needs_reply: false,
    handed_off: false,
    reopen_count: 0,
    keep_open: false,
    conversation_id: `conv_${n}`,
    created_at: '2026-10-20T09:00:00Z',
    updated_at: `2026-10-2${n}T09:00:00Z`,
  }) as Ticket;

const detail = (t: Ticket): TicketDetail => ({
  ...t,
  messages: [
    {
      id: 'msg_1', role: 'user', author: 'customer', content: 'Where is it?', created_at: '2026-10-20T09:00:00Z',
      attachments: [{ id: 'att_1', content_type: 'image/jpeg', width: 8, height: 6, size: 90, url: 'https://files.example/att_1?sig=secret', url_expires_at: '2026-10-20T10:00:00Z' }],
    },
    { id: 'msg_2', role: 'assistant', author: 'assistant', content: 'Let me check.', created_at: '2026-10-20T09:00:05Z' },
    { id: 'msg_3', role: 'assistant', author: 'system', content: 'Sam has joined and will reply here.', created_at: '2026-10-20T09:01:00Z' },
    { id: 'msg_4', role: 'assistant', author: 'agent', agent: 'Sam', content: 'It ships today.', created_at: '2026-10-20T09:02:00Z' },
  ],
  replies: [
    { id: 'rep_1', kind: 'reply', author: 'Sam', content: 'It ships today.', message_id: 'msg_4', created_at: '2026-10-20T09:02:00Z' },
    { id: 'rep_2', kind: 'note', author: 'Sam', content: 'Courier is late', created_at: '2026-10-20T09:03:00Z' },
  ],
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, cost: 0.001, replies: 1 },
});

/** Two pages of tickets, and each ticket's detail; records the paths asked for. */
function fakeApi(tickets: Ticket[]) {
  const paths: string[] = [];
  configureApi({
    getToken: async () => null,
    transport: async (req) => {
      const url = new URL(req.url);
      const path = url.pathname.replace(/^\/v3/, '');
      paths.push(path + url.search);
      const body = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
      if (path === '/tickets') {
        const cursor = url.searchParams.get('cursor');
        const page = cursor ? tickets.slice(2) : tickets.slice(0, 2);
        return body(200, { data: page, counts: { all: tickets.length }, next_cursor: cursor ? undefined : 'next' });
      }
      const t = tickets.find((x) => path === `/tickets/${x.id}`);
      return t ? body(200, detail(t)) : body(404, { error: { code: 'NOT_FOUND', message: 'no' } });
    },
  });
  return paths;
}

/** The names and text of a zip's files, read through its local headers (stored entries only). */
async function entries(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const v = new DataView(buf.buffer);
  const out = new Map<string, string>();
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const method = v.getUint16(p + 8, true);
    const size = v.getUint32(p + 18, true);
    const nameLen = v.getUint16(p + 26, true);
    const name = new TextDecoder().decode(buf.subarray(p + 30, p + 30 + nameLen));
    let data = buf.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    out.set(name, new TextDecoder().decode(data));
    p += 30 + nameLen + size;
  }
  return out;
}

afterEach(() => configureApi({ getToken: async () => null, transport: async () => new Response(null, { status: 404 }) }));

describe('exportTickets', () => {
  const tickets = [ticket(1), ticket(2), ticket(3)];

  it('pages through the list with the filters, for a CSV', async () => {
    const paths = fakeApi(tickets);
    const out = await exportTickets(scope, { view: 'open', priority: 'high' }, 'csv');
    expect(out.count).toBe(3);
    expect(out.filename).toMatch(/^truplexy-tickets-acme-support-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toContain('view=open');
    expect(paths[0]).toContain('priority=high');
    expect(paths[0]).toContain('limit=100');
    expect(paths[1]).toContain('cursor=next');
    const csv = await out.blob.text();
    expect(csv.split('\r\n')[0]).toContain('"id","subject","status"');
    expect(csv).toContain('"tkt_3"');
  });

  it('zips a CSV, the JSON and a transcript per ticket, without picture links', async () => {
    const paths = fakeApi(tickets);
    const progress: string[] = [];
    const out = await exportTickets(scope, { view: 'all' }, 'zip', { onProgress: (p) => progress.push(`${p.stage}:${p.done}`) });
    expect(out.filename.endsWith('.zip')).toBe(true);
    expect(paths.filter((p) => p.startsWith('/tickets/tkt_'))).toHaveLength(3);
    expect(progress).toContain('details:3');

    const files = await entries(out.blob);
    expect([...files.keys()]).toEqual([
      'README.txt',
      'tickets.csv',
      'tickets.json',
      'tickets/tkt_1 - Where is my order #42 7.md',
      'tickets/tkt_2 - Ticket 2.md',
      'tickets/tkt_3 - Ticket 3.md',
    ]);
    const json = files.get('tickets.json')!;
    expect(json).not.toContain('sig=secret');
    expect(JSON.parse(json).tickets[0].messages[0].attachments[0]).toEqual({ id: 'att_1', content_type: 'image/jpeg', width: 8, height: 6, size: 90 });
    expect(files.get('tickets.csv')).toContain('"messages","replies","notes","total_tokens","cost"');
    expect(files.get('README.txt')).toContain('view=all');
  });

  it('stops when cancelled', async () => {
    fakeApi(tickets);
    const ctl = new AbortController();
    ctl.abort();
    await expect(exportTickets(scope, { view: 'all' }, 'zip', { signal: ctl.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('transcriptMarkdown', () => {
  it('reads like the dashboard transcript', () => {
    const md = transcriptMarkdown(detail(ticket(1)));
    expect(md).toContain('# Where is my order? #42/7');
    expect(md).toContain('**Customer** · 2026-10-20 09:00 UTC · 1 picture');
    expect(md).toContain('**Assistant**');
    expect(md).toContain('_Sam has joined and will reply here. · 2026-10-20 09:01 UTC_');
    expect(md).toContain('**Sam** · 2026-10-20 09:02 UTC');
    expect(md).toContain('**Internal note · Sam**');
    // The reply already in the conversation shows once.
    expect(md.match(/It ships today\./g)).toHaveLength(1);
  });
});

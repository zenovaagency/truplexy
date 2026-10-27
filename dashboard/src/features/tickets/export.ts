import { api, type Scope } from '@/lib/api/client';
import type { Ticket, TicketDetail, TicketList, TicketQuery } from '@/lib/api/types';
import { safeFileName, toCsv } from '@/lib/export';
import { isoDay } from '@/lib/format';
import { makeZip } from '@/lib/zip';

export type TicketExportFormat = 'zip' | 'csv';

export interface TicketExportProgress {
  stage: 'list' | 'details' | 'zip';
  done: number;
  total?: number;
}

export interface TicketExport {
  blob: Blob;
  filename: string;
  count: number;
}

/** The API sends a ticket's latest messages only (store.go maxTranscript). */
const TRANSCRIPT_LIMIT = 200;
const PAGE = 100;
const PARALLEL = 4;

const HEAD = [
  'id', 'subject', 'status', 'priority', 'assignee', 'channel', 'channel_type', 'customer_id', 'conversation_id',
  'escalated', 'source', 'reopen_count', 'created_at', 'first_response_at', 'closed_at', 'updated_at',
];
const DETAIL_HEAD = ['messages', 'replies', 'notes', 'total_tokens', 'cost'];

function row(t: Ticket) {
  return [
    t.id, t.subject, t.status, t.priority, t.assignee_name ?? t.assignee ?? '', t.channel_name ?? '', t.channel_type ?? '', t.customer_id ?? '', t.conversation_id ?? '',
    t.escalated, t.source, t.reopen_count, t.created_at, t.first_response_at ?? '', t.closed_at ?? '', t.updated_at,
  ];
}

function detailRow(t: TicketDetail) {
  return [
    ...row(t),
    t.messages.length,
    t.replies.filter((r) => r.kind === 'reply').length,
    t.replies.filter((r) => r.kind === 'note').length,
    t.usage?.total_tokens ?? 0,
    t.usage?.cost ?? 0,
  ];
}

/** Picture links expire after an hour, so the archive keeps what each picture was, not where. */
function withoutLinks(t: TicketDetail): TicketDetail {
  return {
    ...t,
    messages: t.messages.map((m) =>
      m.attachments?.length
        ? { ...m, attachments: m.attachments.map(({ url: _url, url_expires_at: _exp, ...a }) => a) as unknown as typeof m.attachments }
        : m,
    ),
  };
}

const when = (iso?: string) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : '—');
const quote = (text: string) => (text ? text.split('\n').map((l) => `> ${l}`).join('\n') : '> _(no text)_');

/** One ticket as Markdown, read top to bottom like the dashboard's transcript. */
export function transcriptMarkdown(t: TicketDetail) {
  const out = [
    `# ${t.subject}`,
    '',
    `- **Ticket:** ${t.id}`,
    `- **Status:** ${t.status}${t.closed_at ? ` (closed ${when(t.closed_at)})` : ''}`,
    `- **Priority:** ${t.priority}`,
    `- **Assignee:** ${t.assignee_name ?? t.assignee ?? 'Unassigned'}`,
    t.channel_name && `- **Channel:** ${t.channel_name}${t.channel_type ? ` (${t.channel_type})` : ''}`,
    t.customer_id && `- **Customer:** ${t.customer_id}`,
    t.conversation_id && `- **Conversation:** ${t.conversation_id}`,
    `- **Opened:** ${when(t.created_at)}`,
    `- **Last update:** ${when(t.updated_at)}`,
  ].filter((l): l is string => typeof l === 'string');

  if (t.summary) out.push('', `## AI summary${t.summary_at ? ` (${when(t.summary_at)})` : ''}`, '', t.summary);

  // Replies with a message_id are already in the conversation; notes and stand-alone replies are not.
  const items = [
    ...t.messages.map((m) => ({ at: m.created_at, m })),
    ...t.replies.filter((r) => r.kind === 'note' || !r.message_id).map((r) => ({ at: r.created_at, r })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  out.push('', '## Conversation', '');
  if (!items.length) out.push('_No messages._');
  if (t.messages.length >= TRANSCRIPT_LIMIT) out.push(`_Earlier messages are not included: this shows the latest ${TRANSCRIPT_LIMIT}._`, '');
  for (const it of items) {
    if ('m' in it) {
      const m = it.m;
      if (m.author === 'system') {
        out.push(`_${m.content} · ${when(m.created_at)}_`, '');
        continue;
      }
      const who = m.author === 'customer' ? 'Customer' : m.author === 'agent' ? `${m.agent ?? 'Team'}${m.via === 'api' ? ' (via platform)' : ''}` : 'Assistant';
      const pictures = m.attachments?.length ? ` · ${m.attachments.length} picture${m.attachments.length === 1 ? '' : 's'}` : '';
      out.push(`**${who}** · ${when(m.created_at)}${pictures}`, '', quote(m.content), '');
      if (m.error) out.push(`_Error: ${m.error}_`, '');
    } else {
      const r = it.r;
      const who = r.kind === 'note' ? `Internal note · ${r.author}` : r.author;
      out.push(`**${who}** · ${when(r.created_at)}`, '', quote(r.content), '');
    }
  }
  return out.join('\n').trimEnd() + '\n';
}

function readme(scope: Scope, query: TicketQuery, count: number, at: Date) {
  const filters = Object.entries(query).filter(([k, v]) => v && k !== 'cursor' && k !== 'limit');
  return [
    'Truplexy ticket export',
    '',
    `Exported:  ${at.toISOString()}`,
    `Business:  ${scope.tenant}`,
    `Bot:       ${scope.bot}`,
    `Filters:   ${filters.length ? filters.map(([k, v]) => `${k}=${v}`).join(', ') : 'none (all tickets)'}`,
    `Tickets:   ${count}`,
    '',
    'tickets.csv   one row per ticket, for a spreadsheet',
    'tickets.json  every ticket with its messages, replies and notes',
    'tickets/      one readable transcript per ticket',
    '',
    `Each transcript holds a ticket's latest ${TRANSCRIPT_LIMIT} messages. Picture links are left out: they expire after an hour.`,
    '',
  ].join('\r\n');
}

/** Reads every ticket matching `query`, in the order the queue shows them. */
async function listAll(scope: Scope, query: TicketQuery, signal?: AbortSignal, onProgress?: (p: TicketExportProgress) => void) {
  const tickets: Ticket[] = [];
  let cursor: string | undefined;
  do {
    const page = await api<TicketList>('/tickets', { scope, signal, query: { ...query, limit: PAGE, cursor } });
    tickets.push(...page.data);
    cursor = page.next_cursor;
    onProgress?.({ stage: 'list', done: tickets.length });
  } while (cursor);
  return tickets;
}

/** Runs `fn` over `items`, `n` at a time, keeping their order. */
async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>, signal?: AbortSignal) {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      signal?.throwIfAborted();
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/**
 * Exports the tickets matching `query`: a CSV of the list, or a zip with
 * that CSV, the full tickets as JSON and a Markdown transcript of each.
 */
export async function exportTickets(
  scope: Scope,
  query: TicketQuery,
  format: TicketExportFormat,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (p: TicketExportProgress) => void } = {},
): Promise<TicketExport> {
  const at = new Date();
  const base = `truplexy-tickets-${scope.tenant}-${scope.bot}-${isoDay(at)}`;
  const tickets = await listAll(scope, query, signal, onProgress);

  if (format === 'csv') {
    return { blob: new Blob([toCsv(HEAD, tickets.map(row))], { type: 'text/csv;charset=utf-8' }), filename: `${base}.csv`, count: tickets.length };
  }

  let done = 0;
  onProgress?.({ stage: 'details', done, total: tickets.length });
  const details = await pool(
    tickets,
    PARALLEL,
    async (t) => {
      const d = withoutLinks(await api<TicketDetail>(`/tickets/${t.id}`, { scope, signal }));
      onProgress?.({ stage: 'details', done: ++done, total: tickets.length });
      return d;
    },
    signal,
  );

  signal?.throwIfAborted();
  onProgress?.({ stage: 'zip', done: 0, total: details.length });
  const json = { format: 'truplexy-tickets', version: 1, exported_at: at.toISOString(), business: scope.tenant, bot: scope.bot, filters: query, tickets: details };
  const blob = await makeZip([
    { name: 'README.txt', data: readme(scope, query, details.length, at), date: at },
    { name: 'tickets.csv', data: toCsv([...HEAD, ...DETAIL_HEAD], details.map(detailRow)), date: at },
    { name: 'tickets.json', data: JSON.stringify(json, null, 2), date: at },
    ...details.map((d) => ({
      name: `tickets/${[d.id, safeFileName(d.subject)].filter(Boolean).join(' - ')}.md`,
      data: transcriptMarkdown(d),
      date: new Date(d.updated_at),
    })),
  ]);
  return { blob, filename: `${base}.zip`, count: details.length };
}

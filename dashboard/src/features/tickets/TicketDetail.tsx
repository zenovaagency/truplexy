import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  Hand,
  Link2,
  Lock,
  MoreHorizontal,
  PanelRight,
  Pencil,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  StickyNote,
  Trash2,
  Undo2,
  UserRound,
} from 'lucide-react';
import { useChannels } from '@/lib/api/endpoints/channels';
import { useDeleteTicket, useReplyToTicket, useSummarizeTicket, useTicket, useUpdateTicket } from '@/lib/api/endpoints/tickets';
import type { TicketDetail as TDetail, TicketMessage, TicketPatch, TicketPriority, TicketReply, TicketStatus } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatRelative, formatTime } from '@/lib/format';
import { notifySuccess } from '@/lib/notify';
import { shareUrl, useScopeCtx } from '@/lib/session/scope-context';
import { useCopy, useMediaQuery } from '@/hooks';
import {
  Badge,
  Button,
  Callout,
  CopyButton,
  DescList,
  EmptyState,
  ErrorState,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  Switch,
  Tip,
  useConfirm,
} from '@/components/ui';
import { PRIORITIES, PRIORITY, TICKET_STATUS, TICKET_STATUSES, TicketStatusBadge } from '@/components/domain/badges';
import { AssigneePicker, TicketFlags } from './shared';

type Item = { kind: 'message'; at: string; m: TicketMessage } | { kind: 'note' | 'reply'; at: string; r: TicketReply };

export function TicketDetail({ id, backHref }: { id: string; backHref?: string }) {
  const q = useTicket(id);
  const wide = useMediaQuery('(min-width: 1600px)');
  const [details, setDetails] = useState(false);

  if (q.isPending) {
    return (
      <div className="grid gap-4 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-16 w-1/2" />
        <Skeleton className="ml-auto h-16 w-1/2" />
        <Skeleton className="h-16 w-2/5" />
      </div>
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} className="h-full" />;
  const t = q.data;

  return (
    <div className={cn('flex flex-col', backHref ? 'min-h-[calc(100dvh-var(--topbar-h))]' : 'h-full')}>
      <Header ticket={t} backHref={backHref} onDetails={wide ? undefined : () => setDetails(true)} />
      <div className={cn('grid min-h-0 flex-1', wide && 'grid-cols-[minmax(0,1fr)_300px]')}>
        <div className="flex min-h-0 flex-col">
          <Transcript ticket={t} />
          <Composer ticket={t} />
        </div>
        {wide && (
          <aside className="overflow-y-auto border-l border-line bg-surface p-5">
            <Properties ticket={t} />
          </aside>
        )}
      </div>
      {!wide && (
        <Sheet open={details} onOpenChange={setDetails} title="Ticket details" width="sm">
          <Properties ticket={t} />
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Header({ ticket: t, backHref, onDetails }: { ticket: TDetail; backHref?: string; onDetails?: () => void }) {
  const { can, href, scope } = useScopeCtx();
  const update = useUpdateTicket();
  const del = useDeleteTicket();
  const confirm = useConfirm();
  const nav = useNavigate();
  const { copy } = useCopy();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(t.subject);
  const writable = can('tickets.write');

  const saveSubject = () => {
    const s = subject.trim();
    setEditing(false);
    if (s && s !== t.subject) update.mutate({ id: t.id, patch: { subject: s } });
    else setSubject(t.subject);
  };

  const remove = () =>
    confirm({
      title: 'Delete this ticket?',
      description: t.escalated
        ? 'Its replies and notes are deleted, and the conversation goes back to the assistant. The conversation keeps its messages.'
        : 'Its replies and notes are deleted. The conversation keeps its messages.',
      confirmLabel: 'Delete ticket',
      tone: 'danger',
      onConfirm: () => del.mutateAsync(t.id).then(() => nav(href('tickets'))),
    });

  return (
    <header className="flex items-start gap-2 border-b border-line bg-paper px-4 py-3 sm:px-5">
      {backHref && (
        <Button asChild icon variant="quiet" aria-label="Back to tickets" className="-ml-1.5">
          <Link to={backHref}>
            <ArrowLeft />
          </Link>
        </Button>
      )}
      <div className="grid min-w-0 flex-1 gap-1.5">
        {editing ? (
          <Input
            value={subject}
            autoFocus
            onChange={(e) => setSubject(e.target.value.slice(0, 200))}
            onBlur={saveSubject}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveSubject();
              if (e.key === 'Escape') {
                setSubject(t.subject);
                setEditing(false);
              }
            }}
            aria-label="Subject"
          />
        ) : (
          <h2 className="group flex items-start gap-1.5 text-base font-bold leading-snug text-ink">
            <span className="min-w-0 break-words">{t.subject}</span>
            {writable && (
              <button type="button" onClick={() => setEditing(true)} className="mt-0.5 shrink-0 text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:min-h-0 [@media(pointer:coarse)]:opacity-100" aria-label="Edit subject">
                <Pencil className="size-3.5" />
              </button>
            )}
          </h2>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
          <TicketStatusBadge status={t.status} />
          {t.priority !== 'normal' && <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>}
          <TicketFlags ticket={t} />
          <span>
            {t.source === 'customer' ? 'From the customer' : 'Opened in the dashboard'} · {formatRelative(t.created_at)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {writable && t.conversation_id && t.status !== 'closed' && (
          <Tip content={t.escalated ? 'Let the assistant reply again' : 'Pause the assistant and reply yourself'}>
            <Button
              size="xs"
              variant={t.escalated ? 'ghost' : 'soft'}
              loading={update.isPending && update.variables?.patch.escalated !== undefined}
              onClick={() => update.mutate({ id: t.id, patch: { escalated: !t.escalated } }, { onSuccess: () => notifySuccess(t.escalated ? 'Handed back to the assistant' : 'You have the conversation', t.escalated ? undefined : 'The assistant stays silent until you hand it back.') })}
              leading={t.escalated ? <Undo2 /> : <Hand />}
              className="hidden sm:inline-flex"
            >
              {t.escalated ? 'Hand back' : 'Take over'}
            </Button>
          </Tip>
        )}
        {onDetails && (
          <Tip content="Details">
            <Button icon size="xs" variant="quiet" onClick={onDetails} aria-label="Ticket details">
              <PanelRight />
            </Button>
          </Tip>
        )}
        <Menu>
          <MenuTrigger asChild>
            <Button icon size="xs" variant="quiet" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => void copy(shareUrl(scope, `tickets/${t.id}`)).then(() => notifySuccess('Link copied'))}>
              <Link2 /> Copy link
            </MenuItem>
            <MenuItem onSelect={() => void copy(t.id).then(() => notifySuccess('Ticket ID copied'))}>
              <Check /> Copy ticket ID
            </MenuItem>
            {writable && t.conversation_id && t.status !== 'closed' && (
              <MenuItem className="sm:hidden" onSelect={() => update.mutate({ id: t.id, patch: { escalated: !t.escalated } })}>
                {t.escalated ? <Undo2 /> : <Hand />} {t.escalated ? 'Hand back to the assistant' : 'Take over'}
              </MenuItem>
            )}
            {can('tickets.delete') && (
              <>
                <MenuSeparator />
                <MenuItem danger onSelect={() => void remove()}>
                  <Trash2 /> Delete ticket
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return formatDate(iso, { weekday: 'short', month: 'short', day: 'numeric' });
}

function Transcript({ ticket: t }: { ticket: TDetail }) {
  const ref = useRef<HTMLDivElement>(null);
  const items = useMemo<Item[]>(() => {
    const out: Item[] = t.messages.map((m) => ({ kind: 'message', at: m.created_at, m }));
    // Replies with a message_id are already in the conversation; notes and stand-alone replies are not.
    for (const r of t.replies) if (r.kind === 'note' || !r.message_id) out.push({ kind: r.kind, at: r.created_at, r });
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }, [t.messages, t.replies]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto bg-paper px-4 py-5 sm:px-6">
      {!items.length ? (
        <EmptyState compact icon={<StickyNote />} title="No messages yet" description="This ticket has no conversation. Add a note or a reply below." />
      ) : (
        <div className="mx-auto flex max-w-[760px] flex-col gap-2.5">
          {items.map((it, i) => {
            const prev = items[i - 1];
            const newDay = !prev || new Date(prev.at).toDateString() !== new Date(it.at).toDateString();
            return (
              <Fragment key={it.kind === 'message' ? it.m.id : it.r.id}>
                {newDay && (
                  <div className="my-2 flex items-center gap-3 text-[0.7rem] font-semibold text-ink-faint">
                    <span className="h-px flex-1 bg-line" />
                    {dayLabel(it.at)}
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                {it.kind === 'message' ? <MessageBubble m={it.m} /> : <ReplyBubble r={it.r} />}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Bullet lines ("- " or "• ") as a list; anything else as plain text. */
function SummaryText({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const bullet = /^[-•*]\s+/;
  if (!lines.length || !lines.every((l) => bullet.test(l))) return <p className="whitespace-pre-line">{text}</p>;
  return (
    <ul className="grid list-disc gap-1 pl-4 marker:text-ink-faint">
      {lines.map((l, i) => (
        <li key={i}>{l.replace(bullet, '')}</li>
      ))}
    </ul>
  );
}

function SummarySection({ ticket: t }: { ticket: TDetail }) {
  const { can } = useScopeCtx();
  const summarize = useSummarizeTicket();
  const [open, setOpen] = useState(true);
  const writable = can('tickets.write');
  const generate = () => summarize.mutate(t.id);

  if (!t.summary) {
    return (
      <section className="grid gap-3" aria-label="AI summary">
        <p className="mono flex items-center gap-1.5 text-ink-faint">
          <Sparkles className="size-3 text-accent" /> AI summary
        </p>
        <div className="grid gap-2.5 rounded-[12px] border border-line bg-surface-2/60 p-3 text-[0.8125rem] text-ink-muted">
          Catch up quickly with a short AI summary of this conversation and your team's notes.
          {writable && (
            <Button size="xs" variant="soft" className="w-full" leading={<Sparkles />} loading={summarize.isPending} onClick={generate}>
              Generate summary
            </Button>
          )}
        </div>
      </section>
    );
  }

  const latest = [t.last_customer_at, t.last_agent_at].filter(Boolean).sort().at(-1);
  const stale = Boolean(latest && t.summary_at && latest > t.summary_at);

  return (
    <section className="grid gap-3" aria-label="AI summary">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mono flex min-w-0 flex-1 items-center gap-1.5 text-left text-ink-faint hover:text-ink"
          aria-expanded={open}
        >
          <Sparkles className="size-3 shrink-0 text-accent" />
          AI summary
          {t.summary_at && <span className="truncate normal-case tracking-normal">· {formatRelative(t.summary_at)}</span>}
          <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', !open && '-rotate-90')} />
        </button>
        {writable && (
          <Tip content="Regenerate summary">
            <Button icon size="xs" variant="quiet" loading={summarize.isPending} onClick={generate} aria-label="Regenerate summary">
              <RefreshCw />
            </Button>
          </Tip>
        )}
      </div>
      {open && (
        <div className="grid gap-2 rounded-[12px] border border-line bg-surface-2/60 p-3 text-[0.8125rem] text-ink">
          <SummaryText text={t.summary} />
          {stale && <p className="text-[0.7rem] font-medium text-warn">New messages since this summary</p>}
          <p className="text-[0.7rem] text-ink-faint">Billed like an AI reply.</p>
        </div>
      )}
    </section>
  );
}

function Meta({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <p className={cn('flex items-center gap-1.5 px-1 text-[0.7rem] text-ink-faint', right && 'justify-end')}>{children}</p>;
}

function MessageBubble({ m }: { m: TicketMessage }) {
  if (m.author === 'customer') {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="bubble bubble-customer">{m.content}</div>
        <Meta>
          <UserRound className="size-3" /> Customer · {formatTime(m.created_at)}
        </Meta>
      </div>
    );
  }
  if (m.author === 'agent') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="bubble bubble-agent">{m.content}</div>
        <Meta right>
          {m.agent ?? 'Team'}
          {m.via === 'api' && <Badge tone="outline" className="px-1.5 py-0 text-[0.65rem]">via platform</Badge>} · {formatTime(m.created_at)}
        </Meta>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className={cn('bubble bubble-ai', m.error && 'border-danger/40 bg-danger-soft')}>{m.content || <span className="italic text-ink-faint">No reply</span>}</div>
      {m.error && <p className="px-1 text-[0.7rem] font-medium text-danger">{m.error}</p>}
      <Meta right>
        <Bot className="size-3 text-accent" /> Assistant
        {m.model && <span className="font-mono">{m.model.split('/').pop()}</span>}
        {m.usage && <span>· {formatCurrency(m.usage.cost)}</span>}
        <span>· {formatTime(m.created_at)}</span>
      </Meta>
    </div>
  );
}

function ReplyBubble({ r }: { r: TicketReply }) {
  if (r.kind === 'note') {
    return (
      <div className="flex flex-col gap-1">
        <div className="bubble bubble-note">
          <p className="mb-1 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-warn">
            <Lock className="size-3" /> Internal note · {r.author}
          </p>
          {r.content}
        </div>
        <Meta>{formatTime(r.created_at)} · only your team sees this</Meta>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="bubble bubble-agent">{r.content}</div>
      <Meta right>
        {r.author} · {formatTime(r.created_at)}
      </Meta>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Composer({ ticket: t }: { ticket: TDetail }) {
  const { can } = useScopeCtx();
  const reply = useReplyToTicket();
  const update = useUpdateTicket();
  const [kind, setKind] = useState<'reply' | 'note'>('reply');
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const draftKey = `truplexy.draft.${t.id}`;

  // Drafts survive switching tickets.
  useEffect(() => {
    try {
      setText(sessionStorage.getItem(draftKey) ?? '');
    } catch {
      /* ignore */
    }
  }, [draftKey]);
  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(draftKey, text);
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [text, draftKey]);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(240, el.scrollHeight)}px`;
  }, [text]);

  if (!can('tickets.write')) {
    return (
      <div className="flex items-center gap-2 border-t border-line bg-surface px-5 py-4 text-[0.8125rem] text-ink-muted">
        <Lock className="size-4 text-ink-faint" /> Your role can read tickets but not reply to them.
      </div>
    );
  }

  const send = (status?: TicketStatus) => {
    const content = text.trim();
    if (!content) return;
    reply.mutate(
      { id: t.id, content, kind, status },
      {
        onSuccess: () => {
          setText('');
          notifySuccess(kind === 'note' ? 'Note added' : status === 'closed' ? 'Reply sent and ticket closed' : 'Reply sent');
        },
      },
    );
  };

  const aiActive = Boolean(t.conversation_id) && !t.escalated && t.status !== 'closed';

  return (
    <div className="border-t border-line bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
      <div className="mx-auto grid max-w-[760px] gap-2.5">
        {aiActive && kind === 'reply' && (
          <Callout
            tone="neutral"
            icon={<ShieldAlert />}
            className="py-2"
            action={
              <Button size="xs" variant="soft" leading={<Hand />} loading={update.isPending} onClick={() => update.mutate({ id: t.id, patch: { escalated: true } })}>
                Take over
              </Button>
            }
          >
            The assistant is still answering here. Take over so it doesn't reply alongside you.
          </Callout>
        )}
        <div className={cn('overflow-hidden rounded-[14px] border bg-surface transition-colors focus-within:ring-[3px]', kind === 'note' ? 'border-warn/40 bg-warn-soft/40 focus-within:ring-warn/15' : 'border-line focus-within:border-accent focus-within:ring-accent/15')}>
          <textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 8000))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={kind === 'note' ? 'Write an internal note. Customers never see it.' : 'Write a reply to the customer…'}
            className="block w-full resize-none bg-transparent px-3.5 py-3 text-[0.875rem] text-ink outline-none placeholder:text-ink-faint"
            aria-label={kind === 'note' ? 'Internal note' : 'Reply'}
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-2 py-2">
            <Segmented
              size="xs"
              label="Message type"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'reply', label: 'Reply' },
                { value: 'note', label: <span className="flex items-center gap-1"><StickyNote className="size-3" /> Note</span> },
              ]}
            />
            <span className="ml-auto hidden text-[0.7rem] text-ink-faint sm:inline">{text.length > 7000 ? `${text.length}/8000` : 'Ctrl + Enter to send'}</span>
            <div className="flex">
              <Button size="xs" variant="accent" className="rounded-r-none" loading={reply.isPending} disabled={!text.trim()} onClick={() => send()} leading={<Send />}>
                {kind === 'note' ? 'Add note' : 'Send'}
              </Button>
              <Menu>
                <MenuTrigger asChild>
                  <Button size="xs" icon variant="accent" className="rounded-l-none border-l border-l-white/25" disabled={!text.trim() || reply.isPending} aria-label="Send and set status">
                    <ChevronDown />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onSelect={() => send('closed')}>Send and close</MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Properties({ ticket: t }: { ticket: TDetail }) {
  const { can } = useScopeCtx();
  const update = useUpdateTicket();
  const channels = useChannels();
  const writable = can('tickets.write');
  const patch = (p: TicketPatch) => update.mutate({ id: t.id, patch: p });
  const closed = t.status === 'closed';
  // A deleted channel stays on its tickets by name.
  const channelOptions = [
    ...(channels.data ?? []).map((c) => ({ value: c.id, label: c.active ? `${c.name} · ${c.type_label}` : `${c.name} (off)` })),
    ...(t.channel_id && channels.data && !channels.data.some((c) => c.id === t.channel_id) ? [{ value: t.channel_id, label: `${t.channel_name ?? t.channel_id} (deleted)` }] : []),
  ];

  return (
    <div className="grid gap-6">
      {t.conversation_id && (t.summary || t.escalated) && <SummarySection ticket={t} />}
      <section className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="mono text-ink-faint">Status</span>
          <Select
            size="sm"
            value={t.status}
            disabled={!writable}
            onChange={(e) => patch({ status: e.target.value as TicketStatus })}
            options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS[s].label }))}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="mono text-ink-faint">Priority</span>
          <Select
            size="sm"
            value={t.priority}
            disabled={!writable}
            onChange={(e) => patch({ priority: e.target.value as TicketPriority })}
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY[p].label }))}
          />
        </label>
        <div className="grid gap-1.5">
          <span className="mono text-ink-faint">Assignee</span>
          <AssigneePicker
            className="input-sm"
            value={t.assignee_user_id}
            name={t.assignee_name}
            disabled={!writable}
            onChange={(v) => patch({ assignee_user_id: v })}
          />
          {t.assignee && !t.assignee_user_id && <span className="text-[0.7rem] text-ink-faint">Set by an integration: {t.assignee}</span>}
        </div>
        {(channelOptions.length > 0 || t.channel_id) && (
          <label className="grid gap-1.5">
            <span className="mono text-ink-faint">Channel</span>
            <Select
              size="sm"
              value={t.channel_id ?? ''}
              disabled={!writable || channels.isPending}
              onChange={(e) => patch({ channel_id: e.target.value })}
              placeholder="No channel"
              options={channelOptions}
            />
          </label>
        )}
        {t.conversation_id && (
          <div className="rounded-[12px] border border-line bg-surface-2/60 p-3">
            <Switch
              checked={t.escalated}
              disabled={!writable || closed || update.isPending}
              onCheckedChange={(v) => patch({ escalated: v })}
              label="Assistant paused"
              description={t.escalated ? `Your team has this conversation${t.escalated_at ? ` since ${formatRelative(t.escalated_at)}` : ''}.` : 'The assistant replies to new messages.'}
            />
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <p className="mono text-ink-faint">Timeline</p>
        <DescList
          items={[
            { label: 'Created', value: formatDateTime(t.created_at) },
            { label: 'First response', value: t.first_response_at ? formatDateTime(t.first_response_at) : <span className="text-warn">Not yet</span> },
            { label: 'Customer wrote', value: formatRelative(t.last_customer_at), hidden: !t.last_customer_at },
            { label: 'Team replied', value: formatRelative(t.last_agent_at), hidden: !t.last_agent_at },
            { label: 'Closed', value: formatRelative(t.closed_at), hidden: !t.closed_at },
            { label: 'Reopened', value: `${t.reopen_count} times`, hidden: !t.reopen_count },
          ]}
        />
      </section>

      <section className="grid gap-3">
        <p className="mono text-ink-faint">Conversation</p>
        <DescList
          items={[
            { label: 'Source', value: t.channel ? <Badge tone="outline">{t.channel === 'api' ? 'Chat API' : t.channel === 'playground' ? 'Playground' : t.channel}</Badge> : 'Dashboard' },
            {
              label: 'ID',
              value: t.conversation_id ? (
                <span className="flex items-center gap-1">
                  <span className="truncate font-mono text-xs">{t.conversation_id}</span>
                  <CopyButton value={t.conversation_id} label="Copy conversation ID" />
                </span>
              ) : (
                '—'
              ),
            },
            { label: 'AI replies', value: formatNumber(t.usage?.replies ?? 0) },
            { label: 'Tokens', value: formatNumber(t.usage?.total_tokens ?? 0) },
            { label: 'AI cost', value: formatCurrency(t.usage?.cost ?? 0) },
          ]}
        />
      </section>
      <p className="flex items-center gap-1 font-mono text-[0.68rem] text-ink-faint">
        {t.id} <CopyButton value={t.id} label="Copy ticket ID" />
      </p>
    </div>
  );
}

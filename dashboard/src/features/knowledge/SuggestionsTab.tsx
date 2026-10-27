import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { AlertTriangle, Check, Lightbulb, Pencil, Ticket, X } from 'lucide-react';
import { hasCode, isApiError } from '@/lib/api/client';
import { useWorkspace } from '@/lib/api/endpoints/bot';
import { useAcceptSuggestion, useDismissSuggestion, useKnowledgeSuggestions, useLearnFromTickets } from '@/lib/api/endpoints/knowledge';
import type { KnowledgeSuggestion } from '@/lib/api/types';
import { formatNumber, formatRelative } from '@/lib/format';
import { notifySuccess } from '@/lib/notify';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Button, Callout, Card, EmptyState, ErrorState, Field, Input, SkeletonRows, Switch, Textarea } from '@/components/ui';

interface Ctx {
  openDoc: (id: string) => void;
}

/** Questions and answers learned from closed tickets, for the team to add to the knowledge base or dismiss. */
export function SuggestionsTab() {
  const { can, bot } = useScopeCtx();
  const ws = useWorkspace();
  const learning = Boolean(ws.data?.bot.knowledge?.learnFromTickets);
  const suggestions = useKnowledgeSuggestions();
  const list = suggestions.data ?? [];

  return (
    <div className="grid gap-5">
      <LearnSetting />
      {suggestions.isPending ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : suggestions.isError ? (
        <Card>
          <ErrorState error={suggestions.error} onRetry={() => suggestions.refetch()} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Lightbulb />}
            title={learning ? 'Nothing to review' : 'No suggestions'}
            description={
              learning
                ? `When a ticket someone on the team answered closes, ${bot.name} drafts an article from the answer within a few minutes. It shows up here for you to add or dismiss.`
                : 'Turn on learning from closed tickets to get draft articles from your team’s answers.'
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          {list.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} writable={can('knowledge.write')} />
          ))}
        </div>
      )}
    </div>
  );
}

function LearnSetting() {
  const { can, bot } = useScopeCtx();
  const ws = useWorkspace();
  const save = useLearnFromTickets();
  const b = ws.data?.bot;
  const learning = Boolean(b?.knowledge?.learnFromTickets);
  const ragOff = b?.ragEnabled === false;

  return (
    <Card>
      <div className="grid gap-3">
        <Switch
          checked={learning}
          disabled={!ws.data || !can('bot.write') || save.isPending || (ragOff && !learning)}
          onCheckedChange={(v) => save.mutate(v)}
          label="Learn from closed tickets"
          description={`When a ticket a person answered closes, ${bot.name} drafts a reusable question and answer from it, without the customer’s details or your internal notes. Nothing is added until someone here accepts it. Each draft counts as one reply on your plan.`}
        />
        {ragOff && (
          <Callout tone="warn" icon={<AlertTriangle />} title="Knowledge retrieval is off">
            {bot.name} doesn’t answer from the knowledge base, so it can’t learn from tickets either.
          </Callout>
        )}
      </div>
    </Card>
  );
}

function SuggestionCard({ suggestion: s, writable }: { suggestion: KnowledgeSuggestion; writable: boolean }) {
  const { href } = useScopeCtx();
  const { openDoc } = useOutletContext<Ctx>();
  const accept = useAcceptSuggestion();
  const dismiss = useDismissSuggestion();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(s.title);
  const [content, setContent] = useState(s.content);
  const [dupe, setDupe] = useState<string | null>(null);
  const busy = accept.isPending || dismiss.isPending;
  const valid = title.trim().length > 0 && title.length <= 160 && content.trim().length > 0 && content.length <= 50_000;

  const add = () => {
    setDupe(null);
    accept.mutate(
      { id: s.id, title: title.trim(), content },
      {
        onSuccess: (doc) => notifySuccess('Added to the knowledge base', `${doc.chunk_count} passages indexed.`),
        onError: (e) => {
          if (hasCode(e, 'DUPLICATE_DOCUMENT') && isApiError(e)) setDupe(e.documentId ?? '');
        },
      },
    );
  };

  return (
    <Card
      title={editing ? 'Edit suggestion' : s.title}
      description={
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          <Ticket className="size-3.5" aria-hidden="true" />
          {s.ticket_subject ? (
            <Link to={href(`tickets/${s.ticket_id}`)} className="text-accent hover:underline">
              {s.ticket_subject}
            </Link>
          ) : (
            <span>Deleted ticket</span>
          )}
          {s.closed_at && <span>· closed {formatRelative(s.closed_at)}</span>}
        </span>
      }
      actions={
        writable &&
        !editing && (
          <Button size="xs" variant="quiet" leading={<Pencil />} onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </Button>
        )
      }
      footer={
        writable && (
          <div className="flex flex-wrap justify-end gap-2">
            {editing && (
              <Button
                variant="ghost"
                onClick={() => {
                  setTitle(s.title);
                  setContent(s.content);
                  setEditing(false);
                }}
                disabled={busy}
              >
                Discard edits
              </Button>
            )}
            <Button variant="ghost" leading={<X />} loading={dismiss.isPending} disabled={busy} onClick={() => dismiss.mutate(s.id)}>
              Dismiss
            </Button>
            <Button variant="accent" leading={<Check />} loading={accept.isPending} disabled={busy || !valid} onClick={add}>
              Add to knowledge
            </Button>
          </div>
        )
      }
    >
      <div className="grid gap-4">
        {dupe !== null && (
          <Callout
            tone="warn"
            icon={<AlertTriangle />}
            title="This answer is already in the knowledge base"
            action={dupe ? <Button size="xs" onClick={() => openDoc(dupe)}>Open it</Button> : undefined}
          >
            Dismiss the suggestion, or edit it into something new.
          </Callout>
        )}
        {editing ? (
          <>
            <Field label="Title" aside={`${title.length}/160`}>
              <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 160))} autoFocus />
            </Field>
            <Field label="Content" aside={`${formatNumber(content.length)}/50,000`}>
              <Textarea value={content} onChange={(e) => setContent(e.target.value.slice(0, 50_000))} rows={10} className="font-mono text-[0.8125rem]" />
            </Field>
          </>
        ) : (
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-line bg-surface-2/40 p-4 text-[0.8125rem] text-ink">{content}</div>
        )}
      </div>
    </Card>
  );
}

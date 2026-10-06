import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, CircleStop, FileText, MessageSquarePlus, RefreshCw, Send, Sparkles, Wrench } from 'lucide-react';
import { isApiError } from '@/lib/api/client';
import { useModels } from '@/lib/api/endpoints/bot';
import { useCurrentPlayground, useNewPlayground, useRunPlayground } from '@/lib/api/endpoints/playground';
import type { PlaygroundConversation, PlaygroundMessage, PlaygroundRunInput, PlaygroundRunResult } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { formatCurrency, formatMs, formatNumber } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Badge, Button, Card, CodeBlock, DescList, EmptyState, ErrorState, Page, PageHeader, Skeleton, Switch, Tip, useConfirm } from '@/components/ui';
import { ReplyStatusBadge } from '@/components/domain/badges';
import { useBotDraft } from '@/features/llm/draft';

const SUGGESTIONS = ['Where is my order?', 'Can I return something I opened?', 'Do you ship internationally?', 'I want to speak to a person'];

export default function PlaygroundPage() {
  const { draft, dirty } = useBotDraft();
  const { scope, href, bot } = useScopeCtx();
  const qc = useQueryClient();
  const current = useCurrentPlayground();
  const fresh = useNewPlayground();
  const run = useRunPlayground();
  const models = useModels();
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [debug, setDebug] = useState(false);
  const [lastDebug, setLastDebug] = useState<PlaygroundRunResult['debug'] | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const b = draft.bot;
  const conv = current.data;
  const messages = useMemo(() => conv?.messages ?? [], [conv]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, error]);
  useEffect(() => () => abort.current?.abort(), []);

  const input = (extra: Partial<PlaygroundRunInput>): PlaygroundRunInput => ({
    max_output_tokens: b.maxTokens ?? 800,
    assistant_name: b.name,
    model: b.model || undefined,
    temperature: b.temperature,
    rag_enabled: b.ragEnabled ?? true,
    rag_top_k: b.topK,
    tools_enabled: b.toolsEnabled || undefined,
    tools: b.toolsEnabled ? (b.tools ?? []) : undefined,
    debug: debug || undefined,
    ...extra,
  });

  /** Puts the stored messages into the cached conversation. */
  const store = (r: PlaygroundRunResult, resend: boolean) =>
    qc.setQueryData<PlaygroundConversation | null>(qk.bot(scope, 'playground'), (c) => {
      const base: PlaygroundConversation = c ?? { id: r.conversation_id ?? 'local', created_at: new Date().toISOString(), messages: [] };
      let msgs = [...base.messages];
      if (resend) {
        if (msgs.at(-1)?.role === 'assistant') msgs = msgs.slice(0, -1);
      } else if (r.user_message) msgs.push(r.user_message);
      if (r.reply) msgs.push({ ...r.reply, tool_calls: r.reply.tool_calls ?? r.tool_calls, sources: r.reply.sources ?? r.sources });
      return { ...base, id: r.conversation_id ?? base.id, messages: msgs };
    });

  const send = async (message?: string, resend = false) => {
    const content = (message ?? text).trim();
    if ((!content && !resend) || run.isPending) return;
    // A conversation is needed so both messages are stored and shared with the team.
    let convId = conv?.id;
    if (!convId) convId = (await fresh.mutateAsync()).id;
    setError(null);
    setPending(resend ? '' : content);
    if (!resend) setText('');
    abort.current = new AbortController();
    run.mutate(
      { input: input({ message: resend ? undefined : content, conversation_id: convId, resend: resend || undefined }), signal: abort.current.signal },
      {
        onSuccess: (r) => {
          store(r, resend);
          setLastDebug(r.debug ?? null);
        },
        onError: (e) => {
          if ((e as Error)?.name === 'AbortError') {
            if (!resend) setText(content);
            return;
          }
          setError(e);
        },
        onSettled: () => setPending(null),
      },
    );
  };

  const reset = () =>
    confirm({
      title: 'Start a new conversation?',
      description: 'The current one is kept, but the playground starts fresh.',
      confirmLabel: 'New conversation',
      onConfirm: () => fresh.mutateAsync().then(() => (setError(null), setLastDebug(null))),
    });

  const modelLabel = models.data?.find((m) => m.id === b.model)?.label ?? models.data?.find((m) => m.is_default)?.label ?? 'Default model';

  return (
    <Page>
      <PageHeader
        title="Playground"
        description={`Chat with ${bot.name} as a customer would, using the settings from LLM and Tools, including changes you haven't saved. Real model and tool calls are made.`}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card flush className="flex h-[min(760px,calc(100dvh-220px))] min-h-[520px] flex-col overflow-hidden" bodyClassName="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span className="grid size-8 place-items-center rounded-[10px] bg-[image:var(--gradient-brand)] text-white">
              <Sparkles className="size-4" />
            </span>
            <div className="grid min-w-0 flex-1">
              <span className="truncate text-[0.875rem] font-bold text-ink">{b.name}</span>
              <span className="truncate text-xs text-ink-faint">
                {modelLabel} · {dirty ? <span className="text-warn">testing unsaved changes</span> : 'saved settings'}
              </span>
            </div>
            <Tip content="New conversation">
              <Button size="xs" icon variant="quiet" onClick={() => void reset()} disabled={!messages.length || run.isPending} aria-label="New conversation">
                <MessageSquarePlus />
              </Button>
            </Tip>
          </div>

          <div ref={scroller} className="flex-1 overflow-y-auto bg-paper px-4 py-5">
            {current.isPending ? (
              <div className="grid gap-3">
                <Skeleton className="h-12 w-1/2 justify-self-end" />
                <Skeleton className="h-20 w-2/3" />
              </div>
            ) : current.isError ? (
              <ErrorState error={current.error} onRetry={() => current.refetch()} />
            ) : !messages.length && pending === null ? (
              <EmptyState
                icon={<Sparkles />}
                title={`Chat with ${b.name}`}
                description="Write as a customer would, or start with one of these."
                action={
                  <div className="flex max-w-md flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => void send(s)} className="chip border border-line bg-surface text-ink-muted transition-colors hover:border-accent hover:text-accent">
                        {s}
                      </button>
                    ))}
                  </div>
                }
              />
            ) : (
              <div className="mx-auto flex max-w-[720px] flex-col gap-3">
                {messages.map((m, i) => (
                  <Bubble key={m.id} m={m} last={i === messages.length - 1 && pending === null} onResend={() => void send(undefined, true)} busy={run.isPending} />
                ))}
                {pending !== null && (
                  <>
                    {pending && <div className="bubble bubble-me">{pending}</div>}
                    <div className="flex items-center gap-3 self-start">
                      <div className="bubble bubble-bot">
                        <span className="typing" aria-label="The assistant is writing">
                          <span />
                          <span />
                          <span />
                        </span>
                      </div>
                      <Button size="xs" variant="ghost" leading={<CircleStop />} onClick={() => abort.current?.abort()}>
                        Stop
                      </Button>
                    </div>
                  </>
                )}
                {Boolean(error) && <RunError error={error} onRetry={() => void send(undefined, true)} />}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end gap-2 border-t border-line bg-surface p-3"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 4000))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Message as a customer…  (Shift + Enter for a new line)"
              className="input max-h-40 min-h-[42px] flex-1 resize-none py-2.5"
              aria-label="Message"
            />
            <Button type="submit" variant="accent" icon size="sm" className="h-[42px] w-[42px]" disabled={!text.trim() || run.isPending} aria-label="Send">
              <Send />
            </Button>
          </form>
        </Card>

        <div className="grid content-start gap-5">
          <Card title="Settings in use" actions={<Link to={href('llm/model')} className="text-[0.8125rem] font-semibold text-accent hover:underline">Edit</Link>}>
            <DescList
              items={[
                { label: 'Assistant', value: b.name },
                { label: 'Model', value: modelLabel },
                { label: 'Temperature', value: b.temperature ?? '—' },
                { label: 'Max reply', value: `${formatNumber(b.maxTokens ?? 800)} tokens` },
                { label: 'Knowledge', value: b.ragEnabled === false ? 'Off' : `On · ${b.topK ?? 4} passages` },
                { label: 'Tools', value: b.toolsEnabled ? (b.tools?.length ? b.tools.join(', ') : 'On, none chosen') : 'Off' },
              ]}
            />
            {dirty && <p className="mt-4 rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">Includes changes not yet saved for {bot.name}'s customers.</p>}
          </Card>
          <Card title="Debugging">
            <div className="grid gap-4">
              <Switch checked={debug} onCheckedChange={setDebug} label="Include retrieval trace" description="Adds each retrieval stage and its timings to the next reply." />
              {lastDebug && <CodeBlock title="debug" code={JSON.stringify(lastDebug, null, 2)} maxHeight={320} />}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function RunError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const d = describeError(error);
  const retryable = isApiError(error) && ['LLM_RATE_LIMITED', 'LLM_TIMEOUT', 'TIMEOUT', 'LLM_PROVIDER_ERROR', 'NETWORK_ERROR'].includes(error.code);
  return (
    <div className="self-start rounded-[14px] border border-danger/30 bg-danger-soft px-4 py-3 text-[0.8125rem]">
      <p className="font-semibold text-danger">{d.title}</p>
      {d.detail && <p className="text-ink-muted">{d.detail}</p>}
      {d.requestId && <p className="mt-1 font-mono text-[0.68rem] text-ink-faint">Request {d.requestId}</p>}
      {retryable && (
        <Button size="xs" className="mt-2" leading={<RefreshCw />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

function Bubble({ m, last, onResend, busy }: { m: PlaygroundMessage; last: boolean; onResend: () => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  if (m.role === 'user') return <div className="bubble bubble-me">{m.content}</div>;
  const hasDetails = Boolean(m.sources?.length || m.tool_calls?.length);
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="bubble bubble-bot">{m.content || <span className="italic text-ink-faint">No reply: a person has the conversation.</span>}</div>
      <div className="flex flex-wrap items-center gap-1.5 px-1 text-[0.7rem] text-ink-faint">
        {m.status && <ReplyStatusBadge status={m.status} />}
        {m.model && <span className="font-mono">{m.model.split('/').pop()}</span>}
        {m.usage && (
          <span>
            · {formatNumber(m.usage.total_tokens)} tokens · {formatCurrency(m.usage.cost)}
          </span>
        )}
        {m.latency_ms != null && <span>· {formatMs(m.latency_ms)}</span>}
        {hasDetails && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-0.5 font-semibold text-accent [@media(pointer:coarse)]:min-h-0" aria-expanded={open}>
            {m.sources?.length ? `${m.sources.length} sources` : ''}
            {m.sources?.length && m.tool_calls?.length ? ' · ' : ''}
            {m.tool_calls?.length ? `${m.tool_calls.length} tool calls` : ''}
            <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
          </button>
        )}
        {last && (
          <button type="button" disabled={busy} onClick={onResend} className="inline-flex items-center gap-1 font-semibold text-ink-muted hover:text-ink disabled:opacity-50 [@media(pointer:coarse)]:min-h-0">
            <RefreshCw className="size-3" /> Regenerate
          </button>
        )}
      </div>
      {open && (
        <div className="grid w-full max-w-[640px] gap-2 animate-fade-in">
          {m.sources?.map((s, i) => (
            <div key={`${s.document_id}-${i}`} className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs">
              <FileText className="size-3.5 shrink-0 text-accent" />
              <span className="truncate font-semibold text-ink">{s.title}</span>
              {s.section && <span className="truncate text-ink-faint">› {s.section}</span>}
              {s.score != null && <span className="ml-auto font-mono text-ink-faint">{s.score.toFixed(2)}</span>}
            </div>
          ))}
          {m.tool_calls?.map((t, i) => (
            <div key={i} className="grid gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <Wrench className="size-3.5 text-accent" />
                <span className="font-mono font-semibold text-ink">{t.name}</span>
                <Badge tone={t.status === 'ok' ? 'live' : 'danger'} className="px-1.5 py-0">{t.status}</Badge>
                <span className="ml-auto text-ink-faint">{formatMs(t.latency_ms)}</span>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-[8px] bg-surface-2 p-2 font-mono text-[0.68rem] text-ink-muted">
                {JSON.stringify(t.arguments)} → {t.output.slice(0, 600)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


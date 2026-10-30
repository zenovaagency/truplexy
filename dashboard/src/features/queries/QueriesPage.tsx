import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ClipboardList, Lock, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import { useCustomerQuery, useDeleteQuery, useQueries, useQueryEvents, useQueryTypes, useUpdateQuery } from '@/lib/api/endpoints/queries';
import { useProperties } from '@/lib/api/endpoints/properties';
import type { CustomerQuery, QueryType } from '@/lib/api/types';
import { formatDateTime, formatRelative } from '@/lib/format';
import { changedValues, toField, valueProblem, type FieldValue } from '@/lib/properties';
import { CATEGORY, actorName, eventLine } from '@/lib/queries';
import { useScopeCtx } from '@/lib/session/scope-context';
import { useDebounce } from '@/hooks';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadMore,
  Page,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  SkeletonRows,
  Textarea,
  useConfirm,
  type Column,
} from '@/components/ui';
import { PropertyFields } from '@/components/domain/Properties';
import { AssigneePicker } from '@/features/tickets/shared';
import { NewQueryDialog, type QueryPrefill } from './NewQueryDialog';
import { AssistantAvatar } from '@/components/layout/Brand';

type View = 'active' | 'open' | 'pending' | 'done' | 'all';

export function QueryStatusBadge({ q }: { q: Pick<CustomerQuery, 'status_label' | 'status_category'> }) {
  return (
    <Badge tone={CATEGORY[q.status_category].tone} dot>
      {q.status_label}
    </Badge>
  );
}

/** /queries/:queryId? — the bot's queries, of the types this role may see. */
export default function QueriesPage() {
  const { can, href } = useScopeCtx();
  const writable = can('queries.write');
  const types = useQueryTypes();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'active';
  const type = params.get('type') ?? '';
  const assignee = params.get('assignee') ?? '';
  const setParam = (k: string, v: string) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true });
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const list = useQueries({ q: q || undefined, type: type || undefined, assignee: assignee || undefined, category: view === 'all' ? undefined : view });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  const { queryId } = useParams();
  const navigate = useNavigate();
  const { search: query } = useLocation();
  const open = (id: string | null) => navigate({ pathname: href(id ? `queries/${id}` : 'queries'), search: query });
  // Another page can ask for a new query here: /queries?new=1&customer=…&conversation=…&ticket=…
  const prefill: QueryPrefill | null = params.get('new')
    ? { customer_id: params.get('customer') ?? undefined, conversation_id: params.get('conversation') ?? undefined, ticket_id: params.get('ticket') ?? undefined }
    : null;
  const [creating, setCreating] = useState(false);
  const live = (types.data ?? []).filter((t) => !t.archived);

  const columns: Column<CustomerQuery>[] = [
    {
      key: 'ref',
      header: 'Query',
      cell: (r) => (
        <span className="grid min-w-0">
          <span className="flex items-center gap-2">
            <span className="mono text-xs text-ink-faint">{r.reference}</span>
            <span className="truncate font-semibold text-ink">{r.subject || r.type_name}</span>
          </span>
          <span className="truncate text-xs text-ink-faint">
            {r.type_name}
            {r.customer_name && ` · ${r.customer_name}`}
          </span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (r) => <QueryStatusBadge q={r} /> },
    {
      key: 'assignee',
      header: 'Assignee',
      hideBelowLg: true,
      cell: (r) => (r.assignee_name ? <span className="text-ink-muted">{r.assignee_name}</span> : <span className="text-ink-faint">—</span>),
    },
    {
      key: 'source',
      header: <span className="sr-only">Source</span>,
      hideBelowLg: true,
      cell: (r) =>
        r.source === 'assistant' ? (
          <Badge tone="violet">
            <AssistantAvatar size={14} className="-ml-1" /> Assistant
          </Badge>
        ) : null,
    },
    { key: 'updated', header: 'Changed', align: 'right', cell: (r) => <span className="whitespace-nowrap text-ink-muted">{formatRelative(r.updated_at)}</span> },
  ];

  return (
    <Page>
      <PageHeader
        title="Queries"
        description="Payments, orders, deliveries and other requests, each with its own form and statuses. The assistant can open them in a conversation and tell customers how theirs stand."
        actions={
          <>
            {can('queries.manage') && (
              <Button asChild size="sm" leading={<Settings2 />}>
                <Link to={href('settings/query-types')}>Query types</Link>
              </Button>
            )}
            {writable && live.length > 0 && (
              <Button variant="accent" size="sm" leading={<Plus />} onClick={() => setCreating(true)}>
                New query
              </Button>
            )}
          </>
        }
      />
      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Segmented
            label="Status"
            value={view}
            onChange={(v) => setParam('view', v === 'active' ? '' : v)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'open', label: 'Open' },
              { value: 'pending', label: 'Waiting' },
              { value: 'done', label: 'Done' },
              { value: 'all', label: 'All' },
            ]}
          />
          <Select className="w-auto max-w-[200px]" value={type} onChange={(e) => setParam('type', e.target.value)} aria-label="Type">
            <option value="">All types</option>
            {(types.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select className="w-auto" value={assignee} onChange={(e) => setParam('assignee', e.target.value)} aria-label="Assignee">
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
          </Select>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value.slice(0, 100))} placeholder="Q-1042, subject or customer" aria-label="Search queries" />
          </div>
        </div>
        {list.isPending || types.isPending ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getKey={(r) => r.id}
            onRowClick={(r) => open(r.id)}
            selectedKey={queryId}
            empty={
              !live.length ? (
                <EmptyState
                  icon={<ClipboardList />}
                  title="No query types yet"
                  description="Add the kinds of request you handle, such as payment issues or deliveries, each with its own form and statuses."
                  action={
                    can('queries.manage') && (
                      <Button asChild variant="accent">
                        <Link to={href('settings/query-types')}>Set up query types</Link>
                      </Button>
                    )
                  }
                />
              ) : (
                <EmptyState icon={<ClipboardList />} title="No queries here" description={q || type || assignee || view !== 'active' ? 'Try another filter.' : 'Open queries show up here.'} />
              )
            }
            footer={<LoadMore hasMore={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} shown={rows.length} />}
          />
        )}
        {!writable && (
          <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-ink-faint">
            <Lock className="size-3.5" /> Only agents and above can open or change queries.
          </p>
        )}
      </Card>
      <QuerySheet id={queryId ?? null} types={types.data ?? []} onClose={() => open(null)} />
      {(creating || (prefill && writable)) && live.length > 0 && (
        <NewQueryDialog
          types={live}
          prefill={prefill ?? undefined}
          onClose={() => {
            setCreating(false);
            if (prefill) setParams((p) => (['new', 'customer', 'conversation', 'ticket'].forEach((k) => p.delete(k)), p), { replace: true });
          }}
          onCreated={(created) => open(created.id)}
        />
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ */

function QuerySheet({ id, types, onClose }: { id: string | null; types: QueryType[]; onClose: () => void }) {
  const { can, href } = useScopeCtx();
  const writable = can('queries.write');
  const q = useCustomerQuery(id ?? undefined);
  const events = useQueryEvents(id ?? undefined);
  const update = useUpdateQuery();
  const del = useDeleteQuery();
  const confirm = useConfirm();
  const query = q.data;
  const type = types.find((t) => t.id === query?.type_id);
  const fields = useProperties('query', { scopeId: query?.type_id, enabled: Boolean(query) });
  const defs = useMemo(() => fields.data ?? [], [fields.data]);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!query) return;
    setValues(Object.fromEntries(defs.filter((d) => !query.masked_properties?.includes(d.key)).map((d) => [d.key, toField(d, query.properties[d.key])])));
    setSubject(query.subject);
  }, [query, defs]);
  const editable = defs.filter((d) => d.key in values);
  const problems = Object.fromEntries(editable.map((d) => [d.key, valueProblem(d, values[d.key]!)]));
  const changed = query ? changedValues(editable, query.properties, values) : {};
  const dirty = Boolean(query) && (Object.keys(changed).length > 0 || subject.trim() !== query!.subject);
  const names = Object.fromEntries((events.data ?? []).filter((e) => e.actor_id).map((e) => [e.actor_id!, e.actor_name ?? '']));
  if (query?.assignee_user_id && query.assignee_name) names[query.assignee_user_id] = query.assignee_name;

  const save = () => {
    if (!query || Object.values(problems).some(Boolean)) return;
    update.mutate({ id: query.id, patch: { ...(Object.keys(changed).length && { properties: changed }), ...(subject.trim() !== query.subject && { subject: subject.trim() }) } });
  };

  return (
    <Sheet
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={query ? `${query.reference} · ${query.type_name}` : 'Query'}
      description={query ? `Opened ${formatDateTime(query.created_at)}${query.source === 'assistant' ? ' by the assistant' : ''}` : undefined}
      footer={
        query &&
        (writable || can('queries.delete')) && (
          <>
            {can('queries.delete') && (
              <Button
                variant="ghost"
                className="mr-auto hover:text-danger"
                leading={<Trash2 />}
                onClick={() =>
                  void confirm({
                    title: `Delete ${query.reference}?`,
                    description: 'It disappears from every list, and the assistant no longer reports on it.',
                    confirmLabel: 'Delete query',
                    tone: 'danger',
                    onConfirm: async () => {
                      await del.mutateAsync(query.id);
                      onClose();
                    },
                  })
                }
              >
                Delete
              </Button>
            )}
            {writable && (
              <Button variant="accent" loading={update.isPending} disabled={!dirty || Object.values(problems).some(Boolean)} onClick={save}>
                Save changes
              </Button>
            )}
          </>
        )
      }
    >
      {q.isPending ? (
        <Skeleton className="h-60 rounded-[12px]" />
      ) : q.isError || !query ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} notFound={{ title: 'This query doesn’t exist', description: 'It may have been deleted, or it is of a type you can’t see.' }} />
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" hint={CATEGORY[query.status_category].hint}>
              <Select value={query.status} disabled={!writable || update.isPending} onChange={(e) => update.mutate({ id: query.id, patch: { status: e.target.value } })}>
                {(['open', 'pending', 'done'] as const).map((c) => {
                  const options = type?.statuses.filter((s) => s.category === c) ?? [];
                  return options.length ? (
                    <optgroup key={c} label={CATEGORY[c].label}>
                      {options.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
                {!type && <option value={query.status}>{query.status_label}</option>}
              </Select>
            </Field>
            <Field label="Assignee">
              <AssigneePicker value={query.assignee_user_id} name={query.assignee_name} disabled={!writable} onChange={(user) => update.mutate({ id: query.id, patch: { assignee_user_id: user } })} />
            </Field>
          </div>
          <Field label="Subject" optional>
            <Input value={subject} maxLength={200} readOnly={!writable} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          {(query.customer_id || query.conversation_id || query.ticket_id) && (
            <div className="flex flex-wrap gap-2 text-[0.8125rem]">
              {query.customer_id && <Badge tone="outline">Customer: {query.customer_name || 'deleted'}</Badge>}
              {query.ticket_id && (
                <Link to={href(`tickets/${query.ticket_id}`)} className="chip border border-line text-accent hover:underline">
                  Ticket
                </Link>
              )}
              {query.conversation_id && <Badge tone="outline">From a conversation</Badge>}
            </div>
          )}
          {defs.length > 0 && (
            <section className="grid gap-3">
              <p className="mono text-ink-faint">Details</p>
              <PropertyFields defs={defs} values={values} masked={query.masked_properties} errors={problems} disabled={!writable} onChange={(k, v) => setValues((x) => ({ ...x, [k]: v }))} />
            </section>
          )}
          <section className="grid gap-3">
            <p className="mono text-ink-faint">History</p>
            {writable && (
              <div className="grid gap-2">
                <Textarea rows={2} value={note} maxLength={4000} placeholder="Add a note for the team" aria-label="Note" onChange={(e) => setNote(e.target.value)} />
                <Button
                  size="sm"
                  className="justify-self-end"
                  disabled={!note.trim()}
                  loading={update.isPending}
                  onClick={() => update.mutate({ id: query.id, patch: { note: note.trim() } }, { onSuccess: () => setNote('') })}
                >
                  Add note
                </Button>
              </div>
            )}
            {events.isPending ? (
              <SkeletonRows rows={3} />
            ) : (
              <ol className="grid gap-2.5 border-l border-line pl-4">
                {[...(events.data ?? [])].reverse().map((e) => (
                  <li key={e.id} className="text-[0.8125rem]">
                    <span className="font-semibold text-ink">{actorName(e)}</span> <span className="text-ink-muted">{eventLine(e, type, names)}</span>
                    <span className="ml-2 text-xs text-ink-faint">{formatRelative(e.created_at)}</span>
                    {e.note && <p className="mt-1 whitespace-pre-wrap rounded-[10px] bg-surface-2 px-3 py-2 text-ink">{e.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}

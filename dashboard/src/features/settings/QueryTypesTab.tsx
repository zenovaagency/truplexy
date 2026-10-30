import { useState } from 'react';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ClipboardList, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useTenant } from '@/lib/api/endpoints/business';
import { useCreateQueryType, useDeleteQueryType, useQueryTypePresets, useQueryTypes, useUpdateQueryType } from '@/lib/api/endpoints/queries';
import type { LimitableRole, QueryCategory, QueryStatus, QueryType, QueryTypeInput, QueryTypePreset } from '@/lib/api/types';
import { pluralize } from '@/lib/format';
import { keyFromLabel, keyProblem } from '@/lib/properties';
import { CATEGORY, DEFAULT_STATUSES, LIMITABLE_ROLES, audience, statusesProblem } from '@/lib/queries';
import { notifySuccess } from '@/lib/notify';
import { isRouteMissing } from '@/lib/performance';
import { useScope, useScopeCtx } from '@/lib/session/scope-context';
import { Badge, Button, Callout, Card, Checkbox, Dialog, EmptyState, ErrorState, Field, Input, Select, SkeletonRows, Switch, Textarea, Tip, useConfirm } from '@/components/ui';
import { PropertiesEditor } from './PropertiesTab';
import { AssistantAvatar } from '@/components/layout/Brand';

/** Settings → Query types: the kinds of request the business handles, their statuses, forms and who sees them. */
export function QueryTypesTab() {
  const { can } = useScopeCtx();
  const manage = can('queries.manage');
  const types = useQueryTypes({ archived: true });
  const update = useUpdateQueryType();
  const del = useDeleteQueryType();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<QueryType | 'new' | null>(null);
  const [presets, setPresets] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const list = types.data ?? [];
  const current = list.find((t) => t.id === selected) ?? list.find((t) => !t.archived);

  if (types.isError && isRouteMissing(types.error)) {
    return <Callout tone="neutral" title="Queries aren't available on this server yet" />;
  }

  const onDelete = (t: QueryType) =>
    confirm({
      title: `Delete “${t.name}”?`,
      description: 'Its form goes with it. A type that has queries can only be archived.',
      confirmLabel: 'Delete type',
      tone: 'danger',
      onConfirm: () => del.mutateAsync(t.id),
    });

  return (
    <div className="grid gap-4">
      <Card
        flush
        title="Query types"
        description="Each kind of request gets its own form and statuses. Turn on the assistant for a type to let it open queries in conversations and tell customers how theirs stand."
        actions={
          manage && (
            <>
              <Button size="sm" leading={<Sparkles />} onClick={() => setPresets(true)}>
                Suggested
              </Button>
              <Button size="sm" variant="accent" leading={<Plus />} onClick={() => setEdit('new')}>
                Add type
              </Button>
            </>
          )
        }
      >
        {types.isPending ? (
          <SkeletonRows rows={3} className="p-5" />
        ) : types.isError ? (
          <ErrorState compact error={types.error} onRetry={() => void types.refetch()} />
        ) : !list.length ? (
          <EmptyState
            icon={<ClipboardList />}
            title="No query types yet"
            description="Start from a suggestion — payment issues, order problems, deliveries — or add your own."
            action={
              manage && (
                <Button variant="accent" leading={<Sparkles />} onClick={() => setPresets(true)}>
                  See suggestions
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((t) => (
              <li key={t.id} className={t.id === current?.id ? 'bg-accent-soft/40' : undefined}>
                <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <button type="button" className="grid min-w-0 flex-1 text-left" onClick={() => setSelected(t.id)}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{t.name}</span>
                      <span className="mono text-xs text-ink-faint">{t.key}</span>
                      {t.archived && <Badge tone="outline">Archived</Badge>}
                      {t.bot_enabled && (
                        <Badge tone="violet">
                          <AssistantAvatar size={14} className="-ml-1" /> Assistant
                        </Badge>
                      )}
                    </span>
                    <span className="truncate text-xs text-ink-faint">
                      {t.statuses.map((s) => s.label).join(' → ')} · Seen by {audience(t).toLowerCase()} · {pluralize(t.open, 'open query', 'open queries')}
                    </span>
                  </button>
                  {manage && (
                    <span className="flex items-center gap-1">
                      <Tip content="Edit">
                        <Button size="xs" icon variant="quiet" aria-label={`Edit ${t.name}`} onClick={() => setEdit(t)}>
                          <Pencil />
                        </Button>
                      </Tip>
                      <Tip content={t.archived ? 'Restore' : 'Archive: it takes no new queries'}>
                        <Button size="xs" icon variant="quiet" aria-label={t.archived ? `Restore ${t.name}` : `Archive ${t.name}`} onClick={() => update.mutate({ id: t.id, patch: { archived: !t.archived } })}>
                          {t.archived ? <ArchiveRestore /> : <Archive />}
                        </Button>
                      </Tip>
                      <Tip content="Delete">
                        <Button size="xs" icon variant="quiet" className="hover:text-danger" aria-label={`Delete ${t.name}`} onClick={() => void onDelete(t)}>
                          <Trash2 />
                        </Button>
                      </Tip>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {current && (
        <PropertiesEditor
          key={current.id}
          entity="query"
          scopeId={current.id}
          title={`${current.name}: form`}
          description="The fields filled in on each query of this type. Required ones must be given before a query is opened, also by the assistant, which asks the customer for them."
        />
      )}
      {edit && <TypeDialog editing={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} onCreated={(t) => setSelected(t.id)} />}
      {presets && <PresetsDialog existing={list} onClose={() => setPresets(false)} onCreated={(t) => setSelected(t.id)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface StatusRow extends QueryStatus {
  /** Not saved yet: its key follows its label. */
  fresh: boolean;
}

function TypeDialog({ editing, onClose, onCreated }: { editing?: QueryType; onClose: () => void; onCreated: (t: QueryType) => void }) {
  const create = useCreateQueryType();
  const update = useUpdateQueryType();
  const [name, setName] = useState(editing?.name ?? '');
  const [key, setKey] = useState(editing?.key ?? '');
  const [keyEdited, setKeyEdited] = useState(Boolean(editing));
  const [description, setDescription] = useState(editing?.description ?? '');
  const [rows, setRows] = useState<StatusRow[]>((editing?.statuses ?? DEFAULT_STATUSES).map((s) => ({ ...s, fresh: !editing })));
  const [defaultStatus, setDefaultStatus] = useState(editing?.default_status ?? 'new');
  const [roles, setRoles] = useState<LimitableRole[]>(editing?.visible_roles ?? []);
  const [bot, setBot] = useState(editing?.bot_enabled ?? false);
  const [touched, setTouched] = useState(false);
  const effectiveKey = keyEdited ? key : keyFromLabel(name);
  const statuses: QueryStatus[] = rows.map((r) => ({ key: r.fresh ? keyFromLabel(r.label) : r.key, label: r.label.trim(), category: r.category }));
  const problems = {
    name: !name.trim() ? 'Give the type a name.' : undefined,
    key: editing ? undefined : keyProblem(effectiveKey),
    statuses: statusesProblem(statuses),
    default: statuses.find((s) => s.key === defaultStatus && s.category !== 'done') ? undefined : 'Pick a status that isn’t done.',
  };
  const valid = !Object.values(problems).some(Boolean);
  const setRow = (i: number, patch: Partial<StatusRow>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) =>
    setRows((all) => {
      const next = [...all];
      [next[i], next[i + d]] = [next[i + d]!, next[i]!];
      return next;
    });

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    const body: QueryTypeInput = { name: name.trim(), description: description.trim(), statuses, default_status: defaultStatus, visible_roles: roles, bot_enabled: bot };
    if (editing) await update.mutateAsync({ id: editing.id, patch: body });
    else onCreated(await create.mutateAsync({ ...body, key: effectiveKey }));
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={editing ? `Edit “${editing.name}”` : 'Add a query type'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="accent" loading={create.isPending || update.isPending} disabled={touched && !valid} onClick={() => void submit().catch(() => {})}>
            {editing ? 'Save' : 'Add type'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={touched ? problems.name : undefined}>
            <Input value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Payment issue" />
          </Field>
          <Field label="Key" hint={editing ? 'It can’t change.' : 'Used by the API and the assistant.'} error={touched ? problems.key : undefined}>
            <Input
              className="mono"
              value={effectiveKey}
              maxLength={40}
              readOnly={Boolean(editing)}
              onChange={(e) => {
                setKeyEdited(true);
                setKey(e.target.value.toLowerCase());
              }}
            />
          </Field>
        </div>
        <Field label="Description" optional hint="The assistant reads it to decide when to open this type.">
          <Textarea rows={2} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-[0.8125rem] font-semibold text-ink">Statuses</legend>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input size="sm" aria-label={`Status ${i + 1}`} value={r.label} maxLength={40} onChange={(e) => setRow(i, { label: e.target.value })} />
              <Select size="sm" className="w-36 shrink-0" aria-label={`Category of status ${i + 1}`} value={r.category} onChange={(e) => setRow(i, { category: e.target.value as QueryCategory })}>
                {(Object.keys(CATEGORY) as QueryCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY[c].label}
                  </option>
                ))}
              </Select>
              <Button size="xs" icon variant="quiet" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp />
              </Button>
              <Button size="xs" icon variant="quiet" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown />
              </Button>
              <Button size="xs" icon variant="quiet" aria-label={`Remove status ${i + 1}`} disabled={rows.length <= 2} onClick={() => setRows((all) => all.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="xs" leading={<Plus />} disabled={rows.length >= 12} onClick={() => setRows((all) => [...all, { key: '', label: '', category: 'open', fresh: true }])}>
              Add status
            </Button>
            {editing && <span className="text-xs text-ink-faint">A status queries are in can't be removed until they move.</span>}
          </div>
          {touched && problems.statuses && <p className="text-xs font-medium text-danger">{problems.statuses}</p>}
        </fieldset>
        <Field label="New queries start as" error={touched ? problems.default : undefined}>
          <Select value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value)} options={statuses.filter((s) => s.category !== 'done' && s.key).map((s) => ({ value: s.key, label: s.label }))} />
        </Field>
        <fieldset className="grid gap-2 rounded-[12px] border border-line p-3.5">
          <legend className="px-1 text-[0.8125rem] font-semibold text-ink">Who sees these queries</legend>
          <p className="text-xs text-ink-faint">Owners and admins always do. Leave everyone unticked to let every role see them.</p>
          <div className="flex flex-wrap gap-4">
            {LIMITABLE_ROLES.map((r) => (
              <Checkbox key={r.value} label={r.label} checked={roles.includes(r.value)} onChange={(e) => setRoles((x) => (e.target.checked ? [...x, r.value] : x.filter((v) => v !== r.value)))} />
            ))}
          </div>
        </fieldset>
        <Switch
          checked={bot}
          onCheckedChange={setBot}
          label="Let the assistant handle it"
          description="It can open queries of this type in a conversation, asking the customer for the required fields, and tell each customer how their own queries stand — never anyone else's. Sensitive fields are never read back to it."
        />
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function PresetsDialog({ existing, onClose, onCreated }: { existing: QueryType[]; onClose: () => void; onCreated: (t: QueryType) => void }) {
  const scope = useScope();
  const tenant = useTenant();
  const presets = useQueryTypePresets(tenant.data?.business_type, !tenant.isPending);
  const create = useCreateQueryType();
  const [busy, setBusy] = useState<string | null>(null);
  const offered = (presets.data ?? []).filter((p) => !existing.some((t) => t.key === p.key));

  // The type first, then its form; a field that fails leaves the type to fix by hand.
  const add = async (p: QueryTypePreset) => {
    setBusy(p.key);
    try {
      const t = await create.mutateAsync({ key: p.key, name: p.name, description: p.description, statuses: p.statuses, default_status: p.default_status });
      for (const f of p.fields) {
        await api('/properties', {
          method: 'POST',
          scope,
          body: { entity: 'query', scope_id: t.id, key: f.key, label: f.label, type: f.type, required: f.required, sensitive: f.sensitive, ...(f.options.length && { options: f.options }) },
        });
      }
      notifySuccess(`${p.name} added`);
      onCreated(t);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Suggested query types" description="Each comes with statuses and a form you can change afterwards.">
      {presets.isPending || tenant.isPending ? (
        <SkeletonRows rows={4} />
      ) : presets.isError ? (
        <ErrorState compact error={presets.error} onRetry={() => void presets.refetch()} />
      ) : !offered.length ? (
        <EmptyState compact title="You have them all" />
      ) : (
        <ul className="grid gap-2">
          {offered.map((p) => (
            <li key={p.key} className="flex items-start justify-between gap-3 rounded-[12px] border border-line p-3.5">
              <span className="grid gap-1">
                <span className="font-semibold text-ink">{p.name}</span>
                <span className="text-xs text-ink-muted">{p.description}</span>
                <span className="text-xs text-ink-faint">Asks for {p.fields.map((f) => f.label.toLowerCase()).join(', ')}</span>
              </span>
              <Button size="sm" loading={busy === p.key} disabled={Boolean(busy)} onClick={() => void add(p).catch(() => {})}>
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

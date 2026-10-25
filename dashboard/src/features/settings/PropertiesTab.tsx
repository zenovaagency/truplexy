import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, ListPlus, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  useAddProperties,
  useCreateProperty,
  useDeleteProperty,
  useProperties,
  usePropertyPresets,
  useReorderProperties,
  useUpdateProperty,
} from '@/lib/api/endpoints/properties';
import { useTenant } from '@/lib/api/endpoints/business';
import type { PropertyDefinition, PropertyEntity, PropertyInput, PropertyOption, PropertyPreset, PropertyType } from '@/lib/api/types';
import { ENTITY_LABEL, MAX_PROPERTIES, PROPERTY_TYPES, PROPERTY_TYPE_LABEL, hasOptions, keyFromLabel, keyProblem, optionValue, optionsProblem } from '@/lib/properties';
import { pluralize } from '@/lib/format';
import { isRouteMissing } from '@/lib/performance';
import { useScopeCtx } from '@/lib/session/scope-context';
import {
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Segmented,
  Select,
  SkeletonRows,
  Switch,
  Textarea,
  Tip,
  useConfirm,
  type Column,
} from '@/components/ui';
import { SensitiveMark } from '@/components/domain/Properties';

const ENTITIES: PropertyEntity[] = ['customer'];

/** Settings → Properties: the typed fields a business adds to its bot's records. */
export function PropertiesTab() {
  const { can, bot } = useScopeCtx();
  const writable = can('properties.write');
  const [params, setParams] = useSearchParams();
  const entity = (ENTITIES as string[]).includes(params.get('entity') ?? '') ? (params.get('entity') as PropertyEntity) : ENTITIES[0]!;
  const list = useProperties(entity);
  const del = useDeleteProperty();
  const reorder = useReorderProperties();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<PropertyDefinition | 'new' | null>(null);
  const [presets, setPresets] = useState(false);
  const defs = useMemo(() => list.data ?? [], [list.data]);
  const full = defs.length >= MAX_PROPERTIES;
  const noun = ENTITY_LABEL[entity];

  const move = (from: number, to: number) => {
    const next = [...defs];
    const [d] = next.splice(from, 1);
    next.splice(to, 0, d!);
    // Number them in their new order; only the ones whose number changes are sent.
    reorder.mutate(next.flatMap((x, i) => (x.sort_order === i ? [] : [{ id: x.id, sort_order: i }])));
  };

  const onDelete = (d: PropertyDefinition) =>
    confirm({
      title: `Delete “${d.label}”?`,
      description: `Its value is erased from every ${noun.one}, and can't be brought back. A property added later with the key ${d.key} starts empty.`,
      confirmLabel: 'Delete property',
      tone: 'danger',
      typeToConfirm: d.key,
      onConfirm: () => del.mutateAsync(d.id),
    });

  const columns: Column<PropertyDefinition>[] = [
    {
      key: 'label',
      header: 'Property',
      cell: (d) => (
        <span className="grid min-w-0">
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
            {d.label}
            {d.sensitive && <SensitiveMark />}
          </span>
          <span className="mono truncate text-xs text-ink-faint">{d.key}</span>
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (d) => (
        <span className="text-ink-muted">
          {PROPERTY_TYPE_LABEL[d.type]}
          {hasOptions(d.type) && <span className="text-ink-faint"> · {pluralize(d.options.length, 'option')}</span>}
        </span>
      ),
    },
    {
      key: 'flags',
      header: 'Rules',
      hideBelowLg: true,
      cell: (d) =>
        d.required || d.sensitive ? (
          <span className="flex flex-wrap gap-1">
            {d.required && <Badge tone="accent">Required</Badge>}
            {d.sensitive && <Badge tone="warn">Sensitive</Badge>}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      hideOnCard: true,
      cell: (d) => {
        if (!writable) return null;
        const i = defs.indexOf(d);
        return (
          <span className="flex items-center justify-end gap-1">
            <Tip content="Move up">
              <Button size="xs" icon variant="quiet" disabled={i === 0 || reorder.isPending} onClick={() => move(i, i - 1)} aria-label={`Move ${d.label} up`}>
                <ArrowUp />
              </Button>
            </Tip>
            <Tip content="Move down">
              <Button size="xs" icon variant="quiet" disabled={i === defs.length - 1 || reorder.isPending} onClick={() => move(i, i + 1)} aria-label={`Move ${d.label} down`}>
                <ArrowDown />
              </Button>
            </Tip>
            <Tip content="Edit">
              <Button size="xs" icon variant="quiet" onClick={() => setEdit(d)} aria-label={`Edit ${d.label}`}>
                <Pencil />
              </Button>
            </Tip>
            <Tip content="Delete">
              <Button size="xs" icon variant="quiet" className="hover:text-danger" onClick={() => void onDelete(d)} aria-label={`Delete ${d.label}`}>
                <Trash2 />
              </Button>
            </Tip>
          </span>
        );
      },
    },
  ];

  if (list.isError && isRouteMissing(list.error)) {
    return (
      <Callout tone="neutral" title="Custom properties aren't available on this server yet">
        Once the API adds them, you can define your own fields for {bot.name}'s records here.
      </Callout>
    );
  }

  return (
    <div className="grid gap-4">
      {ENTITIES.length > 1 && (
        <Segmented
          label="Record"
          value={entity}
          onChange={(v) => setParams((p) => (p.set('entity', v), p), { replace: true })}
          options={ENTITIES.map((e) => ({ value: e, label: ENTITY_LABEL[e].many }))}
        />
      )}
      <Card
        flush
        title={`${noun.many}: custom properties`}
        description={`Fields your team fills in on each ${noun.one}, on top of the built-in ones. ${defs.length} of ${MAX_PROPERTIES}.`}
        actions={
          writable && (
            <>
              <Button size="sm" leading={<Sparkles />} onClick={() => setPresets(true)} disabled={full}>
                Suggested
              </Button>
              <Button size="sm" variant="accent" leading={<Plus />} onClick={() => setEdit('new')} disabled={full}>
                Add property
              </Button>
            </>
          )
        }
      >
        {list.isPending ? (
          <SkeletonRows rows={4} className="p-5" />
        ) : list.isError ? (
          <ErrorState compact error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={defs}
            getKey={(d) => d.id}
            onRowClick={writable ? (d) => setEdit(d) : undefined}
            empty={
              <EmptyState
                icon={<ListPlus />}
                title="No custom properties yet"
                description={`Add the fields your business needs, such as a loyalty tier or a date of birth. They appear on every ${noun.one}, in this order.`}
                action={
                  writable && (
                    <>
                      <Button size="sm" leading={<Sparkles />} onClick={() => setPresets(true)}>
                        See suggestions
                      </Button>
                      <Button size="sm" variant="accent" leading={<Plus />} onClick={() => setEdit('new')}>
                        Add property
                      </Button>
                    </>
                  )
                }
              />
            }
          />
        )}
      </Card>
      <p className="text-xs text-ink-faint">
        A property's key and type can't change once it exists, because records store their values under them. Sensitive values are hidden from people who can't edit the record and are never given to the
        assistant.
      </p>
      {edit && <PropertyDialog entity={entity} editing={edit === 'new' ? undefined : edit} existing={defs} onClose={() => setEdit(null)} />}
      {presets && <PresetsDialog entity={entity} existing={defs} onClose={() => setPresets(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add or edit                                                         */
/* ------------------------------------------------------------------ */

interface OptionRow extends PropertyOption {
  /** Not saved yet: its value follows its label. */
  fresh: boolean;
}

function PropertyDialog({ entity, editing, existing, onClose }: { entity: PropertyEntity; editing?: PropertyDefinition; existing: PropertyDefinition[]; onClose: () => void }) {
  const create = useCreateProperty();
  const update = useUpdateProperty();
  const [label, setLabel] = useState(editing?.label ?? '');
  const [key, setKey] = useState(editing?.key ?? '');
  const [keyEdited, setKeyEdited] = useState(Boolean(editing));
  const [type, setType] = useState<PropertyType>(editing?.type ?? 'text');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [required, setRequired] = useState(editing?.required ?? false);
  const [sensitive, setSensitive] = useState(editing?.sensitive ?? false);
  const [options, setOptions] = useState<OptionRow[]>(editing?.options.map((o) => ({ ...o, fresh: false })) ?? [{ value: '', label: '', fresh: true }]);
  const [touched, setTouched] = useState(false);

  const effectiveKey = keyEdited ? key : keyFromLabel(label);
  const finalOptions: PropertyOption[] = options
    .filter((o) => o.label.trim() || !o.fresh)
    .map((o) => ({ value: o.fresh ? optionValue(o.label) : o.value, label: o.label.trim() || o.value }));

  const problems = {
    label: !label.trim() ? 'Give the property a label.' : label.trim().length > 60 ? 'Keep the label to 60 characters.' : undefined,
    key: editing ? undefined : keyProblem(effectiveKey) ?? (existing.some((d) => d.key === effectiveKey) ? 'Another property already has this key.' : undefined),
    options: hasOptions(type) ? optionsProblem(finalOptions) : undefined,
  };
  const valid = !problems.label && !problems.key && !problems.options;
  const busy = create.isPending || update.isPending;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    const common: PropertyInput = { label: label.trim(), description: description.trim(), required, sensitive, ...(hasOptions(type) ? { options: finalOptions } : {}) };
    if (editing) await update.mutateAsync({ id: editing.id, patch: common });
    else await create.mutateAsync({ ...common, entity, key: effectiveKey, type });
    onClose();
  };

  const setOption = (i: number, patch: Partial<OptionRow>) => setOptions((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={editing ? `Edit “${editing.label}”` : 'Add a property'}
      description={editing ? `Key ${editing.key} · ${PROPERTY_TYPE_LABEL[editing.type]}` : `A field every ${ENTITY_LABEL[entity].one} gets.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="accent" loading={busy} disabled={touched && !valid} onClick={() => void submit().catch(() => {})}>
            {editing ? 'Save' : 'Add property'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit().catch(() => {});
        }}
      >
        <Field label="Label" error={touched ? problems.label : undefined}>
          <Input value={label} maxLength={60} autoFocus onChange={(e) => setLabel(e.target.value)} placeholder="Loyalty tier" />
        </Field>
        {editing ? null : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Key" hint="Used by the API and in imports. It can't change later." error={touched || keyEdited ? problems.key : undefined}>
              <Input
                className="mono"
                value={effectiveKey}
                maxLength={40}
                onChange={(e) => {
                  setKeyEdited(true);
                  setKey(e.target.value.toLowerCase());
                }}
                placeholder="loyalty_tier"
              />
            </Field>
            <Field label="Type" hint={PROPERTY_TYPES.find((t) => t.value === type)?.hint}>
              <Select value={type} onChange={(e) => setType(e.target.value as PropertyType)} options={PROPERTY_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
            </Field>
          </div>
        )}
        {hasOptions(type) && (
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-[0.8125rem] font-semibold text-ink">Options</legend>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  size="sm"
                  value={o.label}
                  maxLength={60}
                  aria-label={`Option ${i + 1}`}
                  placeholder={`Option ${i + 1}`}
                  onChange={(e) => setOption(i, { label: e.target.value })}
                />
                {!o.fresh && (
                  <Tip content="Stored value; it stays the same when you rename the option">
                    <span tabIndex={0} className="mono shrink-0 text-xs text-ink-faint">
                      {o.value}
                    </span>
                  </Tip>
                )}
                <Button size="xs" icon variant="quiet" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions((rows) => rows.filter((_, j) => j !== i))} disabled={options.length === 1}>
                  <X />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button size="xs" leading={<Plus />} onClick={() => setOptions((rows) => [...rows, { value: '', label: '', fresh: true }])} disabled={options.length >= 100}>
                Add option
              </Button>
              {editing && <span className="text-xs text-ink-faint">Records keep a removed option's value until someone changes it.</span>}
            </div>
            {touched && problems.options && <p className="text-xs font-medium text-danger">{problems.options}</p>}
          </fieldset>
        )}
        <Field label="Description" optional hint="Shown under the field, to help your team fill it in.">
          <Textarea rows={2} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-3 rounded-[12px] border border-line p-3.5">
          <Switch checked={required} onCheckedChange={setRequired} label="Required" description={`A new ${ENTITY_LABEL[entity].one} must have a value, and it can't be cleared.`} />
          <Switch
            checked={sensitive}
            onCheckedChange={setSensitive}
            label="Sensitive"
            description="Hidden from people who can only view records, never given to the assistant, and never sent in webhooks. Use it for dates of birth, addresses and the like."
          />
        </div>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Suggested properties                                                */
/* ------------------------------------------------------------------ */

function PresetsDialog({ entity, existing, onClose }: { entity: PropertyEntity; existing: PropertyDefinition[]; onClose: () => void }) {
  const tenant = useTenant();
  const presets = usePropertyPresets(entity, tenant.data?.business_type, !tenant.isPending);
  const add = useAddProperties();
  const [picked, setPicked] = useState<string[]>([]);
  const room = MAX_PROPERTIES - existing.length;
  const offered = (presets.data ?? []).filter((p) => !existing.some((d) => d.key === p.key));

  const toggle = (p: PropertyPreset) => setPicked((keys) => (keys.includes(p.key) ? keys.filter((k) => k !== p.key) : [...keys, p.key]));
  const submit = async () => {
    const bodies = offered
      .filter((p) => picked.includes(p.key))
      .map((p): PropertyInput => ({ entity, key: p.key, label: p.label, description: p.description, type: p.type, sensitive: p.sensitive, ...(hasOptions(p.type) ? { options: p.options } : {}) }));
    await add.mutateAsync(bodies);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Suggested properties"
      description="Fields businesses like yours often add. You can rename them or change their options afterwards."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="accent" loading={add.isPending} disabled={!picked.length || picked.length > room} onClick={() => void submit().catch(() => {})}>
            {picked.length ? `Add ${picked.length}` : 'Add'}
          </Button>
        </>
      }
    >
      {presets.isPending || tenant.isPending ? (
        <SkeletonRows rows={4} />
      ) : presets.isError ? (
        <ErrorState compact error={presets.error} onRetry={() => void presets.refetch()} />
      ) : !offered.length ? (
        <EmptyState compact title="You have them all" description="Every suggestion is already one of your properties." />
      ) : (
        <ul className="grid gap-1">
          {offered.map((p) => (
            <li key={p.key} className="flex items-start justify-between gap-3 rounded-[10px] px-2 py-2 hover:bg-surface-2">
              <Checkbox
                checked={picked.includes(p.key)}
                onChange={() => toggle(p)}
                label={
                  <span className="grid">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      {p.label}
                      {p.sensitive && <SensitiveMark />}
                    </span>
                    {p.description && <span className="text-xs text-ink-faint">{p.description}</span>}
                  </span>
                }
              />
              <span className="shrink-0 text-xs text-ink-faint">
                {PROPERTY_TYPE_LABEL[p.type]}
                {hasOptions(p.type) && ` · ${p.options.map((o) => o.label).join(', ')}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {picked.length > room && <p className="mt-3 text-xs font-medium text-danger">Only {room} more fit; pick fewer.</p>}
    </Dialog>
  );
}

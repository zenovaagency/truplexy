import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Columns3, Inbox, Lock, Pencil, Plus, Search, Star, Trash2, UserRound, X } from 'lucide-react';
import {
  useCreateCustomer,
  useCustomer,
  useCustomers,
  useDeleteCustomer,
  useRemoveCustomerAvatar,
  useSetCustomerAvatar,
  useUpdateCustomer,
} from '@/lib/api/endpoints/customers';
import { useProperties } from '@/lib/api/endpoints/properties';
import type { Contact, Customer, CustomerInput, PropertyDefinition } from '@/lib/api/types';
import { COMMON_CONTACT_TYPES, CONTACT_TYPE, contactOf, customerLabel, normalizeContact } from '@/lib/customers';
import { useFeature } from '@/lib/features';
import { formatDateTime, formatNumber, formatRelative, pluralize } from '@/lib/format';
import { changedValues, filledValues, pickable, toField, valueProblem, type FieldValue } from '@/lib/properties';
import { useScopeCtx } from '@/lib/session/scope-context';
import { useDebounce, useStoredState } from '@/hooks';
import {
  Avatar,
  Button,
  Card,
  CopyButton,
  DataTable,
  DescList,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadMore,
  Menu,
  MenuCheckItem,
  MenuContent,
  MenuLabel,
  MenuTrigger,
  Page,
  PageHeader,
  Select,
  Sheet,
  Skeleton,
  SkeletonRows,
  Textarea,
  Tip,
  useConfirm,
  type Column,
} from '@/components/ui';
import { TicketStatusBadge } from '@/components/domain/badges';
import { ImageUploader } from '@/components/domain/ImageUploader';
import { PropertyFields, PropertyList, PropertyValue } from '@/components/domain/Properties';

/** Up to this many property columns show in the list. */
const MAX_COLUMNS = 3;

/** The bot's customer properties, once the API serves them; [] before. */
function useCustomerProperties() {
  const on = useFeature('properties') === 'on';
  const q = useProperties('customer', { enabled: on });
  return useMemo(() => (on ? (q.data ?? []) : []), [on, q.data]);
}

/** A filter is `key=value`; this splits it. */
const splitFilter = (f: string) => {
  const i = f.indexOf('=');
  return i > 0 ? { [f.slice(0, i)]: f.slice(i + 1) } : {};
};
import { CustomerQueries } from '@/features/queries/CustomerQueries';

export default function CustomersPage() {
  const { can, bot, href } = useScopeCtx();
  const writable = can('customers.write');
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const defs = useCustomerProperties();
  const [filter, setFilter] = useState('');
  const list = useCustomers(q || undefined, splitFilter(filter));
  const del = useDeleteCustomer();
  const confirm = useConfirm();
  // The open customer is in the address, so it can be linked to and survives a reload.
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { search: query } = useLocation();
  const view = customerId ?? null;
  const setView = (id: string | null) => navigate({ pathname: href(id ? `customers/${id}` : 'customers'), search: query });
  const [edit, setEdit] = useState<Customer | 'new' | null>(null);
  const customers = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  const [shown, setShown] = useStoredState<string[]>('truplexy.customers.columns', []);
  const columnDefs = defs.filter((d) => shown.includes(d.key)).slice(0, MAX_COLUMNS);
  const filterable = defs.filter(pickable);

  const onDelete = (c: Customer) =>
    confirm({
      title: `Delete ${customerLabel(c)}?`,
      description: 'Their conversations and tickets stay, without a customer record. Their email and ID can be used again.',
      confirmLabel: 'Delete customer',
      tone: 'danger',
      onConfirm: async () => {
        await del.mutateAsync(c.id);
        setView(null);
      },
    });

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      cell: (c) => (
        <span className="flex items-center gap-3">
          <Avatar name={c.name} email={contactOf(c, 'email')} src={c.avatar_url} size={32} />
          <span className="grid min-w-0">
            <span className="truncate font-semibold text-ink">{customerLabel(c)}</span>
            {c.name && c.contacts[0] && <span className="truncate text-xs text-ink-faint">{contactOf(c, 'email') ?? c.contacts[0].value}</span>}
          </span>
        </span>
      ),
    },
    {
      key: 'contacts',
      header: 'Contacts',
      hideBelowLg: true,
      cell: (c) =>
        c.contacts.length ? (
          <span className="flex flex-wrap gap-1">
            {c.contacts.slice(0, 3).map((k) => (
              <ContactChip key={`${k.type}:${k.value}`} contact={k} />
            ))}
            {c.contacts.length > 3 && <span className="text-xs text-ink-faint">+{c.contacts.length - 3}</span>}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    ...columnDefs.map(
      (d): Column<Customer> => ({
        key: `property:${d.key}`,
        header: d.label,
        hideBelowLg: true,
        cell: (c) => (c.masked_properties?.includes(d.key) ? <span className="text-ink-faint">Hidden</span> : <PropertyValue def={d} value={c.properties?.[d.key]} />),
      }),
    ),
    {
      key: 'tickets',
      header: 'Tickets',
      align: 'right',
      cell: (c) => (
        <Link to={href(`tickets?view=all&customer=${c.id}`)} className="whitespace-nowrap tabular-nums hover:underline">
          <span className="font-semibold text-ink">{formatNumber(c.open_tickets)}</span> <span className="text-ink-faint">open · {formatNumber(c.tickets)}</span>
        </Link>
      ),
    },
    { key: 'seen', header: 'Last seen', align: 'right', cell: (c) => <span className="whitespace-nowrap text-ink-muted">{formatRelative(c.last_seen_at)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      hideOnCard: true,
      cell: (c) =>
        writable ? (
          <span className="flex items-center justify-end gap-1">
            <Tip content="Edit">
              <Button size="xs" icon variant="quiet" onClick={() => setEdit(c)} aria-label={`Edit ${customerLabel(c)}`}>
                <Pencil />
              </Button>
            </Tip>
            <Tip content="Delete">
              <Button size="xs" icon variant="quiet" className="hover:text-danger" onClick={() => void onDelete(c)} aria-label={`Delete ${customerLabel(c)}`}>
                <Trash2 />
              </Button>
            </Tip>
          </span>
        ) : null,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Customers"
        description={`The people ${bot.name} talks to. A chat started from your website or app is linked to the customer who gave their name and email, so every ticket shows who it is from.`}
        actions={
          writable && (
            <Button variant="accent" size="sm" leading={<Plus />} onClick={() => setEdit('new')}>
              Add customer
            </Button>
          )
        }
      />
      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value.slice(0, 100))}
              placeholder="Search by name, email or ID"
              aria-label="Search customers"
            />
          </div>
          {filterable.length > 0 && <PropertyFilter defs={filterable} value={filter} onChange={setFilter} />}
          {defs.length > 0 && (
            <Menu>
              <MenuTrigger asChild>
                <Button leading={<Columns3 />} aria-label="Choose columns">
                  <span className="hidden sm:inline">Columns</span>
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Show up to {MAX_COLUMNS} properties</MenuLabel>
                {defs.map((d) => {
                  const on = shown.includes(d.key);
                  return (
                    <MenuCheckItem
                      key={d.key}
                      checked={on}
                      disabled={!on && columnDefs.length >= MAX_COLUMNS}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(v) => setShown(v ? [...shown, d.key] : shown.filter((k) => k !== d.key))}
                    >
                      {d.label}
                    </MenuCheckItem>
                  );
                })}
              </MenuContent>
            </Menu>
          )}
        </div>
        {list.isPending ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={customers}
            getKey={(c) => c.id}
            onRowClick={(c) => setView(c.id)}
            empty={
              <EmptyState
                icon={<UserRound />}
                title={q || filter ? 'No customers match' : 'No customers yet'}
                description={
                  q || filter ? 'Try another name, email, ID or filter.' : 'They appear here when someone fills in their name and email in the chat widget, or when your server identifies them.'
                }
                action={
                  !q && !filter && writable ? (
                    <Button variant="accent" leading={<Plus />} onClick={() => setEdit('new')}>
                      Add a customer
                    </Button>
                  ) : undefined
                }
              />
            }
            footer={<LoadMore hasMore={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} shown={customers.length} />}
          />
        )}
        {!writable && (
          <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-ink-faint">
            <Lock className="size-3.5" /> Only agents and above can add or change customers.
          </p>
        )}
      </Card>
      <CustomerDetailSheet id={view} defs={defs} onClose={() => setView(null)} onEdit={(c) => (setView(null), setEdit(c))} onDelete={onDelete} writable={writable} />
      <CustomerFormSheet customer={edit} defs={defs} onClose={() => setEdit(null)} />
    </Page>
  );
}

/** One picker over every choice and yes/no property: "Loyalty tier: Gold". */
function PropertyFilter({ defs, value, onChange }: { defs: PropertyDefinition[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select className="w-auto max-w-[220px]" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter by property">
      <option value="">All customers</option>
      {defs.map((d) => (
        <optgroup key={d.key} label={d.label}>
          {(d.type === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : d.options).map((o) => (
            <option key={o.value} value={`${d.key}=${o.value}`}>
              {d.label}: {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

/** A contact as `type value`, with the value cut short in tables. */
export function ContactChip({ contact: k }: { contact: Contact }) {
  return (
    <span className="inline-flex max-w-[200px] items-center gap-1 rounded-full border border-line bg-surface-2/60 px-2 py-0.5 text-xs">
      <span className="text-ink-faint">{k.type}</span>
      <span className="truncate text-ink">{k.value}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */

function CustomerDetailSheet({
  id,
  defs,
  onClose,
  onEdit,
  onDelete,
  writable,
}: {
  id: string | null;
  defs: PropertyDefinition[];
  onClose: () => void;
  onEdit: (c: Customer) => void;
  onDelete: (c: Customer) => void;
  writable: boolean;
}) {
  const { href } = useScopeCtx();
  const q = useCustomer(id ?? undefined);
  const setAvatar = useSetCustomerAvatar();
  const removeAvatar = useRemoveCustomerAvatar();
  const c = q.data;
  const metadata = c && Object.keys(c.metadata ?? {}).length ? JSON.stringify(c.metadata, null, 2) : '';
  return (
    <Sheet
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      title={c ? customerLabel(c) : 'Customer'}
      description={c ? `Customer since ${formatDateTime(c.first_seen_at)}` : undefined}
      footer={
        c && writable ? (
          <>
            <Button variant="ghost" className="mr-auto hover:text-danger" leading={<Trash2 />} onClick={() => onDelete(c)}>
              Delete
            </Button>
            <Button variant="soft" leading={<Pencil />} onClick={() => onEdit(c)}>
              Edit
            </Button>
          </>
        ) : undefined
      }
    >
      {q.isPending ? (
        <Skeleton className="h-40 rounded-[12px]" />
      ) : q.isError || !c ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="grid gap-6">
          <div className="flex items-center justify-between gap-3">
            {writable ? (
              <ImageUploader
                name={customerLabel(c)}
                email={contactOf(c, 'email')}
                src={c.avatar_url}
                busy={setAvatar.isPending || removeAvatar.isPending}
                onUpload={(file) => setAvatar.mutate({ id: c.id, file })}
                onRemove={() => removeAvatar.mutate(c.id)}
              />
            ) : (
              <Avatar name={c.name} email={contactOf(c, 'email')} src={c.avatar_url} size={56} />
            )}
            <CopyButton value={`${window.location.origin}${href(`customers/${c.id}`)}`} label="Copy link" />
          </div>
          {c.avatar_url && (
            <p className="-mt-3 text-xs text-ink-faint">
              {c.avatar_source === 'upload' ? 'Uploaded by your team. Links from your chat integration don’t replace it.' : 'Copied from the picture their chat platform sent.'}
            </p>
          )}
          <DescList
            items={[
              { label: 'Name', value: c.name || '—' },
              { label: 'Last seen', value: formatRelative(c.last_seen_at) },
              { label: 'Conversations', value: formatNumber(c.conversations) },
            ]}
          />
          <section className="grid gap-2">
            <p className="mono text-ink-faint">Contacts</p>
            {c.contacts.length ? (
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {c.contacts.map((k) => (
                  <li key={`${k.type}:${k.value}`} className="flex items-center gap-3 px-3 py-2 text-[0.8125rem]">
                    <span className="mono w-20 shrink-0 text-ink-faint">{k.type}</span>
                    {k.type === 'email' ? (
                      <a href={`mailto:${k.value}`} className="min-w-0 flex-1 truncate hover:underline">
                        {k.value}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{k.value}</span>
                    )}
                    {k.label && <span className="shrink-0 text-xs text-ink-faint">{k.label}</span>}
                    {k.primary && c.contacts.filter((x) => x.type === k.type).length > 1 && (
                      <Tip content={`Primary ${k.type}`}>
                        <Star className="size-3.5 shrink-0 fill-current text-warn" aria-label={`Primary ${k.type}`} />
                      </Tip>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.8125rem] text-ink-faint">No contacts.</p>
            )}
          </section>
          {defs.length > 0 && (
            <section className="grid gap-2">
              <div className="flex items-center justify-between">
                <p className="mono text-ink-faint">Properties</p>
                <Link to={href('settings/properties')} className="text-xs font-semibold text-accent hover:underline">
                  Manage
                </Link>
              </div>
              <PropertyList defs={defs} values={c.properties ?? {}} masked={c.masked_properties} />
            </section>
          )}
          {metadata && (
            <section className="grid gap-2">
              <p className="mono text-ink-faint">Details from your platform</p>
              <pre className="overflow-x-auto rounded-[12px] border border-line bg-surface-2/60 p-3 font-mono text-xs text-ink-muted">{metadata}</pre>
            </section>
          )}
          <section className="grid gap-2">
            <div className="flex items-center justify-between">
              <p className="mono text-ink-faint">
                Tickets · {formatNumber(c.open_tickets)} open of {formatNumber(c.tickets)}
              </p>
              {c.tickets > c.recent_tickets.length && (
                <Link to={href(`tickets?view=all&customer=${c.id}`)} className="text-xs font-semibold text-accent hover:underline">
                  All {pluralize(c.tickets, 'ticket')} →
                </Link>
              )}
            </div>
            {c.recent_tickets.length ? (
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {c.recent_tickets.map((t) => (
                  <li key={t.id}>
                    <Link to={href(`tickets/${t.id}`)} className="flex items-center gap-3 px-3 py-2.5 text-[0.8125rem] hover:bg-surface-2/60">
                      <Inbox className="size-4 shrink-0 text-ink-faint" />
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.subject}</span>
                      <TicketStatusBadge status={t.status} />
                      <span className="whitespace-nowrap text-xs text-ink-faint">{formatRelative(t.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.8125rem] text-ink-faint">No tickets yet.</p>
            )}
          </section>
          <CustomerQueries customerId={c.id} />
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

interface Row {
  type: string;
  value: string;
  label?: string;
  primary: boolean;
}

interface Form {
  name: string;
  contacts: Row[];
  metadata: string;
}

const MAX_CONTACTS = 20;
const EMPTY: Form = { name: '', contacts: [], metadata: '' };
const newRow = (type = 'email'): Row => ({ type, value: '', primary: false });

const toForm = (c: Customer): Form => ({
  name: c.name,
  contacts: c.contacts.map(({ type, value, label, primary }) => ({ type, value, label, primary })),
  metadata: Object.keys(c.metadata ?? {}).length ? JSON.stringify(c.metadata, null, 2) : '',
});

/** The metadata text as an object, null when empty, or `undefined` when it isn't a JSON object up to 4 KB. */
function parseMetadata(text: string): Record<string, unknown> | null | undefined {
  if (!text.trim()) return null;
  if (text.length > 4096) return undefined;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const PHONE = /^\+?\d{5,20}$/;
const typeOf = (r: Row) => r.type.trim().toLowerCase();

/** What is wrong with one contact row, if anything. Rows without a value are ignored on save. */
function rowProblem(r: Row, all: Row[]): string | undefined {
  const type = typeOf(r);
  const value = normalizeContact(type, r.value);
  if (!value) return undefined;
  if (!CONTACT_TYPE.test(type)) return 'A type is a lowercase word, such as email or discord.';
  if (type === 'email' && !EMAIL.test(value)) return 'Enter an address such as ann@example.com.';
  if (type === 'phone' && !PHONE.test(value)) return 'Enter 5–20 digits, with an optional leading +.';
  if (all.filter((x) => typeOf(x) === type && normalizeContact(type, x.value) === value).length > 1) return 'Listed twice.';
  return undefined;
}

/** The property fields a customer starts the form with. */
const fieldsOf = (defs: PropertyDefinition[], c: Customer | null): Record<string, FieldValue> =>
  Object.fromEntries(defs.filter((d) => !c?.masked_properties?.includes(d.key)).map((d) => [d.key, toField(d, c?.properties?.[d.key])]));

function CustomerFormSheet({ customer, defs, onClose }: { customer: Customer | 'new' | null; defs: PropertyDefinition[]; onClose: () => void }) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const existing = customer && customer !== 'new' ? customer : null;
  const [f, setF] = useState<Form>(EMPTY);
  const [props, setProps] = useState<Record<string, FieldValue>>({});
  useEffect(() => {
    if (customer) {
      setF(existing ? toForm(existing) : { ...EMPTY, contacts: [newRow()] });
      setProps(fieldsOf(defs, existing));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);
  // Masked values are never sent: they would overwrite what this person can't see.
  const editable = defs.filter((d) => d.key in props);
  const propProblems = Object.fromEntries(editable.map((d) => [d.key, valueProblem(d, props[d.key]!)]));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setRow = (i: number, patch: Partial<Row>) => set('contacts', f.contacts.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // Marking one primary clears the others of its type.
  const makePrimary = (i: number) => {
    const type = typeOf(f.contacts[i]!);
    set('contacts', f.contacts.map((r, j) => ({ ...r, primary: j === i ? true : typeOf(r) === type ? false : r.primary })));
  };

  const metadata = parseMetadata(f.metadata);
  const filled = f.contacts.filter((r) => r.value.trim());
  const problems = f.contacts.map((r) => rowProblem(r, f.contacts));
  const valid = Boolean(f.name.trim() || filled.length) && !problems.some(Boolean) && metadata !== undefined && !Object.values(propProblems).some(Boolean);
  const saving = create.isPending || update.isPending;

  const save = () => {
    if (!valid) return;
    const contacts = filled.map((r) => ({ type: typeOf(r), value: r.value.trim(), ...(r.label?.trim() && { label: r.label.trim() }), ...(r.primary && { primary: true }) }));
    if (!existing) {
      const properties = filledValues(editable, props);
      return create.mutate({ name: f.name.trim(), contacts, ...(metadata && { metadata }), ...(Object.keys(properties).length && { properties }) }, { onSuccess: onClose });
    }
    // On a change, contacts replace the whole list, so send them only when they changed.
    const was = toForm(existing);
    const patch: CustomerInput = {};
    if (f.name.trim() !== was.name) patch.name = f.name.trim();
    if (JSON.stringify(filled.map((r) => [typeOf(r), r.value.trim(), r.label?.trim() || '', r.primary])) !== JSON.stringify(was.contacts.map((r) => [r.type, r.value, r.label || '', r.primary]))) patch.contacts = contacts;
    if (f.metadata.trim() !== was.metadata.trim()) patch.metadata = metadata ?? {};
    const properties = changedValues(editable, existing.properties ?? {}, props);
    if (Object.keys(properties).length) patch.properties = properties;
    if (!Object.keys(patch).length) return onClose();
    update.mutate({ id: existing.id, patch }, { onSuccess: onClose });
  };

  return (
    <Sheet
      open={Boolean(customer)}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `Edit ${customerLabel(existing)}` : 'Add a customer'}
      description="Needs a name or at least one contact. A contact (type and value) can belong to one customer of this bot."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={saving} disabled={!valid} onClick={save}>
            {existing ? 'Save customer' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name" optional aside={`${f.name.length}/120`}>
          <Input value={f.name} onChange={(e) => set('name', e.target.value.slice(0, 120))} autoComplete="off" />
        </Field>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.8125rem] font-semibold text-ink">Contacts</span>
            <span className="text-xs text-ink-faint">
              {f.contacts.length}/{MAX_CONTACTS}
            </span>
          </div>
          <datalist id="contact-types">
            {COMMON_CONTACT_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {f.contacts.map((r, i) => {
            const sameType = f.contacts.filter((x) => typeOf(x) === typeOf(r)).length > 1;
            return (
              <div key={i} className="grid gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    size="sm"
                    className="w-28 shrink-0"
                    list="contact-types"
                    value={r.type}
                    onChange={(e) => setRow(i, { type: e.target.value.toLowerCase().slice(0, 32) })}
                    placeholder="type"
                    aria-label="Contact type"
                    autoComplete="off"
                  />
                  <Input size="sm" className="min-w-0 flex-1" value={r.value} onChange={(e) => setRow(i, { value: e.target.value.slice(0, 254) })} placeholder="value" aria-label="Contact value" autoComplete="off" />
                  <Input size="sm" className="hidden w-24 shrink-0 sm:block" value={r.label ?? ''} onChange={(e) => setRow(i, { label: e.target.value.slice(0, 60) })} placeholder="label" aria-label="Contact label" autoComplete="off" />
                  <Tip content={sameType ? (r.primary ? 'Primary for this type' : 'Make primary') : 'The only one of its type, so primary'}>
                    <Button type="button" size="xs" icon variant="quiet" disabled={!sameType} onClick={() => makePrimary(i)} aria-label={r.primary ? 'Primary contact' : 'Make primary'} aria-pressed={r.primary}>
                      <Star className={r.primary || !sameType ? 'fill-current text-warn' : ''} />
                    </Button>
                  </Tip>
                  <Button type="button" size="xs" icon variant="quiet" className="hover:text-danger" onClick={() => set('contacts', f.contacts.filter((_, j) => j !== i))} aria-label="Remove contact">
                    <X />
                  </Button>
                </div>
                {problems[i] && <p className="text-xs text-danger">{problems[i]}</p>}
              </div>
            );
          })}
          <Button
            type="button"
            size="sm"
            variant="soft"
            className="justify-self-start"
            leading={<Plus />}
            disabled={f.contacts.length >= MAX_CONTACTS}
            onClick={() => set('contacts', [...f.contacts, newRow(f.contacts.length ? 'phone' : 'email')])}
          >
            Add contact
          </Button>
          <p className="text-xs text-ink-faint">
            The type can be any lowercase word: email, phone, discord, telegram, or your own, such as user_id. Emails are lowercased and phone numbers lose their spaces and dashes. Saving replaces the whole list.
          </p>
        </div>

        {defs.length > 0 && (
          <div className="grid gap-3 border-t border-line pt-4">
            <span className="text-[0.8125rem] font-semibold text-ink">Properties</span>
            <PropertyFields
              defs={defs}
              values={props}
              masked={existing?.masked_properties}
              errors={propProblems}
              onChange={(key, v) => setProps((p) => ({ ...p, [key]: v }))}
            />
          </div>
        )}

        <Field
          label="Details"
          optional
          hint="A JSON object about them, up to 4 KB, such as their plan. Saving replaces what is stored."
          error={metadata === undefined ? 'Must be a JSON object of up to 4 KB.' : undefined}
        >
          <Textarea rows={5} value={f.metadata} onChange={(e) => set('metadata', e.target.value)} className="font-mono text-xs" spellCheck={false} placeholder={'{ "plan": "pro" }'} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

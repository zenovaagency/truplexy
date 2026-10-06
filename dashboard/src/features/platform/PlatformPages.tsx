import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowUpRight,
  Bot,
  Building2,
  Cpu,
  FileText,
  Inbox,
  MessagesSquare,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { useBusinessTypes, useMe, usePlans } from '@/lib/api/endpoints/account';
import {
  usePlatformModels,
  usePlatformOverview,
  usePlatformTemplates,
  usePlatformTenantDetail,
  usePlatformTenants,
  usePlatformTickets,
  usePlatformTools,
  usePlatformUsage,
  usePlatformUsers,
  useSavePlatformModel,
  useSavePlatformTemplate,
  useTogglePlatformTool,
  useUpdatePlatformTenant,
  useUpdatePlatformUser,
  type ModelInput,
  type PlatformTicketQuery,
  type TemplateInput,
} from '@/lib/api/endpoints/platform';
import type { BusinessTypeId, CatalogStatus, Limits, PlatformBusiness, PlatformModel, PlatformTemplate, TemplateVariable, TicketPriority, TicketStatus } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { dayRange, formatCompact, formatCurrency, formatDate, formatMs, formatNumber, formatRelative, formatPerM, pluralize } from '@/lib/format';
import { scopePath } from '@/lib/session/scope-context';
import { BUILTIN_VARIABLES, renderTemplate, templateKeys } from '@/lib/template';
import { OpenRouterPicker, priceDiffers } from './OpenRouterPicker';
import { useOpenRouterModels } from '@/lib/openrouter';
import { useDebounce } from '@/hooks';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LimitBar,
  LoadMore,
  Page,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  SkeletonRows,
  Switch,
  Textarea,
  Tip,
  useConfirm,
  type Column,
  type Tone,
} from '@/components/ui';
import { BarList, TrendChart } from '@/components/charts';
import { StatCard } from '@/components/domain/StatCard';
import { PRIORITIES, PRIORITY, PriorityBadge, RoleBadge, TICKET_STATUS, TICKET_STATUSES, TicketStatusBadge } from '@/components/domain/badges';

const STATUS_TONE: Record<CatalogStatus, Tone> = { active: 'live', hidden: 'warn', retired: 'neutral' };

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
      <Input size="sm" className="pl-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export function PlatformOverview() {
  const q = usePlatformOverview();
  const [metric, setMetric] = useState<'requests' | 'total_tokens' | 'estimated_cost'>('requests');
  const o = q.data;
  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Overview" description="Every business on Truplexy, this month." />
      {q.isError ? (
        <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Businesses" icon={<Building2 />} loading={!o} value={formatNumber(o?.businesses)} sub={o && `${o.suspended_businesses} suspended · ${o.bots} bots`} />
            <StatCard label="People" icon={<Users />} loading={!o} value={formatNumber(o?.users)} sub={o && `${o.platform_admins} platform admins`} />
            <StatCard label="Conversations" icon={<MessagesSquare />} loading={!o} value={formatCompact(o?.conversations_this_month)} sub={o && `${formatCompact(o.replies_this_month)} AI replies this month`} />
            <StatCard label="Open tickets" icon={<Inbox />} loading={!o} value={formatNumber(o?.open_tickets)} sub={o && `${o.needs_reply} need a reply`} tone={o && o.needs_reply > 20 ? 'warn' : undefined} />
          </div>
          <Card
            title="Model usage, last 30 days"
            description={o ? `${formatCurrency(o.cost_this_month)} estimated cost this month.` : undefined}
            actions={
              <Segmented size="xs" label="Metric" value={metric} onChange={setMetric} options={[{ value: 'requests', label: 'Requests' }, { value: 'total_tokens', label: 'Tokens' }, { value: 'estimated_cost', label: 'Cost' }]} />
            }
          >
            {o ? (
              <TrendChart data={o.by_day} kind="bar" series={[{ key: metric, label: metric === 'requests' ? 'Requests' : metric === 'total_tokens' ? 'Tokens' : 'Cost', slot: 1 }]} format={metric === 'estimated_cost' ? formatCurrency : formatNumber} height={260} />
            ) : (
              <Skeleton className="h-[260px]" />
            )}
          </Card>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { to: '/platform/businesses', icon: Building2, title: 'Businesses', text: 'Plans, limits and suspensions.' },
              { to: '/platform/models', icon: Cpu, title: 'Models', text: 'What businesses can choose from.' },
              { to: '/platform/templates', icon: FileText, title: 'Prompt templates', text: 'Starting instructions per business type.' },
            ].map((l) => (
              <Link key={l.to} to={l.to} className="panel flex items-center gap-3 p-4 transition-colors hover:border-line-strong">
                <span className="grid size-10 place-items-center rounded-[12px] bg-accent-soft text-accent"><l.icon className="size-5" /></span>
                <span className="grid flex-1">
                  <span className="font-semibold text-ink">{l.title}</span>
                  <span className="text-xs text-ink-faint">{l.text}</span>
                </span>
                <ArrowUpRight className="size-4 text-ink-faint" />
              </Link>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Businesses                                                          */
/* ------------------------------------------------------------------ */

export function PlatformBusinesses() {
  const q = usePlatformTenants();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      (q.data ?? []).filter(
        (b) =>
          (status === 'all' || b.status === status) &&
          (!search || `${b.name} ${b.id} ${b.owner_email}`.toLowerCase().includes(search.toLowerCase())),
      ),
    [q.data, search, status],
  );
  const columns: Column<PlatformBusiness>[] = [
    {
      key: 'name',
      header: 'Business',
      cell: (b) => (
        <span className="flex items-center gap-3">
          <Avatar name={b.name} size={30} className="rounded-[9px]" />
          <span className="grid min-w-0">
            <span className="truncate font-semibold text-ink">{b.name}</span>
            <span className="truncate font-mono text-xs text-ink-faint">{b.id}</span>
          </span>
        </span>
      ),
    },
    { key: 'owner', header: 'Owner', hideBelowLg: true, cell: (b) => <span className="text-ink-muted">{b.owner_email}</span> },
    { key: 'plan', header: 'Plan', cell: (b) => <Badge tone="accent" className="capitalize">{b.plan}</Badge> },
    { key: 'status', header: 'Status', cell: (b) => <Badge tone={b.status === 'active' ? 'live' : 'warn'} dot>{b.status === 'active' ? 'Active' : 'Suspended'}</Badge> },
    {
      key: 'replies',
      header: 'Replies this month',
      align: 'right',
      cell: (b) => (
        <span className="tabular-nums text-ink-muted">
          {formatCompact(b.usage.replies_this_month)} <span className="text-ink-faint">/ {b.limits.replies_per_month > 0 ? formatCompact(b.limits.replies_per_month) : '∞'}</span>
        </span>
      ),
    },
    { key: 'size', header: 'Team · bots', align: 'right', hideBelowLg: true, cell: (b) => <span className="tabular-nums text-ink-muted">{b.usage.members} · {b.usage.bots}</span> },
    { key: 'created', header: 'Created', align: 'right', hideBelowLg: true, cell: (b) => <span className="text-ink-muted">{formatDate(b.created_at)}</span> },
  ];
  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Businesses" description="Change a business's plan, override its limits, or suspend it." />
      <Card flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, ID or owner" />
          <Segmented size="xs" label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} />
        </div>
        {q.isPending ? (
          <SkeletonRows rows={5} className="p-4" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <DataTable columns={columns} rows={rows} getKey={(b) => b.id} onRowClick={(b) => setOpen(b.id)} selectedKey={open ?? undefined} empty={<EmptyState compact icon={<Search />} title="No businesses match" />} />
        )}
      </Card>
      <BusinessSheet business={q.data?.find((b) => b.id === open)} onClose={() => setOpen(null)} />
    </Page>
  );
}

const LIMIT_FIELDS: { key: keyof Limits; label: string }[] = [
  { key: 'replies_per_month', label: 'AI replies / month' },
  { key: 'bots', label: 'Bots' },
  { key: 'documents_per_bot', label: 'Documents / bot' },
  { key: 'members', label: 'Members' },
];

function BusinessSheet({ business: b, onClose }: { business?: PlatformBusiness; onClose: () => void }) {
  const detail = usePlatformTenantDetail(b?.id ?? null);
  const plans = usePlans();
  const update = useUpdatePlatformTenant();
  const confirm = useConfirm();
  const [plan, setPlan] = useState('');
  const [limits, setLimits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!b) return;
    setPlan(b.plan);
    setLimits(Object.fromEntries(Object.entries(b.limit_overrides ?? {}).map(([k, v]) => [k, String(v)])));
  }, [b]);

  if (!b) return <Sheet open={false} onOpenChange={() => {}} title="" />;
  const d = detail.data;
  const overridesChanged = JSON.stringify(Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== ''))) !== JSON.stringify(Object.fromEntries(Object.entries(b.limit_overrides ?? {}).map(([k, v]) => [k, String(v)])));

  const toggleStatus = () =>
    confirm({
      title: b.status === 'active' ? `Suspend ${b.name}?` : `Reactivate ${b.name}?`,
      description:
        b.status === 'active'
          ? 'Its members are blocked, its chat keys stop working and the assistant stops replying, until you reactivate it.'
          : 'Members, chat keys and AI replies work again right away.',
      confirmLabel: b.status === 'active' ? 'Suspend' : 'Reactivate',
      tone: b.status === 'active' ? 'danger' : 'default',
      typeToConfirm: b.status === 'active' ? b.id : undefined,
      onConfirm: () => update.mutateAsync({ id: b.id, body: { status: b.status === 'active' ? 'suspended' : 'active' } }),
    });

  const saveLimits = () => {
    const out: Partial<Limits> = {};
    for (const f of LIMIT_FIELDS) if (limits[f.key] !== undefined && limits[f.key] !== '') out[f.key] = Math.max(0, Math.min(10_000_000, Math.round(Number(limits[f.key]))));
    update.mutate({ id: b.id, body: { limits: out } });
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={b.name}
      description={`${b.id} · owned by ${b.owner_email}`}
      footer={
        <>
          <Button variant={b.status === 'active' ? 'danger-ghost' : 'ghost'} onClick={() => void toggleStatus()}>
            {b.status === 'active' ? 'Suspend business' : 'Reactivate business'}
          </Button>
          <Button asChild variant="accent" leading={<ArrowUpRight />}>
            <Link to={scopePath({ tenant: b.id, bot: b.first_bot })}>Open business</Link>
          </Button>
        </>
      }
    >
      <div className="grid gap-6">
        {b.status === 'suspended' && <Callout tone="warn" title="Suspended">Members and chat keys are blocked.</Callout>}
        <section className="grid gap-3">
          <p className="mono text-ink-faint">Plan</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Plan" className="min-w-[180px] flex-1">
              <Select value={plan} onChange={(e) => setPlan(e.target.value)} options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
            </Field>
            <Button variant="accent" size="sm" disabled={plan === b.plan} loading={update.isPending && update.variables?.body.plan !== undefined} onClick={() => update.mutate({ id: b.id, body: { plan } })}>
              Change plan
            </Button>
          </div>
        </section>
        <section className="grid gap-3">
          <p className="mono text-ink-faint">Usage</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <LimitBar label="AI replies this month" used={b.usage.replies_this_month} limit={b.limits.replies_per_month} format={formatCompact} />
            <LimitBar label="Members" used={b.usage.members} limit={b.limits.members} />
            <LimitBar label="Bots" used={b.usage.bots} limit={b.limits.bots} />
          </div>
        </section>
        <section className="grid gap-3">
          <p className="mono text-ink-faint">Limit overrides</p>
          <p className="text-xs text-ink-faint">Blank uses the plan's limit; 0 means unlimited. Saving replaces every override.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {LIMIT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input type="number" min={0} max={10_000_000} placeholder={`Plan: ${formatNumber(plans.data?.find((p) => p.id === b.plan)?.limits[f.key])}`} value={limits[f.key] ?? ''} onChange={(e) => setLimits({ ...limits, [f.key]: e.target.value })} />
              </Field>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="xs" variant="soft" disabled={!overridesChanged} loading={update.isPending && update.variables?.body.limits !== undefined} onClick={saveLimits}>
              Save overrides
            </Button>
            {Object.keys(b.limit_overrides ?? {}).length > 0 && (
              <Button size="xs" variant="ghost" onClick={() => update.mutate({ id: b.id, body: { limits: {} } })}>
                Clear all
              </Button>
            )}
          </div>
        </section>
        {detail.isPending ? (
          <SkeletonRows rows={4} />
        ) : detail.isError ? (
          <ErrorState compact error={detail.error} />
        ) : (
          d && (
            <>
              <section className="grid gap-3">
                <p className="mono text-ink-faint">Bots · {d.open_tickets} open tickets</p>
                <ul className="grid gap-2">
                  {d.bots.map((x) => (
                    <li key={x.id} className="grid gap-1 rounded-[12px] border border-line p-3 text-[0.8125rem]">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        <Bot className="size-4 text-accent" /> {x.name} <code className="font-mono text-xs font-normal text-ink-faint">{x.id}</code>
                        {!x.saved && <Badge tone="outline">Never configured</Badge>}
                        {x.own_prompt && <Badge tone="warn">Own prompt</Badge>}
                      </span>
                      <span className="text-xs text-ink-faint">
                        {x.model.split('/').pop()} · {pluralize(x.documents, 'document')} · {pluralize(x.replies_this_month, 'reply', 'replies')} · {formatCurrency(x.cost_this_month)} this month
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="grid gap-3">
                <p className="mono text-ink-faint">Members</p>
                <ul className="grid gap-2">
                  {d.members.map((m) => (
                    <li key={m.user_id} className="flex items-center gap-3 text-[0.8125rem]">
                      <Avatar name={m.name} email={m.email} size={26} />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-medium text-ink">{m.name}</span>
                        <span className="truncate text-xs text-ink-faint">{m.email}</span>
                      </span>
                      <RoleBadge role={m.role} />
                    </li>
                  ))}
                </ul>
              </section>
              {d.audit.length > 0 && (
                <section className="grid gap-3">
                  <p className="mono text-ink-faint">Recent activity</p>
                  <ul className="grid gap-1.5 text-xs">
                    {d.audit.slice(0, 10).map((a) => (
                      <li key={a.id} className="flex gap-2">
                        <span className="font-mono text-ink">{a.action}</span>
                        <span className="truncate text-ink-faint">{a.target}</span>
                        <span className="ml-auto shrink-0 text-ink-faint">{formatRelative(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export function PlatformUsers() {
  const me = useMe();
  const [search, setSearch] = useState('');
  const q = usePlatformUsers(useDebounce(search.trim(), 300));
  const update = useUpdatePlatformUser();
  const confirm = useConfirm();
  const toggle = (id: string, name: string, on: boolean) =>
    confirm({
      title: on ? `Make ${name} a platform admin?` : `Remove ${name}'s platform access?`,
      description: on ? 'They can see and change every business, user, model and template on Truplexy.' : 'They keep their own business memberships.',
      confirmLabel: on ? 'Grant access' : 'Remove access',
      tone: on ? 'default' : 'danger',
      onConfirm: () => update.mutateAsync({ id, platform_admin: on }),
    });

  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Users" description="Everyone with a Truplexy account, most recently seen first." />
      <Card flush>
        <div className="border-b border-line p-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Search email or name" />
        </div>
        {q.isPending ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <DataTable
            rows={q.data}
            getKey={(u) => u.id}
            empty={<EmptyState compact icon={<Search />} title="No one matches" />}
            columns={[
              {
                key: 'user',
                header: 'Person',
                cell: (u) => (
                  <span className="flex items-center gap-3">
                    <Avatar name={u.name} email={u.email} size={30} />
                    <span className="grid min-w-0">
                      <span className="flex items-center gap-1.5 truncate font-semibold text-ink">
                        {u.name} {u.platform_admin && <ShieldCheck className="size-3.5 text-accent" aria-label="Platform admin" />}
                      </span>
                      <span className="truncate text-xs text-ink-faint">{u.email}</span>
                    </span>
                  </span>
                ),
              },
              {
                key: 'memberships',
                header: 'Businesses',
                cell: (u) =>
                  u.memberships.length ? (
                    <span className="flex flex-wrap gap-1">
                      {u.memberships.map((m) => (
                        <Badge key={m.tenant_id} tone="outline">
                          {m.tenant_name} · <span className="capitalize">{m.role}</span>
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-faint">None</span>
                  ),
              },
              { key: 'seen', header: 'Last seen', hideBelowLg: true, cell: (u) => <span className="text-ink-muted">{u.last_seen_at ? formatRelative(u.last_seen_at) : 'Never'}</span> },
              {
                key: 'admin',
                header: 'Platform admin',
                align: 'right',
                cell: (u) => (
                  <Tip content={u.id === me.data?.user.id ? "You can't remove your own access." : undefined}>
                    <span className="inline-flex">
                      <Switch checked={u.platform_admin} disabled={u.id === me.data?.user.id} onCheckedChange={(v) => void toggle(u.id, u.name, v)} />
                    </span>
                  </Tip>
                ),
              },
            ]}
          />
        )}
      </Card>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Tickets                                                             */
/* ------------------------------------------------------------------ */

export function PlatformTickets() {
  const tenants = usePlatformTenants();
  const [f, setF] = useState<PlatformTicketQuery>({ view: 'open' });
  const q = usePlatformTickets(f);
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);
  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Tickets" description="Every business's tickets, read only. Open one to act on it inside its business." />
      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Segmented size="xs" label="View" value={f.view ?? 'all'} onChange={(v) => setF({ ...f, view: v })} options={[{ value: 'open', label: 'Open' }, { value: 'needs_reply', label: 'Needs reply' }, { value: 'escalated', label: 'Escalated' }, { value: 'all', label: 'All' }]} />
          <Select size="sm" className="w-44" aria-label="Business" value={f.tenant ?? ''} onChange={(e) => setF({ ...f, tenant: e.target.value || undefined })} placeholder="All businesses" options={(tenants.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          <Select size="sm" className="w-40" aria-label="Status" value={f.status ?? ''} onChange={(e) => setF({ ...f, status: (e.target.value as TicketStatus) || undefined })} placeholder="Any status" options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS[s].label }))} />
          <Select size="sm" className="w-36" aria-label="Priority" value={f.priority ?? ''} onChange={(e) => setF({ ...f, priority: (e.target.value as TicketPriority) || undefined })} placeholder="Any priority" options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY[p].label }))} />
        </div>
        {q.isPending ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <DataTable
            rows={rows}
            getKey={(t) => t.id}
            empty={<EmptyState compact icon={<Inbox />} title="No tickets here" />}
            footer={<LoadMore hasMore={q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => q.fetchNextPage()} shown={rows.length} />}
            columns={[
              {
                key: 'subject',
                header: 'Ticket',
                cell: (t) => (
                  <span className="grid min-w-0">
                    <span className={cn('truncate text-ink', t.needs_reply ? 'font-bold' : 'font-medium')}>{t.subject}</span>
                    <span className="truncate text-xs text-ink-faint">
                      {t.tenant_name} · {t.bot_id}
                      {t.escalated && ' · escalated'}
                      {t.handed_off && ' · handed off'}
                    </span>
                  </span>
                ),
              },
              { key: 'status', header: 'Status', cell: (t) => <TicketStatusBadge status={t.status} /> },
              { key: 'priority', header: 'Priority', hideBelowLg: true, cell: (t) => <PriorityBadge priority={t.priority} compact /> },
              { key: 'updated', header: 'Updated', align: 'right', cell: (t) => <span className="whitespace-nowrap text-ink-muted">{formatRelative(t.updated_at)}</span> },
              {
                key: 'open',
                header: <span className="sr-only">Open</span>,
                align: 'right',
                cell: (t) => (
                  <Button asChild size="xs" leading={<ArrowUpRight />}>
                    <Link to={scopePath({ tenant: t.tenant_id, bot: t.bot_id }, `tickets/${t.id}`)}>Open</Link>
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

export function PlatformTools() {
  const tenants = usePlatformTenants();
  const [tenant, setTenant] = useState('');
  const q = usePlatformTools(tenant || undefined);
  const toggle = useTogglePlatformTool();
  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Tools" description="Every business's tools, with the last 30 days of calls. Turn one off if it misbehaves; no bot can call it until you turn it back on." />
      <Card flush>
        <div className="border-b border-line p-3">
          <Select size="sm" className="w-56" aria-label="Business" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="All businesses" options={(tenants.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        </div>
        {q.isPending ? (
          <SkeletonRows rows={4} className="p-4" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <DataTable
            rows={q.data}
            getKey={(t) => t.id}
            empty={<EmptyState compact icon={<Wrench />} title="No tools" />}
            columns={[
              {
                key: 'name',
                header: 'Tool',
                cell: (t) => (
                  <span className="grid min-w-0">
                    <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-ink">
                      {t.name} {!t.read_only && <Badge tone="warn" className="px-1.5 py-0 font-sans text-[0.65rem]">Writes</Badge>}
                    </span>
                    <span className="truncate text-xs text-ink-faint">{t.tenant_name}</span>
                  </span>
                ),
              },
              { key: 'url', header: 'Endpoint', hideBelowLg: true, cell: (t) => <span className="block max-w-[320px] truncate font-mono text-xs text-ink-muted">{t.method} {t.url}</span> },
              { key: 'calls', header: 'Calls', align: 'right', cell: (t) => <span className="tabular-nums">{formatNumber(t.calls)}</span> },
              { key: 'errors', header: 'Errors', align: 'right', cell: (t) => <span className={cn('tabular-nums', t.calls && t.errors / t.calls > 0.1 ? 'font-semibold text-danger' : 'text-ink-muted')}>{formatNumber(t.errors)}</span> },
              { key: 'latency', header: 'Avg', align: 'right', hideBelowLg: true, cell: (t) => <span className="tabular-nums text-ink-muted">{formatMs(t.avg_latency_ms)}</span> },
              {
                key: 'enabled',
                header: 'Enabled',
                align: 'right',
                cell: (t) => <Switch checked={!t.disabled} onCheckedChange={(v) => toggle.mutate({ id: t.id, disabled: !v })} />,
              },
            ]}
          />
        )}
      </Card>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Usage                                                               */
/* ------------------------------------------------------------------ */

export function PlatformUsage() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [group, setGroup] = useState<'tenant' | 'model' | 'day'>('tenant');
  const range = useMemo(() => dayRange(Number(days)), [days]);
  const q = usePlatformUsage(range, group);
  const rows = q.data?.data ?? [];
  const total = rows.reduce((a, r) => ({ cost: a.cost + r.estimated_cost, req: a.req + r.requests, tok: a.tok + r.total_tokens }), { cost: 0, req: 0, tok: 0 });
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Usage"
        description={q.data ? `${formatNumber(total.req)} requests · ${formatCompact(total.tok)} tokens · ${formatCurrency(total.cost)} estimated` : 'Model usage across every business.'}
        actions={
          <>
            <Segmented label="Group by" value={group} onChange={setGroup} options={[{ value: 'tenant', label: 'Business' }, { value: 'model', label: 'Model' }, { value: 'day', label: 'Day' }]} />
            <Segmented label="Range" value={days} onChange={setDays} options={[{ value: '7', label: '7d' }, { value: '30', label: '30d' }, { value: '90', label: '90d' }]} />
          </>
        }
      />
      {q.isError ? (
        <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
      ) : (
        <>
          <Card title={group === 'day' ? 'Cost per day' : `Cost by ${group === 'tenant' ? 'business' : 'model'}`}>
            {!q.data ? (
              <Skeleton className="h-[240px]" />
            ) : group === 'day' ? (
              <TrendChart data={rows.map((r) => ({ ...r, date: r.key }))} series={[{ key: 'estimated_cost', label: 'Cost', slot: 1 }]} kind="bar" format={formatCurrency} />
            ) : (
              <BarList items={[...rows].sort((a, b) => b.estimated_cost - a.estimated_cost).slice(0, 10).map((r) => ({ key: r.key, label: r.label, value: r.estimated_cost, hint: `${formatNumber(r.requests)} req` }))} format={formatCurrency} />
            )}
          </Card>
          <Card flush>
            {!q.data ? (
              <SkeletonRows rows={5} className="p-4" />
            ) : (
              <DataTable
                rows={rows}
                getKey={(r) => r.key}
                empty={<EmptyState compact title="No usage in this period" />}
                columns={[
                  { key: 'label', header: group === 'tenant' ? 'Business' : group === 'model' ? 'Model' : 'Day', cell: (r) => <span className="font-medium text-ink">{r.label}</span> },
                  { key: 'req', header: 'Requests', align: 'right', cell: (r) => <span className="tabular-nums">{formatNumber(r.requests)}</span> },
                  { key: 'in', header: 'Input', align: 'right', hideBelowLg: true, cell: (r) => <span className="tabular-nums text-ink-muted">{formatCompact(r.input_tokens)}</span> },
                  { key: 'out', header: 'Output', align: 'right', hideBelowLg: true, cell: (r) => <span className="tabular-nums text-ink-muted">{formatCompact(r.output_tokens)}</span> },
                  { key: 'cache', header: 'Cached', align: 'right', hideBelowLg: true, cell: (r) => <span className="tabular-nums text-ink-muted">{formatCompact(r.cached_tokens)}</span> },
                  { key: 'cost', header: 'Cost', align: 'right', cell: (r) => <span className="tabular-nums font-semibold text-ink">{formatCurrency(r.estimated_cost)}</span> },
                  { key: 'lat', header: 'Latency', align: 'right', hideBelowLg: true, cell: (r) => <span className="tabular-nums text-ink-muted">{formatMs(r.avg_latency_ms)}</span> },
                ]}
              />
            )}
          </Card>
        </>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

const EMPTY_MODEL: ModelInput = {
  id: '',
  label: '',
  description: '',
  input_price_per_mtok: 0,
  output_price_per_mtok: 0,
  context_tokens: 128_000,
  max_output_tokens: 8192,
  supports_tools: true,
  supports_prompt_cache: false,
  status: 'active',
  is_default: false,
  sort_order: 100,
};

export function PlatformModels() {
  const q = usePlatformModels();
  const or = useOpenRouterModels();
  const [edit, setEdit] = useState<PlatformModel | 'new' | null>(null);
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Models"
        description="The models businesses can choose from, with OpenRouter's current list prices beside yours. Models are never deleted: retire one and its bots move to the default."
        actions={<Button variant="accent" leading={<Plus />} onClick={() => setEdit('new')}>Add model</Button>}
      />
      <Card flush>
        {q.isPending ? (
          <SkeletonRows rows={5} className="p-4" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <DataTable
            rows={[...q.data].sort((a, b) => a.sort_order - b.sort_order)}
            getKey={(m) => m.id}
            onRowClick={(m) => setEdit(m)}
            columns={[
              {
                key: 'model',
                header: 'Model',
                cell: (m) => (
                  <span className="grid min-w-0">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      {m.label} {m.is_default && <Badge tone="accent">Default</Badge>}
                    </span>
                    <span className="truncate font-mono text-xs text-ink-faint">{m.id}</span>
                  </span>
                ),
              },
              { key: 'status', header: 'Status', cell: (m) => <Badge tone={STATUS_TONE[m.status]} dot className="capitalize">{m.status}</Badge> },
              { key: 'price', header: 'Your price in / out per M', align: 'right', cell: (m) => <span className="whitespace-nowrap font-mono text-xs tabular-nums text-ink">{formatPerM(m.input_price_per_mtok)} / {formatPerM(m.output_price_per_mtok)}</span> },
              {
                key: 'openrouter',
                header: 'OpenRouter',
                align: 'right',
                cell: (m) => {
                  const p = or.data?.byId.get(m.id);
                  if (!p) return <span className="text-xs text-ink-faint">{or.isPending ? '…' : 'Not listed'}</span>;
                  const drift = priceDiffers(m.input_price_per_mtok, p.inPerM) || priceDiffers(m.output_price_per_mtok, p.outPerM);
                  return (
                    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
                      {drift && <Badge tone="warn" className="px-1.5 py-0 text-[0.65rem]">Differs</Badge>}
                      <span className="font-mono text-xs tabular-nums text-ink-muted">{formatPerM(p.inPerM)} / {formatPerM(p.outPerM)}</span>
                    </span>
                  );
                },
              },
              { key: 'ctx', header: 'Context', align: 'right', hideBelowLg: true, cell: (m) => <span className="tabular-nums text-ink-muted">{formatCompact(m.context_tokens)}</span> },
              { key: 'caps', header: 'Features', hideBelowLg: true, cell: (m) => <span className="flex gap-1">{m.supports_tools && <Badge tone="outline">Tools</Badge>}{m.supports_prompt_cache && <Badge tone="outline">Cache</Badge>}</span> },
              { key: 'bots', header: 'Bots', align: 'right', cell: (m) => <span className="tabular-nums">{m.bots}</span> },
              { key: 'edit', header: <span className="sr-only">Edit</span>, align: 'right', cell: (m) => <Button size="xs" icon variant="quiet" aria-label={`Edit ${m.label}`} onClick={() => setEdit(m)}><Pencil /></Button> },
            ]}
          />
        )}
      </Card>
      <ModelSheet model={edit} onClose={() => setEdit(null)} />
    </Page>
  );
}

function ModelSheet({ model, onClose }: { model: PlatformModel | 'new' | null; onClose: () => void }) {
  const save = useSavePlatformModel();
  const confirm = useConfirm();
  const or = useOpenRouterModels();
  const existing = model && model !== 'new' ? model : null;
  const [m, setM] = useState<ModelInput>(EMPTY_MODEL);
  useEffect(() => {
    if (!model) return;
    if (existing) {
      const { bots: _b, created_at: _c, updated_at: _u, ...rest } = existing;
      setM(rest);
    } else setM(EMPTY_MODEL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const set = <K extends keyof ModelInput>(k: K, v: ModelInput[K]) => setM((x) => ({ ...x, [k]: v }));
  const num = (k: keyof ModelInput) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);
  const listed = or.data?.byId.get(m.id);
  const drift = listed && (priceDiffers(m.input_price_per_mtok, listed.inPerM) || priceDiffers(m.output_price_per_mtok, listed.outPerM));
  const fill = (p: NonNullable<typeof listed>) =>
    setM((x) => ({
      ...x,
      id: p.id,
      label: x.label || p.name.replace(/^[^:]+:\s*/, '').slice(0, 80),
      description: x.description || p.description.split(/(?<=\.)\s/)[0]!.slice(0, 300),
      input_price_per_mtok: p.inPerM,
      output_price_per_mtok: p.outPerM,
      context_tokens: p.context,
      max_output_tokens: p.maxOutput ?? 0,
      supports_tools: p.tools,
    }));
  const valid = /^[a-z0-9-]+\/[a-z0-9._:-]+$/i.test(m.id) && m.label.trim().length > 0 && !(m.is_default && m.status !== 'active');

  const submit = async () => {
    if (existing && existing.bots > 0 && m.status === 'retired' && existing.status !== 'retired') {
      const ok = await confirm({
        title: `Retire ${existing.label}?`,
        description: `${existing.bots} bots use it. They move to the default model right away.`,
        confirmLabel: 'Retire model',
        tone: 'danger',
      });
      if (!ok) return;
    }
    save.mutate({ existing: Boolean(existing), body: m }, { onSuccess: onClose });
  };

  return (
    <Sheet
      open={Boolean(model)}
      onOpenChange={(o) => !o && onClose()}
      width="md"
      title={existing ? existing.label : 'Add model'}
      description={existing ? `${pluralize(existing.bots, 'bot')} use${existing.bots === 1 ? 's' : ''} this model.` : 'Any OpenRouter model ID.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" loading={save.isPending} disabled={!valid} onClick={() => void submit()}>Save model</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {!existing && (
          <Field label="Start from OpenRouter" optional hint="Fills the ID, name, prices, context and tool support. You can change any of it.">
            <OpenRouterPicker onPick={fill} />
          </Field>
        )}
        <Field label="Model ID" hint="vendor/model, as on OpenRouter. Can't change later.">
          <Input value={m.id} disabled={Boolean(existing)} className="font-mono" onChange={(e) => set('id', e.target.value.trim())} placeholder="google/gemini-3.1-flash-lite" />
        </Field>
        <Field label="Label" aside={`${m.label.length}/80`}>
          <Input value={m.label} onChange={(e) => set('label', e.target.value.slice(0, 80))} />
        </Field>
        <Field label="Description" optional aside={`${m.description.length}/300`} hint="Businesses see this when choosing.">
          <Textarea rows={2} value={m.description} onChange={(e) => set('description', e.target.value.slice(0, 300))} />
        </Field>
        {listed && drift && (
          <Callout tone="warn" title="OpenRouter's list price is different">
            OpenRouter lists {formatPerM(listed.inPerM)} in / {formatPerM(listed.outPerM)} out per million tokens.
            <Button
              size="xs"
              className="mt-2"
              onClick={() => setM((x) => ({ ...x, input_price_per_mtok: listed.inPerM, output_price_per_mtok: listed.outPerM }))}
            >
              Use OpenRouter prices
            </Button>
          </Callout>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Input $ / M tokens"><Input type="number" min={0} step="0.01" value={m.input_price_per_mtok} onChange={num('input_price_per_mtok')} /></Field>
          <Field label="Output $ / M tokens"><Input type="number" min={0} step="0.01" value={m.output_price_per_mtok} onChange={num('output_price_per_mtok')} /></Field>
          <Field label="Context tokens"><Input type="number" min={0} value={m.context_tokens} onChange={num('context_tokens')} /></Field>
          <Field label="Max output" hint="0 = no cap"><Input type="number" min={0} value={m.max_output_tokens} onChange={num('max_output_tokens')} /></Field>
          <Field label="Sort order" hint="Lower shows first"><Input type="number" value={m.sort_order} onChange={num('sort_order')} /></Field>
          <Field label="Status">
            <Select value={m.status} onChange={(e) => set('status', e.target.value as CatalogStatus)} options={[{ value: 'active', label: 'Active (offered)' }, { value: 'hidden', label: 'Hidden (kept by bots)' }, { value: 'retired', label: 'Retired' }]} />
          </Field>
        </div>
        <Switch checked={m.supports_tools} onCheckedChange={(v) => set('supports_tools', v)} label="Supports tool calls" />
        <Switch checked={m.supports_prompt_cache} onCheckedChange={(v) => set('supports_prompt_cache', v)} label="Prompt caching" description="Sends the system prompt as a cache breakpoint." />
        <Switch checked={m.is_default} disabled={m.status !== 'active'} onCheckedChange={(v) => set('is_default', v)} label="Default model" description="Used by bots with no model chosen. Must be active." />
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Prompt templates                                                    */
/* ------------------------------------------------------------------ */

const EMPTY_TEMPLATE: TemplateInput = { name: '', description: '', body: 'You are {{assistant_name}}, the support assistant for {{business_name}}.\n', variables: [], business_types: [], status: 'active', is_default: false };

export function PlatformTemplates() {
  const q = usePlatformTemplates();
  const types = useBusinessTypes();
  const [edit, setEdit] = useState<PlatformTemplate | 'new' | null>(null);
  const typeLabel = (id: BusinessTypeId) => types.data?.find((t) => t.id === id)?.label ?? id;
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Prompt templates"
        description="Starting instructions businesses pick from. Truplexy's fixed instructions are always placed before them."
        actions={<Button variant="accent" leading={<Plus />} onClick={() => setEdit('new')}>New template</Button>}
      />
      {q.data && q.data.own_prompt_bots > 0 && (
        <Callout tone="neutral" icon={<FileText />}>{pluralize(q.data.own_prompt_bots, 'bot')} still use an older, pre-template prompt.</Callout>
      )}
      {q.isPending ? (
        <Card><SkeletonRows rows={4} /></Card>
      ) : q.isError ? (
        <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {q.data.templates.map((t) => (
            <button key={t.id} type="button" onClick={() => setEdit(t)} className="panel grid content-start gap-2 p-4 text-left transition-colors hover:border-line-strong">
              <span className="flex flex-wrap items-center gap-2">
                <span className="flex-1 font-semibold text-ink">{t.name}</span>
                {t.is_default && <Badge tone="accent">Default</Badge>}
                <Badge tone={STATUS_TONE[t.status]} dot className="capitalize">{t.status}</Badge>
              </span>
              <span className="text-[0.8125rem] text-ink-muted">{t.description}</span>
              <span className="flex flex-wrap gap-1.5 pt-1 text-xs text-ink-faint">
                <span>v{t.version}</span>·<span>{pluralize(t.variables.length, 'field')}</span>·<span>{pluralize(t.bots, 'bot')}</span>·
                <span>{t.business_types.length ? t.business_types.map(typeLabel).join(', ') : 'Every business type'}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <TemplateSheet template={edit} onClose={() => setEdit(null)} />
    </Page>
  );
}

function TemplateSheet({ template, onClose }: { template: PlatformTemplate | 'new' | null; onClose: () => void }) {
  const save = useSavePlatformTemplate();
  const types = useBusinessTypes();
  const existing = template && template !== 'new' ? template : null;
  const [t, setT] = useState<TemplateInput>(EMPTY_TEMPLATE);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  useEffect(() => {
    if (!template) return;
    setTab('edit');
    setT(existing ? { name: existing.name, description: existing.description, body: existing.body, variables: existing.variables, business_types: existing.business_types, status: existing.status, is_default: existing.is_default } : EMPTY_TEMPLATE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  const set = <K extends keyof TemplateInput>(k: K, v: TemplateInput[K]) => setT((x) => ({ ...x, [k]: v }));
  const setVar = (i: number, p: Partial<TemplateVariable>) => set('variables', t.variables.map((v, j) => (j === i ? { ...v, ...p } : v)));

  const problems = useMemo(() => {
    const out: string[] = [];
    const declared = new Set([...t.variables.map((v) => v.key), ...BUILTIN_VARIABLES]);
    const unknown = templateKeys(t.body).filter((k) => !declared.has(k));
    if (unknown.length) out.push(`Declare ${unknown.map((k) => `{{${k}}}`).join(', ')} as fields, or remove them.`);
    const opens = [...t.body.matchAll(/\{\{#([a-z0-9_]+)\}\}/g)].map((m) => m[1]);
    const closes = [...t.body.matchAll(/\{\{\/([a-z0-9_]+)\}\}/g)].map((m) => m[1]);
    if (opens.length !== closes.length || opens.some((k, i) => closes[i] !== k)) out.push('Every {{#key}} section needs a matching {{/key}}, without nesting.');
    if (t.variables.some((v) => !/^[a-z][a-z0-9_]*$/.test(v.key))) out.push('Field keys are lowercase words with underscores.');
    if (t.variables.some((v) => (BUILTIN_VARIABLES as readonly string[]).includes(v.key))) out.push('business_name and assistant_name are built in; don\'t declare them.');
    if (new Set(t.variables.map((v) => v.key)).size !== t.variables.length) out.push('Field keys must be unique.');
    if (t.is_default && (t.status !== 'active' || t.business_types.length)) out.push('The default template must be active and offered to every business type.');
    return out;
  }, [t]);

  const preview = useMemo(
    () => renderTemplate(t.body, { business_name: 'Acme Store', assistant_name: 'Ava', ...Object.fromEntries(t.variables.map((v) => [v.key, `‹${v.label || v.key}›`])) }),
    [t.body, t.variables],
  );
  const valid = t.name.trim() && t.body.trim() && !problems.length;

  return (
    <Sheet
      open={Boolean(template)}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={existing ? existing.name : 'New template'}
      description={existing ? `Version ${existing.version} · ${pluralize(existing.bots, 'bot')}. Changing the body or fields raises the version.` : 'Write the instructions; businesses fill in the fields.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" loading={save.isPending} disabled={!valid} onClick={() => save.mutate({ id: existing?.id, body: { ...t, description: t.description || undefined } }, { onSuccess: onClose })}>
            Save template
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" aside={`${t.name.length}/80`}>
            <Input value={t.name} onChange={(e) => set('name', e.target.value.slice(0, 80))} />
          </Field>
          <Field label="Status">
            <Select value={t.status} onChange={(e) => set('status', e.target.value as CatalogStatus)} options={[{ value: 'active', label: 'Active' }, { value: 'hidden', label: 'Hidden' }, { value: 'retired', label: 'Retired' }]} />
          </Field>
        </div>
        <Field label="Description" optional aside={`${(t.description ?? '').length}/300`}>
          <Input value={t.description ?? ''} onChange={(e) => set('description', e.target.value.slice(0, 300))} />
        </Field>
        <div className="grid gap-2">
          <span className="text-[0.8125rem] font-semibold text-ink">Offered to</span>
          <div className="flex flex-wrap gap-2">
            <Checkbox label="Every type" checked={!t.business_types.length} onChange={(e) => e.target.checked && set('business_types', [])} />
            {(types.data ?? []).map((bt) => (
              <Checkbox
                key={bt.id}
                label={bt.label}
                checked={t.business_types.includes(bt.id)}
                onChange={(e) => set('business_types', e.target.checked ? [...t.business_types, bt.id] : t.business_types.filter((x) => x !== bt.id))}
              />
            ))}
          </div>
        </div>
        <Switch checked={t.is_default} onCheckedChange={(v) => set('is_default', v)} label="Default template" description="Used when a business type has no template of its own." />

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.8125rem] font-semibold text-ink">Fields businesses fill in</span>
            <Button size="xs" leading={<Plus />} disabled={t.variables.length >= 20} onClick={() => set('variables', [...t.variables, { key: '', label: '', required: false, max_length: 200 }])}>
              Add field
            </Button>
          </div>
          {t.variables.map((v, i) => (
            <div key={i} className="grid gap-2 rounded-[12px] border border-line p-3 sm:grid-cols-[1fr_1fr_90px_auto]">
              <Input size="sm" className="font-mono" placeholder="key" value={v.key} onChange={(e) => setVar(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} aria-label="Key" />
              <Input size="sm" placeholder="Label" value={v.label} onChange={(e) => setVar(i, { label: e.target.value.slice(0, 80) })} aria-label="Label" />
              <Input size="sm" type="number" min={1} max={2000} value={v.max_length} onChange={(e) => setVar(i, { max_length: Number(e.target.value) })} aria-label="Max length" />
              <div className="flex items-center gap-2">
                <Checkbox label="Required" checked={v.required} onChange={(e) => setVar(i, { required: e.target.checked })} />
                <Button size="xs" icon variant="quiet" aria-label="Remove field" onClick={() => set('variables', t.variables.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              <Input size="sm" className="sm:col-span-4" placeholder="Help text (optional)" value={v.help ?? ''} onChange={(e) => setVar(i, { help: e.target.value.slice(0, 200) || undefined })} aria-label="Help" />
            </div>
          ))}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.8125rem] font-semibold text-ink">Body</span>
            <Segmented size="xs" label="Body view" value={tab} onChange={setTab} options={[{ value: 'edit', label: 'Edit' }, { value: 'preview', label: 'Preview' }]} />
          </div>
          {tab === 'edit' ? (
            <Textarea rows={14} className="font-mono text-xs" value={t.body} onChange={(e) => set('body', e.target.value.slice(0, 20_000))} spellCheck={false} />
          ) : (
            <pre className="max-h-[400px] overflow-y-auto whitespace-pre-wrap rounded-[12px] border border-line bg-surface-2/50 p-4 text-[0.8125rem] text-ink">{preview}</pre>
          )}
          <p className="text-xs text-ink-faint">
            {'{{key}}'} inserts a field; {'{{#key}}…{{/key}}'} keeps text only when the field is filled. Built in: {'{{business_name}}'}, {'{{assistant_name}}'}.
          </p>
        </div>
        {problems.length > 0 && (
          <Callout tone="warn" title="Fix before saving">
            <ul className="list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </Callout>
        )}
      </div>
    </Sheet>
  );
}


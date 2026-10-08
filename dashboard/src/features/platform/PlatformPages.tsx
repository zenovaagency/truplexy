import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Building2,
  Cpu,
  FileText,
  Inbox,
  MessagesSquare,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Shapes,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useBusinessTypes, useMe, usePlans } from '@/lib/api/endpoints/account';
import {
  useAdjustBalance,
  useApproveDeletion,
  useDeletedTenants,
  useDeleteTenant,
  usePlatformChannels,
  usePlatformChannelTypes,
  usePlatformDeletionRequests,
  usePlatformModels,
  usePlatformOverview,
  usePlatformTemplates,
  usePlatformTenantDetail,
  usePlatformTenants,
  usePlatformTickets,
  usePlatformTools,
  usePlatformUsage,
  usePlatformUsers,
  useRefreshAllPricing,
  useRefreshModelPricing,
  useRejectDeletion,
  useRestoreTenant,
  useSavePlatformChannelType,
  useSavePlatformModel,
  useSavePlatformTemplate,
  useTogglePlatformChannel,
  useTogglePlatformTool,
  useUpdatePlatformTenant,
  useUpdatePlatformUser,
  type ChannelTypeInput,
  type DeletionRequestFilter,
  type ModelInput,
  type PlatformChannelQuery,
  type PlatformTicketQuery,
  type TemplateInput,
} from '@/lib/api/endpoints/platform';
import type {
  BusinessTypeId,
  CatalogStatus,
  DeletionRequest,
  Limits,
  PlatformBusiness,
  PlatformChannel,
  PlatformChannelType,
  PlatformModel,
  PlatformTemplate,
  TemplateVariable,
  TenantDeletion,
  TicketPriority,
  TicketStatus,
} from '@/lib/api/types';
import { planUsage } from '@/lib/billing';
import { cn } from '@/lib/cn';
import { dayRange, formatCompact, formatCurrency, formatDate, formatMs, formatNumber, formatRelative, formatPerM, pluralize } from '@/lib/format';
import { scopeLink } from '@/lib/session/scope-context';
import { BUILTIN_VARIABLES, renderTemplate, templateKeys } from '@/lib/template';
import { OpenRouterPicker, priceDiffers } from './OpenRouterPicker';
import { notifyInfo, notifySuccess } from '@/lib/notify';
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
import { ChannelBadge, ChannelStatusBadge, ChannelTypeIcon } from '@/components/domain/ChannelBadge';
import { StatCard } from '@/components/domain/StatCard';
import { ReasonDialog } from '@/components/domain/ReasonDialog';
import { PRIORITIES, PRIORITY, PriorityBadge, RoleBadge, TICKET_STATUS, TICKET_STATUSES, TicketStatusBadge } from '@/components/domain/badges';

const STATUS_TONE: Record<CatalogStatus, Tone> = { active: 'live', hidden: 'warn', retired: 'neutral' };

/** Known plans cheapest first; any other plan sorts after them. */
const PLAN_ORDER = ['free', 'starter', 'pro', 'enterprise'];
const planRank = (plan: string) => (PLAN_ORDER.includes(plan) ? PLAN_ORDER.indexOf(plan) : PLAN_ORDER.length);

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
  const pending = usePlatformDeletionRequests('pending').data ?? [];
  const tenants = usePlatformTenants();
  const [metric, setMetric] = useState<'requests' | 'total_tokens' | 'estimated_cost'>('requests');
  const o = q.data;
  const last30 = useMemo(
    () => o && { tokens: o.by_day.reduce((n, d) => n + d.total_tokens, 0), requests: o.by_day.reduce((n, d) => n + d.requests, 0) },
    [o],
  );
  const fleet = useMemo(() => {
    if (!tenants.data) return undefined;
    const live = liveBusinesses(tenants.data);
    const month = new Date().toISOString().slice(0, 7);
    const plans = new Map<string, number>();
    for (const b of live) plans.set(b.plan, (plans.get(b.plan) ?? 0) + 1);
    const shares = live.filter((b) => b.status === 'active').map((b) => planUsage(b)?.share ?? 0);
    return {
      newThisMonth: live.filter((b) => b.created_at.slice(0, 7) === month).length,
      planMix: [...plans]
        .sort(([a], [b]) => planRank(a) - planRank(b))
        .map(([plan, n]) => `${n} ${plan}`)
        .join(' · '),
      nearLimit: shares.filter((s) => s >= 0.8).length,
      atLimit: shares.filter((s) => s >= 1).length,
    };
  }, [tenants.data]);
  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Overview" description="Every business on Truplexy, this month." />
      {q.isError ? (
        <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
      ) : (
        <>
          {pending.length > 0 && (
            <Callout
              tone="warn"
              icon={<AlertTriangle />}
              title={`${pluralize(pending.length, 'deletion request')} waiting`}
              action={
                <Button asChild size="xs" leading={<ArrowUpRight />}>
                  <Link to="/platform/deletions">Review</Link>
                </Button>
              }
            >
              {pending
                .slice(0, 3)
                .map((r) => r.tenant_name)
                .join(', ')}
              {pending.length > 3 && ` and ${pending.length - 3} more`} asked to be deleted.
            </Callout>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Businesses"
              icon={<Building2 />}
              loading={!o}
              value={formatNumber(o?.businesses)}
              sub={o && `${o.suspended_businesses} suspended · ${o.deleted_businesses ?? 0} deleted · ${o.bots} bots`}
            />
            <StatCard label="People" icon={<Users />} loading={!o} value={formatNumber(o?.users)} sub={o && `${o.platform_admins} platform admins`} />
            <StatCard label="Conversations" icon={<MessagesSquare />} loading={!o} value={formatCompact(o?.conversations_this_month)} sub={o && `${formatCompact(o.replies_this_month)} AI replies this month`} />
            <StatCard label="Open tickets" icon={<Inbox />} loading={!o} value={formatNumber(o?.open_tickets)} sub={o && `${o.needs_reply} need a reply`} tone={o && o.needs_reply > 20 ? 'warn' : undefined} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Billed this month"
              icon={<Wallet />}
              loading={!o}
              value={formatCurrency(o?.billed_this_month)}
              sub={o && `${formatCurrency(o.cost_this_month)} OpenRouter cost · ${formatCurrency(o.billed_this_month - o.cost_this_month)} margin`}
              info="What businesses were billed for models this UTC month: OpenRouter's cost plus fees and commissions."
            />
            <StatCard
              label="Tokens, last 30 days"
              icon={<Cpu />}
              loading={!last30}
              value={formatCompact(last30?.tokens)}
              sub={last30 && `${formatCompact(last30.requests)} model requests`}
              trend={o?.by_day.map((d) => d.total_tokens)}
            />
            <StatCard
              label="New this month"
              icon={<Plus />}
              loading={!fleet}
              value={formatNumber(fleet?.newThisMonth)}
              sub={fleet && (fleet.planMix ? `All businesses: ${fleet.planMix}` : 'No businesses yet')}
            />
            <StatCard
              label="Near a limit"
              icon={<AlertTriangle />}
              loading={!fleet}
              value={formatNumber(fleet?.nearLimit)}
              sub={fleet && (fleet.nearLimit ? `${fleet.atLimit} at their limit` : 'Every business has room')}
              tone={fleet && fleet.atLimit > 0 ? 'warn' : undefined}
              info="Active businesses that have used 80% or more of this month's token or reply limit."
            />
          </div>
          <Card
            title="Model usage, last 30 days"
            description="The chart shows OpenRouter's cost."
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { to: '/platform/businesses', icon: Building2, title: 'Businesses', text: 'Plans, limits and suspensions.' },
              { to: '/platform/deletions', icon: Trash2, title: 'Deletions', text: 'Owner requests and restores.' },
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
  const [status, setStatus] = useState<'all' | 'active' | 'suspended' | 'deleted'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      (q.data ?? []).filter(
        (b) =>
          (status === 'deleted' ? Boolean(b.deleted_at) : !b.deleted_at && (status === 'all' || b.status === status)) &&
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
    { key: 'status', header: 'Status', cell: (b) => <BusinessStatusBadge business={b} /> },
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
    {
      key: 'tokens',
      header: 'Tokens',
      align: 'right',
      hideBelowLg: true,
      cell: (b) => (
        <span className="tabular-nums text-ink-muted">
          {formatCompact(b.usage.tokens_this_month)} <span className="text-ink-faint">/ {b.limits.tokens_per_month > 0 ? formatCompact(b.limits.tokens_per_month) : '∞'}</span>
        </span>
      ),
    },
    { key: 'balance', header: 'Balance', align: 'right', cell: (b) => <span className="font-mono tabular-nums text-ink">{formatCurrency(b.balance)}</span> },
    { key: 'size', header: 'Team · bots', align: 'right', hideBelowLg: true, cell: (b) => <span className="tabular-nums text-ink-muted">{b.usage.members} · {b.usage.bots}</span> },
    { key: 'created', header: 'Created', align: 'right', hideBelowLg: true, cell: (b) => <span className="text-ink-muted">{formatDate(b.created_at)}</span> },
  ];
  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Businesses" description="Change a business's plan, override its limits, top up its balance, suspend it or delete it." />
      <Card flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, ID or owner" />
          <Segmented
            size="xs"
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'deleted', label: 'Deleted' },
            ]}
          />
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

function BusinessStatusBadge({ business: b }: { business: PlatformBusiness }) {
  if (b.deleted_at) return <Badge tone="danger" dot>Deleted</Badge>;
  return <Badge tone={b.status === 'active' ? 'live' : 'warn'} dot>{b.status === 'active' ? 'Active' : 'Suspended'}</Badge>;
}

/** Businesses that can still be filtered on: deleted ones have nothing to show. */
const liveBusinesses = (list: PlatformBusiness[] | undefined) => (list ?? []).filter((t) => !t.deleted_at);

const LIMIT_FIELDS: { key: keyof Limits; label: string; max: number }[] = [
  { key: 'replies_per_month', label: 'AI replies / month', max: 10_000_000 },
  { key: 'tokens_per_month', label: 'Tokens / month', max: 100_000_000_000 },
  { key: 'bots', label: 'Bots', max: 10_000_000 },
  { key: 'documents_per_bot', label: 'Documents / bot', max: 10_000_000 },
  { key: 'members', label: 'Members', max: 10_000_000 },
];

function BusinessSheet({ business: b, onClose }: { business?: PlatformBusiness; onClose: () => void }) {
  // A deleted business has no detail to read until it is restored.
  const detail = usePlatformTenantDetail(b && !b.deleted_at ? b.id : null);
  const plans = usePlans();
  const update = useUpdatePlatformTenant();
  const remove = useDeleteTenant();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [plan, setPlan] = useState('');
  const [limits, setLimits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!b) return;
    setPlan(b.plan);
    setLimits(Object.fromEntries(Object.entries(b.limit_overrides ?? {}).map(([k, v]) => [k, String(v)])));
  }, [b]);

  if (!b) return <Sheet open={false} onOpenChange={() => {}} title="" />;
  if (b.deleted_at) return <DeletedBusinessSheet business={b} onClose={onClose} />;
  const d = detail.data;
  const protectedBusiness = b.id === 'default';
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
    for (const f of LIMIT_FIELDS) if (limits[f.key] !== undefined && limits[f.key] !== '') out[f.key] = Math.max(0, Math.min(f.max, Math.round(Number(limits[f.key]))));
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
          <Tip content={protectedBusiness ? "The default business can't be deleted." : undefined}>
            <span className="mr-auto inline-flex">
              <Button variant="danger-ghost" leading={<Trash2 />} disabled={protectedBusiness} onClick={() => setDeleting(true)}>
                Delete
              </Button>
            </span>
          </Tip>
          <Button variant={b.status === 'active' ? 'danger-ghost' : 'ghost'} onClick={() => void toggleStatus()}>
            {b.status === 'active' ? 'Suspend business' : 'Reactivate business'}
          </Button>
          <Button asChild variant="accent" leading={<ArrowUpRight />}>
            <Link {...scopeLink({ tenant: b.id, bot: b.first_bot })}>Open business</Link>
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
            <LimitBar label="Tokens this month (plan)" used={b.usage.tokens_this_month} limit={b.limits.tokens_per_month} format={formatCompact} />
            <LimitBar label="Members" used={b.usage.members} limit={b.limits.members} />
            <LimitBar label="Bots" used={b.usage.bots} limit={b.limits.bots} />
          </div>
        </section>
        <BalanceSection business={b} />
        <section className="grid gap-3">
          <p className="mono text-ink-faint">Limit overrides</p>
          <p className="text-xs text-ink-faint">Blank uses the plan's limit; 0 means unlimited. Saving replaces every override.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {LIMIT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input type="number" min={0} max={f.max} placeholder={`Plan: ${formatNumber(plans.data?.find((p) => p.id === b.plan)?.limits[f.key])}`} value={limits[f.key] ?? ''} onChange={(e) => setLimits({ ...limits, [f.key]: e.target.value })} />
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
                        {x.model.split('/').pop()} · {pluralize(x.documents, 'document')} · {pluralize(x.replies_this_month, 'reply', 'replies')} · {formatCurrency(x.cost_this_month)} cost, {formatCurrency(x.billed_this_month)} billed this month
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
      <ReasonDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${b.name}?`}
        description="Nobody can reach it, its chat keys stop working within a minute, and it leaves its members' business lists. You can restore it for 30 days; after that everything it had is erased."
        label="Reason"
        hint="Kept with the deletion record."
        typeToConfirm={b.id}
        confirmLabel="Delete business"
        tone="danger"
        onSubmit={(reason) => remove.mutateAsync({ id: b.id, reason })}
      />
    </Sheet>
  );
}

/** A deleted business: nothing to change, only the way back. */
function DeletedBusinessSheet({ business: b, onClose }: { business: PlatformBusiness; onClose: () => void }) {
  const deletions = useDeletedTenants();
  const d = deletions.data?.find((x) => x.tenant_id === b.id && x.state === 'deleted');
  const restore = useRestoreConfirm();
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={b.name}
      description={`${b.id} · owned by ${b.owner_email}`}
      footer={
        <Button variant="accent" leading={<RotateCcw />} disabled={!d?.restorable} onClick={() => d && void restore(d)}>
          Restore business
        </Button>
      }
    >
      <div className="grid gap-6">
        <Callout tone="danger" icon={<Trash2 />} title={`Deleted ${formatDate(b.deleted_at!)}`}>
          {d ? (
            <>
              {d.restorable ? `It can be restored until ${formatDate(d.restore_until)}, ${daysLeft(d.restore_until)} from now. After that it is erased.` : 'Its restore window has passed; it is erased on the next daily run.'}
              {d.reason && <span className="mt-1 block italic">“{d.reason}”</span>}
              {d.deleted_by_email && <span className="mt-1 block text-xs">Deleted by {d.deleted_by_email}{d.request_id ? ', on the owner\'s request' : ''}.</span>}
            </>
          ) : deletions.isPending ? (
            'Reading the deletion record…'
          ) : (
            'Nobody can reach it until it is restored.'
          )}
        </Callout>
        {deletions.isError && <ErrorState compact error={deletions.error} onRetry={() => deletions.refetch()} />}
        <section className="grid gap-3">
          <p className="mono text-ink-faint">When it was deleted</p>
          <dl className="grid gap-3 text-[0.8125rem] sm:grid-cols-3">
            <div>
              <dt className="text-ink-faint">Plan</dt>
              <dd className="capitalize text-ink">{b.plan}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Team · bots</dt>
              <dd className="tabular-nums text-ink">
                {b.usage.members} · {b.usage.bots}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Balance</dt>
              <dd className="font-mono tabular-nums text-ink">{formatCurrency(b.balance)}</dd>
            </div>
          </dl>
          <p className="text-xs text-ink-faint">Restoring brings it back exactly as it was, with its members, bots, keys and balance.</p>
        </section>
      </div>
    </Sheet>
  );
}

/** Confirms, then restores a deleted business. */
function useRestoreConfirm() {
  const restore = useRestoreTenant();
  const confirm = useConfirm();
  return (d: TenantDeletion) =>
    confirm({
      title: `Restore ${d.tenant_name}?`,
      description: 'It comes back exactly as it was: its members reach it again and its chat keys work again.',
      confirmLabel: 'Restore business',
      onConfirm: () => restore.mutateAsync(d.tenant_id),
    });
}

/** Credit or debit a business's balance; there is no payment provider. */
function BalanceSection({ business: b }: { business: PlatformBusiness }) {
  const adjust = useAdjustBalance();
  const confirm = useConfirm();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    setAmount('');
    setNote('');
  }, [b.id]);

  const n = Math.round(Number(amount) * 100) / 100;
  const validAmount = Number.isFinite(n) && n > 0 && n <= 1_000_000;
  const validNote = note.trim().length >= 1 && note.trim().length <= 200;

  const submit = (sign: 1 | -1) =>
    confirm({
      title: sign > 0 ? `Credit ${formatCurrency(n)} to ${b.name}?` : `Debit ${formatCurrency(n)} from ${b.name}?`,
      description: `The balance goes from ${formatCurrency(b.balance)} to ${formatCurrency(b.balance + sign * n)}. "${note.trim()}" shows in the business's balance history.`,
      confirmLabel: sign > 0 ? 'Credit' : 'Debit',
      tone: sign > 0 ? 'default' : 'danger',
      onConfirm: () =>
        adjust.mutateAsync({ id: b.id, amount: sign * n, note: note.trim() }).then(() => {
          setAmount('');
          setNote('');
        }),
    });

  return (
    <section className="grid gap-3">
      <p className="mono text-ink-faint">Balance</p>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-[12px] bg-accent-soft text-accent">
          <Wallet className="size-5" />
        </span>
        <span className="grid">
          <span className="font-mono text-xl font-semibold tabular-nums text-ink">{formatCurrency(b.balance)}</span>
          <span className="text-xs text-ink-faint">Pays for extra tokens and for replies past the month's tokens.</span>
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <Field label="Amount (USD)">
          <Input type="number" min={0.01} max={1_000_000} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100.00" />
        </Field>
        <Field label="Note" aside={`${note.length}/200`} hint="Shown in the business's history, such as a bank transfer reference.">
          <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Bank transfer INV-1100" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button size="xs" variant="soft" disabled={!validAmount || !validNote} loading={adjust.isPending && (adjust.variables?.amount ?? 0) > 0} onClick={() => void submit(1)}>
          Credit
        </Button>
        <Button size="xs" variant="danger-ghost" disabled={!validAmount || !validNote || n > b.balance} loading={adjust.isPending && (adjust.variables?.amount ?? 0) < 0} onClick={() => void submit(-1)}>
          Debit
        </Button>
        {validAmount && n > b.balance && <span className="self-center text-xs text-ink-faint">A debit can't take the balance below zero.</span>}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Deletions                                                           */
/* ------------------------------------------------------------------ */

const REQUEST_STATUS: Record<DeletionRequest['status'], { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warn' },
  approved: { label: 'Approved', tone: 'danger' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  cancelled: { label: 'Withdrawn', tone: 'outline' },
};

export function PlatformDeletions() {
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Deletions"
        description="Owners' requests to delete their business, and deleted businesses. A deleted business can be restored for 30 days; then a daily job erases it. People's accounts are kept."
      />
      <DeletionRequestsCard />
      <DeletedBusinessesCard />
    </Page>
  );
}

function DeletionRequestsCard() {
  const [status, setStatus] = useState<DeletionRequestFilter>('pending');
  const q = usePlatformDeletionRequests(status);
  const approve = useApproveDeletion();
  const reject = useRejectDeletion();
  const confirm = useConfirm();
  const [rejecting, setRejecting] = useState<DeletionRequest | null>(null);

  const onApprove = (r: DeletionRequest) =>
    confirm({
      title: `Delete ${r.tenant_name}?`,
      description: `Approving deletes it now. Nobody can reach it and its chat keys stop within a minute. You can restore it for 30 days.`,
      confirmLabel: 'Approve and delete',
      tone: 'danger',
      typeToConfirm: r.tenant_id,
      onConfirm: () => approve.mutateAsync({ id: r.id, note: '' }),
    });

  return (
    <Card
      flush
      title="Requests"
      actions={
        <Segmented
          size="xs"
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'approved', label: 'Approved' },
            { value: 'cancelled', label: 'Withdrawn' },
            { value: 'all', label: 'All' },
          ]}
        />
      }
    >
      {q.isPending ? (
        <SkeletonRows rows={3} className="p-4" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          rows={q.data}
          getKey={(r) => r.id}
          empty={<EmptyState compact icon={<Inbox />} title={status === 'pending' ? 'No requests waiting' : 'No requests'} />}
          columns={[
            {
              key: 'business',
              header: 'Business',
              cell: (r) => (
                <span className="grid min-w-0">
                  <span className="truncate font-semibold text-ink">{r.tenant_name}</span>
                  <span className="truncate font-mono text-xs text-ink-faint">{r.tenant_id}</span>
                </span>
              ),
            },
            {
              key: 'reason',
              header: 'Reason',
              cell: (r) => (
                <span className="grid min-w-0 max-w-[360px]">
                  <span className="truncate text-ink-muted">{r.reason || <span className="text-ink-faint">No reason given</span>}</span>
                  <span className="truncate text-xs text-ink-faint">{r.requested_by_email}</span>
                  {r.review_note && <span className="truncate text-xs text-ink-faint">Note: {r.review_note}</span>}
                </span>
              ),
            },
            { key: 'status', header: 'Status', cell: (r) => <Badge tone={REQUEST_STATUS[r.status].tone} dot>{REQUEST_STATUS[r.status].label}</Badge> },
            { key: 'when', header: 'Asked', align: 'right', hideBelowLg: true, cell: (r) => <span className="whitespace-nowrap text-ink-muted">{formatRelative(r.created_at)}</span> },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              cell: (r) =>
                r.status === 'pending' ? (
                  <span className="inline-flex gap-1.5">
                    <Button size="xs" variant="ghost" onClick={() => setRejecting(r)}>
                      Reject
                    </Button>
                    <Button size="xs" variant="danger-ghost" onClick={() => void onApprove(r)}>
                      Approve
                    </Button>
                  </span>
                ) : (
                  <span className="text-xs text-ink-faint">{r.reviewed_at ? formatDate(r.reviewed_at) : ''}</span>
                ),
            },
          ]}
        />
      )}
      <ReasonDialog
        open={Boolean(rejecting)}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Reject ${rejecting?.tenant_name ?? ''}'s request?`}
        description="The business stays as it is. Its owners see that the request was declined, with your note."
        label="Note"
        hint="Shown to the business."
        placeholder="Your balance has open charges; settle them first."
        confirmLabel="Reject request"
        onSubmit={(note) => reject.mutateAsync({ id: rejecting!.id, note })}
      />
    </Card>
  );
}

function DeletedBusinessesCard() {
  const q = useDeletedTenants();
  const restore = useRestoreConfirm();
  return (
    <Card flush title="Deleted businesses" description="Newest first. Restored and erased ones stay listed as a record.">
      {q.isPending ? (
        <SkeletonRows rows={3} className="p-4" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          rows={q.data}
          getKey={(d) => d.id}
          empty={<EmptyState compact icon={<Trash2 />} title="No deleted businesses" />}
          columns={[
            {
              key: 'business',
              header: 'Business',
              cell: (d) => (
                <span className="grid min-w-0">
                  <span className="truncate font-semibold text-ink">{d.tenant_name}</span>
                  <span className="truncate text-xs text-ink-faint">
                    <span className="font-mono">{d.tenant_id}</span>
                    {d.owner_email && ` · ${d.owner_email}`}
                  </span>
                </span>
              ),
            },
            {
              key: 'reason',
              header: 'Reason',
              hideBelowLg: true,
              cell: (d) => (
                <span className="grid min-w-0 max-w-[320px]">
                  <span className="truncate text-ink-muted">{d.reason || <span className="text-ink-faint">None given</span>}</span>
                  <span className="truncate text-xs text-ink-faint">
                    {d.deleted_by_email ? `By ${d.deleted_by_email}` : ''}
                    {d.request_id ? ', on request' : ''}
                  </span>
                </span>
              ),
            },
            { key: 'deleted', header: 'Deleted', align: 'right', cell: (d) => <span className="whitespace-nowrap text-ink-muted">{formatDate(d.deleted_at)}</span> },
            { key: 'state', header: 'State', align: 'right', cell: (d) => <DeletionState deletion={d} /> },
            {
              key: 'restore',
              header: <span className="sr-only">Restore</span>,
              align: 'right',
              cell: (d) =>
                d.restorable && (
                  <Button size="xs" leading={<RotateCcw />} onClick={() => void restore(d)}>
                    Restore
                  </Button>
                ),
            },
          ]}
        />
      )}
    </Card>
  );
}

/** "24 days", rounded up: a restore window measured in whole days. */
const daysLeft = (iso: string) => pluralize(Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)), 'day');

function DeletionState({ deletion: d }: { deletion: TenantDeletion }) {
  if (d.state === 'restored') return <Badge tone="live">Restored{d.restored_at ? ` ${formatDate(d.restored_at)}` : ''}</Badge>;
  if (d.state === 'purged') return <Badge tone="outline">Erased{d.purged_at ? ` ${formatDate(d.purged_at)}` : ''}</Badge>;
  if (!d.restorable) return <Badge tone="neutral">Erasing</Badge>;
  return (
    <Tip content={`Restorable until ${formatDate(d.restore_until)}`}>
      <span className="inline-flex">
        <Badge tone="warn" dot>
          {daysLeft(d.restore_until)} to restore
        </Badge>
      </span>
    </Tip>
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
  const types = usePlatformChannelTypes();
  const iconOf = (type?: string) => types.data?.find((t) => t.id === type)?.icon || type;
  const [f, setF] = useState<PlatformTicketQuery>({ view: 'open' });
  const q = usePlatformTickets(f);
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);
  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Tickets" description="Every business's tickets, read only. Open one to act on it inside its business." />
      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Segmented size="xs" label="View" value={f.view ?? 'all'} onChange={(v) => setF({ ...f, view: v })} options={[{ value: 'open', label: 'Open' }, { value: 'needs_reply', label: 'Needs reply' }, { value: 'escalated', label: 'Escalated' }, { value: 'all', label: 'All' }]} />
          <Select size="sm" className="w-44" aria-label="Business" value={f.tenant ?? ''} onChange={(e) => setF({ ...f, tenant: e.target.value || undefined })} placeholder="All businesses" options={liveBusinesses(tenants.data).map((t) => ({ value: t.id, label: t.name }))} />
          <Select size="sm" className="w-40" aria-label="Status" value={f.status ?? ''} onChange={(e) => setF({ ...f, status: (e.target.value as TicketStatus) || undefined })} placeholder="Any status" options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS[s].label }))} />
          <Select size="sm" className="w-36" aria-label="Priority" value={f.priority ?? ''} onChange={(e) => setF({ ...f, priority: (e.target.value as TicketPriority) || undefined })} placeholder="Any priority" options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY[p].label }))} />
          <Select size="sm" className="w-40" aria-label="Channel type" value={f.channel_type ?? ''} onChange={(e) => setF({ ...f, channel_type: e.target.value || undefined })} placeholder="Any channel" options={(types.data ?? []).map((t) => ({ value: t.id, label: t.label }))} />
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
                    <span className="flex min-w-0 items-center gap-1 text-xs text-ink-faint">
                      <span className="truncate">
                        {t.tenant_name} · {t.bot_id}
                        {t.escalated && ' · escalated'}
                        {t.handed_off && ' · handed off'}
                      </span>
                      {t.channel_name && (
                        <>
                          {' · '}
                          <ChannelBadge name={t.channel_name} icon={iconOf(t.channel_type)} className="max-w-[160px]" />
                        </>
                      )}
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
                    <Link {...scopeLink({ tenant: t.tenant_id, bot: t.bot_id }, `tickets/${t.id}`)}>Open</Link>
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
          <Select size="sm" className="w-56" aria-label="Business" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="All businesses" options={liveBusinesses(tenants.data).map((t) => ({ value: t.id, label: t.name }))} />
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
/* Channels                                                            */
/* ------------------------------------------------------------------ */

export function PlatformChannels() {
  const tenants = usePlatformTenants();
  const types = usePlatformChannelTypes();
  const [f, setF] = useState<PlatformChannelQuery>({});
  const q = usePlatformChannels(f);
  const toggle = useTogglePlatformChannel();
  const confirm = useConfirm();
  const iconOf = (type: string) => types.data?.find((t) => t.id === type)?.icon || type;

  const setDisabled = (c: PlatformChannel, disabled: boolean) =>
    disabled
      ? confirm({
          title: `Turn off “${c.name}”?`,
          description: `${c.tenant_name}'s chat API keys for this channel stop working at once, and the business can't turn it back on. It's recorded in their activity log.`,
          confirmLabel: 'Turn off channel',
          tone: 'danger',
          onConfirm: () => toggle.mutateAsync({ id: c.id, disabled: true }).then(() => notifySuccess('Channel turned off')),
        })
      : toggle.mutate({ id: c.id, disabled: false }, { onSuccess: () => notifySuccess(c.enabled ? 'Channel turned back on' : 'Allowed again. The business still has it switched off.') });

  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Channels" description="Every business's channels, newest first. Turn one off if it's abused; its keys stop working until you turn it back on." />
      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Segmented
            size="xs"
            label="Status"
            value={f.status ?? 'all'}
            onChange={(v) => setF({ ...f, status: v === 'all' ? undefined : v })}
            options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'disabled', label: 'Off' }]}
          />
          <Select size="sm" className="w-44" aria-label="Business" value={f.tenant ?? ''} onChange={(e) => setF({ ...f, tenant: e.target.value || undefined })} placeholder="All businesses" options={liveBusinesses(tenants.data).map((t) => ({ value: t.id, label: t.name }))} />
          <Select size="sm" className="w-40" aria-label="Type" value={f.type ?? ''} onChange={(e) => setF({ ...f, type: e.target.value || undefined })} placeholder="Any type" options={(types.data ?? []).map((t) => ({ value: t.id, label: t.label }))} />
        </div>
        {q.isPending ? (
          <SkeletonRows rows={5} className="p-4" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <div className={cn('transition-opacity', q.isPlaceholderData && 'opacity-60')}>
            <DataTable
              rows={q.data}
              getKey={(c) => c.id}
              empty={<EmptyState compact icon={<Radio />} title="No channels here" />}
              columns={[
                {
                  key: 'name',
                  header: 'Channel',
                  cell: (c) => (
                    <span className="flex items-center gap-3">
                      <ChannelTypeIcon icon={iconOf(c.type)} size={32} />
                      <span className="grid min-w-0">
                        <span className="truncate font-semibold text-ink">{c.name}</span>
                        <span className="truncate text-xs text-ink-faint">
                          {c.tenant_name} · {c.bot_id} · {c.type_label}
                        </span>
                      </span>
                    </span>
                  ),
                },
                { key: 'status', header: 'Status', cell: (c) => <ChannelStatusBadge channel={c} /> },
                { key: 'external', header: 'External ID', hideBelowLg: true, cell: (c) => <span className="block max-w-[180px] truncate font-mono text-xs text-ink-muted">{c.external_id || '—'}</span> },
                { key: 'tickets', header: 'Tickets', align: 'right', cell: (c) => <span className="whitespace-nowrap tabular-nums"><span className="font-semibold text-ink">{formatNumber(c.open_tickets)}</span> <span className="text-ink-faint">open · {formatNumber(c.tickets)}</span></span> },
                { key: 'keys', header: 'Keys', align: 'right', hideBelowLg: true, cell: (c) => <span className="tabular-nums text-ink-muted">{formatNumber(c.api_keys)}</span> },
                { key: 'created', header: 'Added', align: 'right', hideBelowLg: true, cell: (c) => <span className="whitespace-nowrap text-ink-muted">{formatDate(c.created_at)}</span> },
                {
                  key: 'allowed',
                  header: 'Allowed',
                  align: 'right',
                  cell: (c) => (
                    <span className="flex items-center justify-end gap-1">
                      <Switch checked={!c.disabled_by_platform} disabled={toggle.isPending} onCheckedChange={(v) => void setDisabled(c, !v)} />
                      <Tip content="Open in its business">
                        <Button asChild size="xs" icon variant="quiet" aria-label={`Open ${c.tenant_name}'s channels`}>
                          <Link {...scopeLink({ tenant: c.tenant_id, bot: c.bot_id }, 'integrations')}>
                            <ArrowUpRight />
                          </Link>
                        </Button>
                      </Tip>
                    </span>
                  ),
                },
              ]}
            />
          </div>
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
  const total = rows.reduce((a, r) => ({ cost: a.cost + r.estimated_cost, billed: a.billed + r.billed_cost, req: a.req + r.requests, tok: a.tok + r.total_tokens }), { cost: 0, billed: 0, req: 0, tok: 0 });
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Usage"
        description={q.data ? `${formatNumber(total.req)} requests · ${formatCompact(total.tok)} tokens · ${formatCurrency(total.cost)} OpenRouter cost · ${formatCurrency(total.billed)} billed` : 'Model usage across every business.'}
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
          <Card title={group === 'day' ? 'Cost and billed per day' : `OpenRouter cost by ${group === 'tenant' ? 'business' : 'model'}`}>
            {!q.data ? (
              <Skeleton className="h-[240px]" />
            ) : group === 'day' ? (
              <TrendChart
                data={rows.map((r) => ({ ...r, date: r.key }))}
                series={[
                  { key: 'estimated_cost', label: 'OpenRouter cost', slot: 1 },
                  { key: 'billed_cost', label: 'Billed', slot: 2 },
                ]}
                kind="bar"
                format={formatCurrency}
              />
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
                  { key: 'cost', header: 'Cost', align: 'right', cell: (r) => <span className="tabular-nums text-ink-muted">{formatCurrency(r.estimated_cost)}</span> },
                  { key: 'billed', header: 'Billed', align: 'right', cell: (r) => <span className="tabular-nums font-semibold text-ink">{formatCurrency(r.billed_cost)}</span> },
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
  fee_percent: null,
  commission_percent: null,
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
  const refreshAll = useRefreshAllPricing();
  const [edit, setEdit] = useState<PlatformModel | 'new' | null>(null);
  const refresh = () =>
    refreshAll.mutate(undefined, {
      onSuccess: (r) =>
        r.failed.length
          ? notifyInfo(`Refreshed ${pluralize(r.models.length, 'model')}; ${r.failed.length} kept their prices`, r.failed.map((f) => `${f.id}: ${f.error}`).join(' · '))
          : notifySuccess(`Refreshed ${pluralize(r.models.length, 'model')} from OpenRouter`),
    });
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Models"
        description="The models businesses can choose from. Businesses pay OpenRouter's price plus each model's fee and commission. Models are never deleted: retire one and its bots move to the default."
        actions={
          <>
            <Button variant="ghost" leading={<RefreshCw />} loading={refreshAll.isPending} onClick={refresh}>Refresh all prices</Button>
            <Button variant="accent" leading={<Plus />} onClick={() => setEdit('new')}>Add model</Button>
          </>
        }
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
              {
                key: 'price',
                header: 'OpenRouter in / out per M',
                align: 'right',
                cell: (m) => (
                  <span className="grid justify-items-end">
                    <span className="whitespace-nowrap font-mono text-xs tabular-nums text-ink">{formatPerM(m.input_price_per_mtok)} / {formatPerM(m.output_price_per_mtok)}</span>
                    <span className="text-[0.68rem] text-ink-faint">{m.pricing_synced_at ? `synced ${formatRelative(m.pricing_synced_at)}` : 'entered by hand'}</span>
                  </span>
                ),
              },
              {
                key: 'markup',
                header: 'Markup',
                align: 'right',
                hideBelowLg: true,
                cell: (m) => (
                  <Tip content={`${m.effective_fee_percent}% fee + ${m.effective_commission_percent}% commission${m.fee_percent == null && m.commission_percent == null ? ' (platform defaults)' : ''}`}>
                    <span className="tabular-nums text-ink-muted">
                      {+(m.effective_fee_percent + m.effective_commission_percent).toFixed(2)}%{(m.fee_percent != null || m.commission_percent != null) && <span className="text-accent">*</span>}
                    </span>
                  </Tip>
                ),
              },
              { key: 'billed', header: 'Billed in / out', align: 'right', cell: (m) => <span className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-ink">{formatPerM(m.billed_input_price_per_mtok)} / {formatPerM(m.billed_output_price_per_mtok)}</span> },
              {
                key: 'openrouter',
                header: 'OpenRouter now',
                align: 'right',
                hideBelowLg: true,
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

/** Platform defaults (PRICE_FEE_PERCENT, PRICE_COMMISSION_PERCENT), read off any model on the platform default. */
function usePlatformMarkup() {
  const models = usePlatformModels().data ?? [];
  return {
    fee: models.find((x) => x.fee_percent == null)?.effective_fee_percent,
    commission: models.find((x) => x.commission_percent == null)?.effective_commission_percent,
  };
}

function ModelSheet({ model, onClose }: { model: PlatformModel | 'new' | null; onClose: () => void }) {
  const save = useSavePlatformModel();
  const refresh = useRefreshModelPricing();
  const confirm = useConfirm();
  const or = useOpenRouterModels();
  const defaults = usePlatformMarkup();
  const existing = model && model !== 'new' ? model : null;
  const [m, setM] = useState<ModelInput>(EMPTY_MODEL);
  // New models can leave pricing to the API, which reads it from OpenRouter.
  const [serverPrices, setServerPrices] = useState(true);
  useEffect(() => {
    if (!model) return;
    if (existing) {
      const {
        bots: _b,
        created_at: _c,
        updated_at: _u,
        pricing_synced_at: _p,
        effective_fee_percent: _ef,
        effective_commission_percent: _ec,
        billed_input_price_per_mtok: _bi,
        billed_output_price_per_mtok: _bo,
        ...rest
      } = existing;
      setM(rest);
    } else {
      setM(EMPTY_MODEL);
      setServerPrices(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);
  // Keep the sheet's prices in step after a refresh from OpenRouter.
  useEffect(() => {
    if (existing) setM((x) => ({ ...x, input_price_per_mtok: existing.input_price_per_mtok, output_price_per_mtok: existing.output_price_per_mtok }));
  }, [existing?.input_price_per_mtok, existing?.output_price_per_mtok]); // eslint-disable-line react-hooks/exhaustive-deps

  const fee = m.fee_percent ?? existing?.effective_fee_percent ?? defaults.fee;
  const commission = m.commission_percent ?? existing?.effective_commission_percent ?? defaults.commission;
  const markup = fee != null && commission != null ? 1 + (fee + commission) / 100 : null;
  const pct = (k: 'fee_percent' | 'commission_percent') => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, e.target.value === '' ? null : Math.max(0, Math.min(1000, Number(e.target.value))));

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
  const fromServer = !existing && serverPrices;
  // With prices from OpenRouter, the API fills the label too.
  const valid = /^[a-z0-9-]+\/[a-z0-9._:-]+$/i.test(m.id) && (fromServer || m.label.trim().length > 0) && !(m.is_default && m.status !== 'active');

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
    let body: Partial<ModelInput> = m;
    if (fromServer) {
      const { input_price_per_mtok: _i, output_price_per_mtok: _o, ...rest } = m;
      // Send only what was entered; the API reads the rest from OpenRouter.
      body = Object.fromEntries(Object.entries(rest).filter(([k, v]) => !(k === 'label' && v === '') && !(k === 'description' && v === ''))) as Partial<ModelInput>;
    }
    save.mutate({ existing: Boolean(existing), body }, { onSuccess: onClose });
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
        {!existing && (
          <Switch
            checked={serverPrices}
            onCheckedChange={setServerPrices}
            label="Read prices from OpenRouter"
            description="Truplexy reads the prices, and the label if left blank, when you save. Turn off to enter prices yourself."
          />
        )}
        <Field label="Model ID" hint="vendor/model, as on OpenRouter. Can't change later.">
          <Input value={m.id} disabled={Boolean(existing)} className="font-mono" onChange={(e) => set('id', e.target.value.trim())} placeholder="google/gemini-3.1-flash-lite" />
        </Field>
        <Field label="Label" optional={fromServer} aside={`${m.label.length}/80`}>
          <Input value={m.label} onChange={(e) => set('label', e.target.value.slice(0, 80))} />
        </Field>
        <Field label="Description" optional aside={`${m.description.length}/300`} hint="Businesses see this when choosing.">
          <Textarea rows={2} value={m.description} onChange={(e) => set('description', e.target.value.slice(0, 300))} />
        </Field>
        {listed && drift && !fromServer && (
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
        {existing && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line p-3 text-xs">
            <span className="text-ink-muted">
              {existing.pricing_synced_at ? `Prices read from OpenRouter ${formatRelative(existing.pricing_synced_at)}.` : 'Prices were entered by hand.'} Replies already made keep what they were billed.
            </span>
            <Button size="xs" variant="soft" leading={<RefreshCw />} loading={refresh.isPending} onClick={() => refresh.mutate(existing.id)}>
              Refresh from OpenRouter
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="OpenRouter input $ / M">
            <Input type="number" min={0} step="0.01" disabled={fromServer} placeholder={fromServer ? 'From OpenRouter' : undefined} value={fromServer ? '' : m.input_price_per_mtok} onChange={num('input_price_per_mtok')} />
          </Field>
          <Field label="OpenRouter output $ / M">
            <Input type="number" min={0} step="0.01" disabled={fromServer} placeholder={fromServer ? 'From OpenRouter' : undefined} value={fromServer ? '' : m.output_price_per_mtok} onChange={num('output_price_per_mtok')} />
          </Field>
          <Field label="Fee %" optional hint={`Blank uses the platform's${defaults.fee != null ? ` (${defaults.fee}%)` : ''}.`}>
            <Input type="number" min={0} max={1000} step="0.1" value={m.fee_percent ?? ''} placeholder={defaults.fee != null ? String(defaults.fee) : 'Default'} onChange={pct('fee_percent')} />
          </Field>
          <Field label="Commission %" optional hint={`Blank uses the platform's${defaults.commission != null ? ` (${defaults.commission}%)` : ''}.`}>
            <Input type="number" min={0} max={1000} step="0.1" value={m.commission_percent ?? ''} placeholder={defaults.commission != null ? String(defaults.commission) : 'Default'} onChange={pct('commission_percent')} />
          </Field>
        </div>
        {markup != null && !fromServer && (
          <p className="rounded-[12px] bg-surface-2 px-3 py-2 text-xs text-ink-muted">
            Businesses pay{' '}
            <span className="font-mono font-semibold tabular-nums text-ink">
              {formatPerM(+(m.input_price_per_mtok * markup).toFixed(6))} / {formatPerM(+(m.output_price_per_mtok * markup).toFixed(6))}
            </span>{' '}
            per million tokens in / out ({+(fee! + commission!).toFixed(2)}% on top of OpenRouter).
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
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

/* ------------------------------------------------------------------ */
/* Channel types                                                       */
/* ------------------------------------------------------------------ */

const EMPTY_CHANNEL_TYPE: ChannelTypeInput = { id: '', label: '', description: '', icon: '', status: 'active', sort_order: 0 };
const CHANNEL_TYPE_ID_RE = /^[a-z][a-z0-9_-]{1,31}$/;

export function PlatformChannelTypes() {
  const q = usePlatformChannelTypes();
  const [edit, setEdit] = useState<PlatformChannelType | 'new' | null>(null);
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Channel types"
        description="The kinds of channel businesses can add to a bot. Hide a type to stop offering it; channels already of it keep working."
        actions={<Button variant="accent" leading={<Plus />} onClick={() => setEdit('new')}>New type</Button>}
      />
      <Card flush>
        {q.isPending ? (
          <SkeletonRows rows={5} className="p-4" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <DataTable
            rows={q.data}
            getKey={(t) => t.id}
            onRowClick={setEdit}
            empty={<EmptyState compact icon={<Shapes />} title="No channel types" />}
            columns={[
              {
                key: 'label',
                header: 'Type',
                cell: (t) => (
                  <span className="flex items-center gap-3">
                    <ChannelTypeIcon icon={t.icon || t.id} size={32} />
                    <span className="grid min-w-0">
                      <span className="truncate font-semibold text-ink">{t.label}</span>
                      <span className="truncate font-mono text-xs text-ink-faint">{t.id}</span>
                    </span>
                  </span>
                ),
              },
              { key: 'description', header: 'Description', hideBelowLg: true, cell: (t) => <span className="line-clamp-2 max-w-[360px] text-ink-muted">{t.description || '—'}</span> },
              { key: 'status', header: 'Status', cell: (t) => <Badge tone={STATUS_TONE[t.status]} dot className="capitalize">{t.status}</Badge> },
              { key: 'channels', header: 'Channels', align: 'right', cell: (t) => <span className="tabular-nums">{formatNumber(t.channels)}</span> },
              { key: 'order', header: 'Order', align: 'right', hideBelowLg: true, cell: (t) => <span className="tabular-nums text-ink-muted">{t.sort_order}</span> },
            ]}
          />
        )}
      </Card>
      <ChannelTypeSheet type={edit} onClose={() => setEdit(null)} />
    </Page>
  );
}

function ChannelTypeSheet({ type, onClose }: { type: PlatformChannelType | 'new' | null; onClose: () => void }) {
  const save = useSavePlatformChannelType();
  const existing = type && type !== 'new' ? type : null;
  const [t, setT] = useState<ChannelTypeInput>(EMPTY_CHANNEL_TYPE);
  useEffect(() => {
    if (!type) return;
    setT(existing ? { id: existing.id, label: existing.label, description: existing.description, icon: existing.icon, status: existing.status, sort_order: existing.sort_order } : EMPTY_CHANNEL_TYPE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
  const set = <K extends keyof ChannelTypeInput>(k: K, v: ChannelTypeInput[K]) => setT((x) => ({ ...x, [k]: v }));

  const idOk = Boolean(existing) || CHANNEL_TYPE_ID_RE.test(t.id);
  const orderOk = Number.isInteger(t.sort_order) && Math.abs(t.sort_order) <= 10_000;
  const valid = idOk && orderOk && t.label.trim();

  return (
    <Sheet
      open={Boolean(type)}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? existing.label : 'New channel type'}
      description={existing ? `${pluralize(existing.channels, 'channel')} use it. Types aren't deleted; hide one instead.` : 'Businesses can add channels of it once it is active.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={save.isPending}
            disabled={!valid}
            onClick={() => save.mutate({ existing: Boolean(existing), body: { ...t, label: t.label.trim(), description: t.description.trim(), icon: t.icon.trim() } }, { onSuccess: onClose })}
          >
            Save type
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ID" hint={existing ? "It can't change." : 'Lowercase letters, digits, - or _, starting with a letter.'} error={t.id && !idOk ? '2–32 characters: a-z, 0-9, - or _, starting with a letter.' : undefined}>
            <Input value={t.id} disabled={Boolean(existing)} className="font-mono" placeholder="line" onChange={(e) => set('id', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32))} />
          </Field>
          <Field label="Label" aside={`${t.label.length}/80`}>
            <Input value={t.label} placeholder="LINE" onChange={(e) => set('label', e.target.value.slice(0, 80))} />
          </Field>
        </div>
        <Field label="Description" optional aside={`${t.description.length}/300`}>
          <Textarea rows={3} value={t.description} onChange={(e) => set('description', e.target.value.slice(0, 300))} />
        </Field>
        <Field label="Icon" optional hint="A name such as discord, whatsapp, telegram, website, email or custom, or an image URL." aside={`${t.icon.length}/200`}>
          <div className="flex items-center gap-3">
            <ChannelTypeIcon icon={t.icon || t.id} size={38} />
            <Input value={t.icon} className="flex-1" placeholder="line" onChange={(e) => set('icon', e.target.value.slice(0, 200))} />
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" hint={t.status === 'hidden' ? "Not offered for new channels; existing ones keep working." : 'Offered to every business.'}>
            <Select value={t.status} onChange={(e) => set('status', e.target.value as ChannelTypeInput['status'])} options={[{ value: 'active', label: 'Active' }, { value: 'hidden', label: 'Hidden' }]} />
          </Field>
          <Field label="Sort order" hint="Lower comes first." error={orderOk ? undefined : 'A whole number from -10,000 to 10,000.'}>
            <Input type="number" min={-10000} max={10000} value={t.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

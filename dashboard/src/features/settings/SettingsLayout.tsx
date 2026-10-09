import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useNavigate, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  Check,
  CreditCard,
  DatabaseBackup,
  Download,
  ImagePlus,
  LogOut,
  Lock,
  Plus,
  Trash2,
  Undo2,
  Upload,
  Wallet,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, hasCode } from '@/lib/api/client';
import { useBusinessTypes, usePlans } from '@/lib/api/endpoints/account';
import { useBots, useCreateBot, useDeletionRequest, useLeaveTenant, useRemoveBotAvatar, useRemoveTenantLogo, useRequestDeletion, useSetBotAvatar, useSetTenantLogo, useTenant, useUpdateTenant, useWithdrawDeletion } from '@/lib/api/endpoints/business';
import { useAddonQuote, useBilling, useBillingLedger, useBuyTokens } from '@/lib/api/endpoints/billing';
import { useWorkspace } from '@/lib/api/endpoints/bot';
import { useDocuments } from '@/lib/api/endpoints/knowledge';
import type { Billing, BotConfig, BusinessTypeId, DocumentList, KnowledgeDocument, LedgerEntry } from '@/lib/api/types';
import { formatMonth, LEDGER_KIND, ordinal, quoteTokens } from '@/lib/billing';
import { cn } from '@/lib/cn';
import { formatCompact, formatCurrency, formatDate, formatDateTime, formatNumber, formatPerM, isoDay } from '@/lib/format';
import { ImageUploader } from '@/components/domain/ImageUploader';
import { ReasonDialog } from '@/components/domain/ReasonDialog';
import { useDebounce } from '@/hooks';
import { notifyError, notifySuccess } from '@/lib/notify';
import { qk } from '@/lib/query-keys';
import { scopeLink, useScopeCtx } from '@/lib/session/scope-context';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LimitBar,
  Page,
  PageHeader,
  Progress,
  Select,
  SkeletonRows,
  SubNav,
  useConfirm,
} from '@/components/ui';

export default function SettingsLayout() {
  const { href, businessName, can } = useScopeCtx();
  return (
    <Page>
      <PageHeader title="Settings" description={`Business details, plan, billing, bots and backups for ${businessName}.`} />
      <SubNav
        items={[
          { to: href('settings/business'), label: 'Business', icon: <Building2 /> },
          { to: href('settings/plan'), label: 'Plan & usage', icon: <CreditCard /> },
          { to: href('settings/billing'), label: 'Billing', icon: <Wallet />, hidden: !can('usage.read') },
          { to: href('settings/bots'), label: 'Bots', icon: <Bot /> },
          { to: href('settings/backup'), label: 'Backup', icon: <DatabaseBackup /> },
          { to: href('settings/danger'), label: 'Danger zone', icon: <AlertTriangle /> },
        ]}
      />
      <Outlet />
    </Page>
  );
}

/* ------------------------------------------------------------------ */

export function BusinessTab() {
  const { can } = useScopeCtx();
  const t = useTenant();
  const types = useBusinessTypes();
  const update = useUpdateTenant();
  const setLogo = useSetTenantLogo();
  const removeLogo = useRemoveTenantLogo();
  const writable = can('business.write');
  const [name, setName] = useState('');
  const [type, setType] = useState<BusinessTypeId>('other');
  const [hours, setHours] = useState(24);

  useEffect(() => {
    if (!t.data) return;
    setName(t.data.name);
    setType(t.data.business_type);
    setHours(t.data.reply_target_hours);
  }, [t.data]);

  if (t.isPending) return <Card><SkeletonRows rows={4} /></Card>;
  if (t.isError) return <Card><ErrorState error={t.error} onRetry={() => t.refetch()} /></Card>;
  const b = t.data;
  const dirty = name !== b.name || type !== b.business_type || hours !== b.reply_target_hours;
  const valid = name.trim().length >= 1 && hours >= 1 && hours <= 720;

  return (
    <div className="grid max-w-3xl gap-5">
      {!writable && (
        <Callout tone="neutral" icon={<Lock />}>
          Only admins and owners can change business details.
        </Callout>
      )}
      <Card title="Logo" description="Shown in the business switcher and in lists across Truplexy. It is public.">
        <ImageUploader
          name={b.name}
          src={b.logo_url}
          rounded="rounded-[16px]"
          disabled={!writable}
          busy={setLogo.isPending || removeLogo.isPending}
          onUpload={(file) => setLogo.mutate(file)}
          onRemove={() => removeLogo.mutate()}
        />
      </Card>
      <Card title="Business details">
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dirty || !valid) return;
            update.mutate({
              name: name !== b.name ? name.trim() : undefined,
              business_type: type !== b.business_type ? type : undefined,
              reply_target_hours: hours !== b.reply_target_hours ? hours : undefined,
            });
          }}
        >
          <Field label="Business name" hint="Customers see it in replies, as {{business_name}}." aside={`${name.length}/80`}>
            <Input value={name} disabled={!writable} onChange={(e) => setName(e.target.value.slice(0, 80))} />
          </Field>
          <Field label="Business type" hint="Sets the starting prompt, tone and knowledge checklist for new bots. Saved bots keep theirs.">
            <Select value={type} disabled={!writable} onChange={(e) => setType(e.target.value as BusinessTypeId)} options={(types.data ?? []).map((x) => ({ value: x.id, label: x.label }))} />
          </Field>
          <Field label="Reply target" hint="A ticket is overdue when the customer has waited longer than this for your team. 1–720 hours.">
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={720} className="w-28" value={hours} disabled={!writable} onChange={(e) => setHours(Math.round(Number(e.target.value) || 0))} />
              <span className="text-[0.8125rem] text-ink-muted">hours{hours >= 24 && ` (${+(hours / 24).toFixed(1)} days)`}</span>
            </div>
          </Field>
          {writable && (
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" disabled={!dirty} onClick={() => (setName(b.name), setType(b.business_type), setHours(b.reply_target_hours))}>
                Reset
              </Button>
              <Button type="submit" variant="accent" loading={update.isPending} disabled={!dirty || !valid}>
                Save changes
              </Button>
            </div>
          )}
        </form>
      </Card>
      <Card title="About this business">
        <dl className="grid gap-3 text-[0.8125rem] sm:grid-cols-3">
          <div>
            <dt className="text-ink-faint">Business ID</dt>
            <dd className="font-mono text-ink">{b.id}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Created</dt>
            <dd className="text-ink">{formatDate(b.created_at)}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Status</dt>
            <dd>
              <Badge tone={b.status === 'active' ? 'live' : 'warn'} dot>{b.status === 'active' ? 'Active' : 'Suspended'}</Badge>
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PlanTab() {
  const { can, href } = useScopeCtx();
  const t = useTenant();
  const plans = usePlans();
  const billing = useBilling(can('usage.read')).data;
  const docs = useDocuments({}).data;
  if (t.isPending) return <Card><SkeletonRows rows={4} /></Card>;
  if (t.isError) return <Card><ErrorState error={t.error} onRetry={() => t.refetch()} /></Card>;
  const b = t.data;
  const overrides = Object.keys(b.limit_overrides ?? {}).length;
  // Extra tokens bought this month raise the allowance above the plan's.
  const tokenAllowance = billing ? (billing.tokens.unlimited ? 0 : billing.tokens.allowance) : b.limits.tokens_per_month;
  const repliesOut = b.limits.replies_per_month > 0 && b.usage.replies_this_month >= b.limits.replies_per_month;
  const tokensOut = tokenAllowance > 0 && b.usage.tokens_this_month >= tokenAllowance && b.balance <= 0;
  const currentPlan = plans.data?.find((p) => p.id === b.plan);

  return (
    <div className="grid gap-5">
      <Card
        title={
          <span className="flex items-center gap-2">
            Current plan <Badge tone="accent" className="capitalize">{b.plan}</Badge>
          </span>
        }
        description={overrides ? 'Some limits on this business were adjusted by Truplexy.' : 'Usage resets on the 1st of each month (UTC).'}
      >
        <div className="grid gap-6 md:grid-cols-2">
          <LimitBar label="AI replies this month" used={b.usage.replies_this_month} limit={b.limits.replies_per_month} format={formatCompact} />
          <LimitBar
            label={billing?.tokens.addons ? `Tokens this month (incl. ${formatCompact(billing.tokens.addons)} extra)` : 'Tokens this month'}
            used={b.usage.tokens_this_month}
            limit={tokenAllowance}
            format={formatCompact}
          />
          <LimitBar label="Team members" used={b.usage.members} limit={b.limits.members} />
          <LimitBar label="Bots" used={b.usage.bots} limit={b.limits.bots} />
          <LimitBar label="Documents in this bot" used={docs?.pages[0]?.total ?? 0} limit={b.limits.documents_per_bot} />
        </div>
        {(repliesOut || tokensOut) && (
          <Callout tone="danger" icon={<AlertTriangle />} title="Your assistant has stopped replying" className="mt-5">
            {repliesOut
              ? "This month's replies are used up. Customers get no AI answer until the 1st, or until your plan changes."
              : "This month's tokens are used up and the balance is empty. Customers get no AI answer until the 1st, until you buy extra tokens, or until the balance is topped up."}
            {tokensOut && can('usage.read') && (
              <Button asChild size="xs" className="mt-2">
                <Link to={href('settings/billing')}>Go to billing</Link>
              </Button>
            )}
          </Callout>
        )}
      </Card>

      <Card title="Plans" description="Plans are set by the Truplexy team. Get in touch to change yours." flush>
        {plans.isPending ? (
          <SkeletonRows rows={3} className="p-4" />
        ) : plans.isError ? (
          <ErrorState error={plans.error} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table min-w-[760px]">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className="text-right">AI replies / month</th>
                  <th className="text-right">Tokens / month</th>
                  <th className="text-right">Bots</th>
                  <th className="text-right">Documents / bot</th>
                  <th className="text-right">Members</th>
                  <th className="text-right">Extra tokens</th>
                </tr>
              </thead>
              <tbody>
                {plans.data.map((p) => (
                  <tr key={p.id} className={cn(p.id === b.plan && '[&>td]:bg-accent-soft/50')}>
                    <td>
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        {p.name}
                        {p.id === b.plan && <Badge tone="accent"><Check className="size-3" /> Current</Badge>}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{limitText(p.limits.replies_per_month)}</td>
                    <td className="text-right tabular-nums">{p.limits.tokens_per_month > 0 ? formatCompact(p.limits.tokens_per_month) : 'Unlimited'}</td>
                    <td className="text-right tabular-nums">{limitText(p.limits.bots)}</td>
                    <td className="text-right tabular-nums">{limitText(p.limits.documents_per_bot)}</td>
                    <td className="text-right tabular-nums">{limitText(p.limits.members)}</td>
                    <td className="text-right tabular-nums text-ink-muted">
                      {p.token_addon ? `${formatPerM(p.token_addon.price_per_million)} / M, up to ${formatNumber(p.token_addon.max_millions)}M` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-[0.8125rem] text-ink-muted">Need more replies, bots or seats?</p>
          <div className="flex flex-wrap gap-2">
            {currentPlan?.token_addon && can('usage.read') && (
              <Button asChild variant="soft" size="xs">
                <Link to={href('settings/billing')}>Extra tokens</Link>
              </Button>
            )}
            <Button asChild variant="accent" size="xs">
              <a href="mailto:hello@truplexy.com?subject=Plan%20change">
                Contact us <ArrowRight />
              </a>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** 0 means unlimited. */
const limitText = (n: number) => (n > 0 ? formatNumber(n) : 'Unlimited');

/* ------------------------------------------------------------------ */

const TOP_UP_MAIL = 'mailto:hello@truplexy.com?subject=Balance%20top-up';

export function BillingTab() {
  const q = useBilling();
  if (q.isPending) return <Card><SkeletonRows rows={4} /></Card>;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const bl = q.data;
  const t = bl.tokens;
  const tokensOut = !t.unlimited && t.remaining === 0;

  return (
    <div className="grid gap-5">
      {tokensOut &&
        (bl.balance > 0 ? (
          <Callout tone="warn" icon={<AlertTriangle />} title="This month's tokens are used up">
            Each further reply is paid from the balance at its model's price, until the 1st or until you buy extra tokens.
          </Callout>
        ) : (
          <Callout tone="danger" icon={<AlertTriangle />} title="Your assistant has stopped replying">
            This month's tokens are used up and the balance is empty. Buy extra tokens, or ask Truplexy for a top-up.
          </Callout>
        ))}

      <div className="grid gap-5 md:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <Wallet className="size-4 text-accent" /> Balance
            </span>
          }
          description="Pays for extra tokens and, once the month's tokens are used up, for each further reply."
        >
          <div className="grid gap-2">
            <p className="font-mono text-3xl font-semibold tabular-nums text-ink">{formatCurrency(bl.balance)}</p>
            <p className="text-xs text-ink-faint">
              The Truplexy team tops up balances.{' '}
              <a className="font-medium text-accent hover:underline" href={TOP_UP_MAIL}>
                Request a top-up
              </a>
            </p>
          </div>
        </Card>
        <Card title="Tokens this month" description={`${bl.plan.name} plan · ${formatMonth(bl.month)} · resets on the 1st (UTC)`}>
          {t.unlimited ? (
            <p className="text-[0.8125rem] text-ink-muted">
              Unlimited. <span className="font-mono tabular-nums text-ink">{formatCompact(t.used)}</span> used so far.
            </p>
          ) : (
            <div className="grid gap-2">
              <LimitBar label="Used" used={t.used} limit={t.allowance} format={formatCompact} />
              <p className="text-xs text-ink-faint">
                {formatCompact(t.plan_allowance)} from the plan{t.addons > 0 && ` + ${formatCompact(t.addons)} extra`} · {formatCompact(t.remaining)} left
              </p>
            </div>
          )}
        </Card>
      </div>

      {bl.token_addon ? (
        <ExtraTokens billing={bl} />
      ) : (
        <Card title="Extra tokens">
          <p className="text-[0.8125rem] text-ink-muted">
            {t.unlimited ? (
              "This business's tokens are unlimited, so it needs no extra tokens."
            ) : (
              <>
                The {bl.plan.name} plan doesn't include extra tokens.{' '}
                <a className="font-medium text-accent hover:underline" href="mailto:hello@truplexy.com?subject=Plan%20change">
                  Contact us to change plan
                </a>
              </>
            )}
          </p>
        </Card>
      )}

      <LedgerCard />
    </div>
  );
}

function ExtraTokens({ billing: bl }: { billing: Billing }) {
  const a = bl.token_addon!;
  const tiered = a.tiers.length > 1;
  const { can } = useScopeCtx();
  const confirm = useConfirm();
  const buy = useBuyTokens();
  const [millions, setMillions] = useState(a.min_millions);
  const quote = useAddonQuote(useDebounce(millions, 250));
  // The API's quote is authoritative; the tiers price the slider while it moves.
  const estimate = useMemo(() => quoteTokens(a, millions), [a, millions]);
  const priced = quote.data?.millions === millions ? quote.data : estimate;
  const short = priced.price > bl.balance;
  const clamp = (n: number) => {
    const stepped = a.min_millions + Math.round((n - a.min_millions) / a.step_millions) * a.step_millions;
    return Math.max(a.min_millions, Math.min(a.max_millions, stepped));
  };

  const purchase = () =>
    confirm({
      title: `Buy ${formatNumber(millions)}M extra tokens?`,
      description: `${formatCurrency(priced.price)} comes out of the balance now. The tokens are for ${formatMonth(bl.month)} only and don't carry over.`,
      confirmLabel: `Buy for ${formatCurrency(priced.price)}`,
      onConfirm: () => buy.mutateAsync(millions),
    });

  return (
    <Card
      title="Extra tokens"
      description={`More tokens for ${formatMonth(bl.month)}, paid from the balance. ${tiered ? 'Larger purchases cost less per million.' : `${formatPerM(a.price_per_million)} per million.`}`}
    >
      <div className="grid gap-5">
        {tiered && (
          <div className="flex flex-wrap gap-1.5">
            {a.tiers.map((tier, i) => {
              const next = a.tiers[i + 1]?.from_millions;
              const on = millions >= tier.from_millions;
              return (
                <Badge key={tier.from_millions} tone={on ? 'accent' : 'outline'}>
                  {ordinal(tier.from_millions)}
                  {next ? `–${ordinal(Math.min(next - 1, a.max_millions))}` : ' on'} million: {formatPerM(tier.price_per_million)}
                </Badge>
              );
            })}
          </div>
        )}

        <Field label="How many million tokens" aside={`${formatNumber(a.min_millions)}–${formatNumber(a.max_millions)}M`}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={a.min_millions}
              max={a.max_millions}
              step={a.step_millions}
              value={millions}
              onChange={(e) => setMillions(clamp(Number(e.target.value)))}
              className="w-full accent-[var(--color-btn)]"
              aria-label="Million tokens"
            />
            <Input
              type="number"
              min={a.min_millions}
              max={a.max_millions}
              step={a.step_millions}
              value={millions}
              onChange={(e) => setMillions(clamp(Number(e.target.value) || a.min_millions))}
              className="w-24 font-mono"
              aria-label="Million tokens"
            />
          </div>
        </Field>

        <div className="grid gap-3 rounded-[12px] bg-surface-2 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <p className="text-xs text-ink-faint">
              {formatNumber(priced.tokens)} tokens · {formatPerM(priced.average_per_million)} per million on average
            </p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-ink">{formatCurrency(priced.price)}</p>
            <ul className="grid gap-0.5 text-xs text-ink-muted">
              {priced.breakdown.map((x) => (
                <li key={x.from_millions} className="font-mono tabular-nums">
                  {formatNumber(x.millions)}M × {formatPerM(x.price_per_million)} = {formatCurrency(x.amount)}
                </li>
              ))}
            </ul>
          </div>
          {can('billing.write') ? (
            <div className="grid justify-items-end gap-1.5">
              <Button variant="accent" disabled={short} loading={buy.isPending} onClick={() => void purchase()}>
                Buy for {formatCurrency(priced.price)}
              </Button>
              {short && (
                <p className="max-w-[260px] text-right text-xs text-danger">
                  More than the balance of {formatCurrency(bl.balance)}. Buy fewer tokens, or{' '}
                  <a className="underline" href={TOP_UP_MAIL}>
                    ask for a top-up
                  </a>
                  .
                </p>
              )}
            </div>
          ) : (
            <p className="max-w-[260px] text-xs text-ink-faint">Admins and owners can buy extra tokens.</p>
          )}
        </div>

        {bl.addons.length > 0 && (
          <div className="grid gap-2">
            <p className="mono text-ink-faint">Bought in {formatMonth(bl.month)}</p>
            <ul className="grid gap-1.5 text-[0.8125rem]">
              {bl.addons.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="font-medium text-ink">{formatCompact(x.tokens)} tokens</span>
                  <span className="font-mono tabular-nums text-ink-muted">{formatCurrency(x.price)}</span>
                  <span className="text-xs text-ink-faint">
                    {x.actor} · {formatDateTime(x.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function LedgerCard() {
  const q = useBillingLedger();
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);
  return (
    <Card title="Balance history" description="Every change to the balance, newest first." flush>
      {q.isPending ? (
        <SkeletonRows rows={4} className="p-4" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <DataTable<LedgerEntry>
            rows={rows}
            getKey={(e) => e.id}
            empty={<EmptyState compact icon={<Wallet />} title="No balance changes yet" />}
            columns={[
              { key: 'when', header: 'Date', cell: (e) => <span className="whitespace-nowrap text-ink-muted">{formatDateTime(e.created_at)}</span> },
              {
                key: 'what',
                header: 'What',
                cell: (e) => (
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge tone={LEDGER_KIND[e.kind].tone}>{LEDGER_KIND[e.kind].label}</Badge>
                    {e.note && <span className="truncate text-ink-muted">{e.note}</span>}
                  </span>
                ),
              },
              { key: 'by', header: 'By', hideBelowLg: true, cell: (e) => <span className="text-ink-muted">{e.actor || '—'}</span> },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                cell: (e) => (
                  <span className={cn('font-mono tabular-nums font-semibold', e.amount > 0 ? 'text-live' : 'text-ink')}>
                    {e.amount > 0 ? '+' : '−'}
                    {formatCurrency(Math.abs(e.amount))}
                  </span>
                ),
              },
              { key: 'after', header: 'Balance', align: 'right', cell: (e) => <span className="font-mono tabular-nums text-ink-muted">{formatCurrency(e.balance_after)}</span> },
            ]}
          />
          {q.hasNextPage && (
            <div className="border-t border-line p-3 text-center">
              <Button size="xs" variant="ghost" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const ID_RULE = /^[a-z0-9][a-z0-9_-]{0,30}$/;

export function BotsTab() {
  const { can, scope, bot: current } = useScopeCtx();
  const bots = useBots();
  const create = useCreateBot();
  const setAvatar = useSetBotAvatar();
  const removeAvatar = useRemoveBotAvatar();
  const [pictureFor, setPictureFor] = useState<string | null>(null);
  const t = useTenant();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const open = params.get('new') === '1';
  const full = t.data ? t.data.limits.bots > 0 && t.data.usage.bots >= t.data.limits.bots : false;

  useEffect(() => {
    if (open) {
      setName('');
      setId('');
      setIdTouched(false);
    }
  }, [open]);
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+/, '').slice(0, 31);

  return (
    <div className="grid gap-5">
      <Card
        flush
        title="Bots"
        description="Each bot has its own configuration, knowledge, keys, webhook and tickets. Team and tools are shared."
        actions={
          can('bots.create') && (
            <Button size="xs" variant="accent" leading={<Plus />} disabled={full} onClick={() => setParams({ new: '1' })}>
              New bot
            </Button>
          )
        }
      >
        {bots.isPending ? (
          <SkeletonRows rows={2} className="p-4" />
        ) : bots.isError ? (
          <ErrorState error={bots.error} onRetry={() => bots.refetch()} />
        ) : (
          <ul className="divide-y divide-line">
            {bots.data.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                {b.avatar_url ? (
                  <Avatar name={b.name} src={b.avatar_url} size={40} className="rounded-[12px]" />
                ) : (
                  <span className="grid size-10 place-items-center rounded-[12px] bg-accent-soft text-accent">
                    <Bot className="size-5" />
                  </span>
                )}
                <div className="grid min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    {b.name} {b.id === current.id && <Badge tone="live" dot>Current</Badge>}
                  </span>
                  <span className="text-xs text-ink-faint">
                    <code className="font-mono">{b.id}</code> · created {formatDate(b.created_at)} · knowledge v{b.kb_version}
                  </span>
                </div>
                {can('bot.write') && (
                  <Button size="xs" variant="ghost" leading={<ImagePlus />} onClick={() => setPictureFor(b.id)}>
                    Picture
                  </Button>
                )}
                {b.id !== current.id && (
                  <Button size="xs" asChild>
                    <Link {...scopeLink({ tenant: scope.tenant, bot: b.id })}>Switch to it</Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {full && can('bots.create') && (
          <p className="border-t border-line px-5 py-3 text-xs text-warn">Your plan's bot limit is reached. See Plan &amp; usage.</p>
        )}
      </Card>

      <Dialog
        open={pictureFor !== null}
        onOpenChange={(o) => !o && setPictureFor(null)}
        title="Bot picture"
        description="Shown next to the bot in lists and the dashboard. It is public."
        footer={<Button onClick={() => setPictureFor(null)}>Done</Button>}
      >
        {(() => {
          const b = bots.data?.find((x) => x.id === pictureFor);
          return b ? (
            <ImageUploader
              name={b.name}
              src={b.avatar_url}
              rounded="rounded-[16px]"
              busy={setAvatar.isPending || removeAvatar.isPending}
              onUpload={(file) => setAvatar.mutate({ id: b.id, file })}
              onRemove={() => removeAvatar.mutate(b.id)}
            />
          ) : null;
        })()}
      </Dialog>

      <Dialog
        open={open && can('bots.create')}
        onOpenChange={(o) => !o && setParams({}, { replace: true })}
        title="New bot"
        description="It starts with your business type's assistant and an empty knowledge base."
        footer={
          <>
            <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>Cancel</Button>
            <Button type="submit" form="new-bot" variant="accent" loading={create.isPending} disabled={!name.trim() || !ID_RULE.test(id)}>
              Create bot
            </Button>
          </>
        }
      >
        <form
          id="new-bot"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ bot_id: id, name: name.trim() }, { onSuccess: (b) => {
                const link = scopeLink({ tenant: scope.tenant, bot: b.id }, 'llm/model');
                nav(link.to, { state: link.state });
              }, });
          }}
        >
          <Field label="Name" aside={`${name.length}/80`}>
            <Input
              autoFocus
              value={name}
              placeholder="e.g. Wholesale desk"
              onChange={(e) => {
                setName(e.target.value.slice(0, 80));
                if (!idTouched) setId(slug(e.target.value));
              }}
            />
          </Field>
          <Field label="Bot ID" hint="Used in URLs and the X-Truplexy-Bot header. Lowercase letters, digits, - and _. It can't change later." error={id && !ID_RULE.test(id) ? 'Start with a letter or digit; up to 31 characters.' : undefined}>
            <Input value={id} className="font-mono" onChange={(e) => (setIdTouched(true), setId(e.target.value.toLowerCase().slice(0, 31)))} />
          </Field>
          {create.isError && hasCode(create.error, 'BOT_EXISTS') && <p className="text-xs text-danger">That ID is taken in this business.</p>}
        </form>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Backup: the workspace and every document, as one JSON file.          */
/* ------------------------------------------------------------------ */

interface BackupFile {
  format: 'truplexy-backup';
  version: 1;
  exported_at: string;
  business: string;
  bot: string;
  workspace: { name: string; bot: BotConfig };
  documents: (Pick<KnowledgeDocument, 'title' | 'content' | 'source_name' | 'source_url' | 'knowledge_base_id' | 'locale' | 'product' | 'version'>)[];
}

export function BackupTab() {
  const { scope, can, bot } = useScopeCtx();
  const ws = useWorkspace();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ added: number; duplicates: number; failed: number; workspace: boolean } | null>(null);

  const exportBackup = async () => {
    try {
      setReport(null);
      const docs: KnowledgeDocument[] = [];
      let cursor: string | undefined;
      do {
        const page = await api<DocumentList>('/knowledge/documents', { scope, query: { limit: 100, cursor } });
        docs.push(...page.data);
        cursor = page.next_cursor;
      } while (cursor);
      const full: BackupFile['documents'] = [];
      setProgress({ label: 'Reading documents', done: 0, total: docs.length });
      for (const [i, d] of docs.entries()) {
        if (d.status === 'indexed') {
          const x = await api<KnowledgeDocument>(`/knowledge/documents/${d.id}`, { scope });
          if (x.content) full.push({ title: x.title, content: x.content, source_name: x.source_name, source_url: x.source_url, knowledge_base_id: x.knowledge_base_id, locale: x.locale, product: x.product, version: x.version });
        }
        setProgress({ label: 'Reading documents', done: i + 1, total: docs.length });
      }
      const w = ws.data ?? (await api<{ name: string; bot: BotConfig }>('/workspace', { scope }));
      const file: BackupFile = { format: 'truplexy-backup', version: 1, exported_at: new Date().toISOString(), business: scope.tenant, bot: scope.bot, workspace: { name: w.name, bot: w.bot }, documents: full };
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `truplexy-${scope.tenant}-${scope.bot}-${isoDay(new Date())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      notifySuccess('Backup downloaded', `Configuration and ${full.length} documents.`);
    } catch (e) {
      notifyError(e, 'Export failed');
    } finally {
      setProgress(null);
    }
  };

  const importBackup = async (file: File) => {
    let data: BackupFile;
    try {
      data = JSON.parse(await file.text());
      if (data.format !== 'truplexy-backup' || !Array.isArray(data.documents)) throw new Error('Not a Truplexy backup file.');
    } catch (e) {
      return notifyError(e, "Couldn't read that file");
    }
    const ok = await confirm({
      title: `Restore into ${bot.name}?`,
      description: (
        <>
          {can('bot.write') && 'Its configuration is replaced by the backup’s. '}
          {can('knowledge.write') && `${data.documents.length} documents are added; ones already present are skipped.`} Existing documents are not deleted.
        </>
      ),
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    const r = { added: 0, duplicates: 0, failed: 0, workspace: false };
    try {
      if (can('bot.write')) {
        setProgress({ label: 'Restoring configuration', done: 0, total: 1 });
        const cur = await api<{ revision: number }>('/workspace', { scope });
        await api('/workspace', { method: 'PUT', scope, body: { name: data.workspace.name, bot: data.workspace.bot, revision: cur.revision } });
        r.workspace = true;
      }
      if (can('knowledge.write')) {
        for (const [i, d] of data.documents.entries()) {
          setProgress({ label: 'Adding documents', done: i, total: data.documents.length });
          try {
            const body = Object.fromEntries(Object.entries(d).filter(([, v]) => v != null && v !== ''));
            await api('/knowledge/documents', { method: 'POST', scope, body });
            r.added++;
          } catch (e) {
            if (hasCode(e, 'DUPLICATE_DOCUMENT')) r.duplicates++;
            else r.failed++;
          }
        }
      }
    } catch (e) {
      notifyError(e, 'Restore stopped');
    } finally {
      setProgress(null);
      setReport(r);
      qc.invalidateQueries({ queryKey: qk.bot(scope) });
    }
  };

  return (
    <div className="grid max-w-3xl gap-5">
      <Card title="Export" description={`Download ${bot.name}'s configuration and the text of every indexed document as one JSON file.`}>
        <Button leading={<Download />} loading={progress?.label === 'Reading documents'} disabled={Boolean(progress)} onClick={() => void exportBackup()}>
          Download backup
        </Button>
      </Card>
      <Card title="Restore" description="Apply a backup to this bot. Use it to copy a bot, or to recover after a mistake.">
        {!can('bot.write') && !can('knowledge.write') ? (
          <p className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
            <Lock className="size-4" /> Your role can't restore backups.
          </p>
        ) : (
          <div className="grid gap-4">
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => (e.target.files?.[0] && void importBackup(e.target.files[0]), (e.target.value = ''))} />
            <Button className="justify-self-start" leading={<Upload />} disabled={Boolean(progress)} onClick={() => fileRef.current?.click()}>
              Choose backup file
            </Button>
            {!can('bot.write') && <p className="text-xs text-ink-faint">Your role can add documents but not change the configuration, so only documents are restored.</p>}
          </div>
        )}
      </Card>
      {progress && (
        <Card>
          <div className="grid gap-2">
            <p className="text-[0.8125rem] font-semibold text-ink">
              {progress.label}… {progress.done}/{progress.total}
            </p>
            <Progress value={progress.total ? progress.done / progress.total : 0} />
          </div>
        </Card>
      )}
      {report && (
        <Callout tone={report.failed ? 'warn' : 'live'} icon={<Check />} title="Restore finished">
          {report.workspace && 'Configuration restored. '}
          {report.added} documents added, {report.duplicates} already present{report.failed ? `, ${report.failed} failed` : ''}.
        </Callout>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function DangerTab() {
  const { businessName, membership } = useScopeCtx();
  const leave = useLeaveTenant();
  const confirm = useConfirm();
  const nav = useNavigate();

  const onLeave = () =>
    confirm({
      title: `Leave ${businessName}?`,
      description: "You lose access right away. To come back, someone has to invite you again.",
      confirmLabel: 'Leave business',
      tone: 'danger',
      typeToConfirm: businessName,
      onConfirm: () => leave.mutateAsync().then(() => nav('/', { replace: true })),
    });

  return (
    <div className="grid max-w-3xl gap-5">
      <section className="rounded-[16px] border border-danger/30 bg-surface">
        <header className="border-b border-danger/20 px-5 py-4">
          <h2 className="text-[0.9375rem] font-bold text-danger">Danger zone</h2>
        </header>
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div className="grid min-w-[240px] flex-1 gap-0.5">
            <p className="font-semibold text-ink">Leave this business</p>
            <p className="text-[0.8125rem] text-ink-muted">
              {membership?.role === 'owner'
                ? 'A business needs at least one owner. If you are the only one, make someone else an owner first.'
                : 'Remove your own access. Your tickets stay, unassigned.'}
            </p>
          </div>
          <Button variant="danger-ghost" leading={<LogOut />} disabled={!membership} onClick={() => void onLeave()}>
            Leave business
          </Button>
        </div>
        <DeleteBusinessRow />
      </section>
    </div>
  );
}

/** Owners ask Truplexy to delete the business; a platform admin reviews the request. */
function DeleteBusinessRow() {
  const { businessName, can, href } = useScopeCtx();
  const q = useDeletionRequest();
  const request = useRequestDeletion();
  const withdraw = useWithdrawDeletion();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const owner = can('business.delete');
  const r = q.data;
  const pending = r?.status === 'pending';

  const onWithdraw = () =>
    confirm({
      title: 'Withdraw the deletion request?',
      description: `${businessName} stays as it is. An owner can ask again at any time.`,
      confirmLabel: 'Withdraw request',
      onConfirm: () => withdraw.mutateAsync(),
    });

  return (
    <div className="grid gap-3 border-t border-line px-5 py-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid min-w-[240px] flex-1 gap-0.5">
          <p className="font-semibold text-ink">Delete this business</p>
          <p className="text-[0.8125rem] text-ink-muted">
            An owner asks, and the Truplexy team reviews the request. A deleted business can be restored for 30 days; after that its bots, knowledge, tickets and
            history are erased. People's accounts stay.
          </p>
        </div>
        {q.isPending ? null : pending ? (
          owner && (
            <Button variant="ghost" leading={<Undo2 />} onClick={() => void onWithdraw()}>
              Withdraw request
            </Button>
          )
        ) : owner ? (
          <Button variant="danger-ghost" leading={<Trash2 />} disabled={q.isError} onClick={() => setOpen(true)}>
            Request deletion
          </Button>
        ) : (
          <p className="max-w-[220px] text-xs text-ink-faint">Only owners can ask Truplexy to delete this business.</p>
        )}
      </div>
      {q.isError && <ErrorState compact error={q.error} onRetry={() => q.refetch()} />}
      {pending && (
        <Callout tone="warn" icon={<AlertTriangle />} title={`Deletion requested ${formatDate(r.created_at)}`}>
          {r.requested_by_email} asked Truplexy to delete {businessName}. Until the team reviews it, everything keeps working.
          {r.reason && <span className="mt-1 block italic">“{r.reason}”</span>}
        </Callout>
      )}
      {r?.status === 'rejected' && (
        <Callout tone="neutral" title={`Deletion request declined${r.reviewed_at ? ` ${formatDate(r.reviewed_at)}` : ''}`}>
          {r.review_note ? <span className="italic">“{r.review_note}”</span> : 'Truplexy left no note.'} An owner can ask again.
        </Callout>
      )}
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={`Ask to delete ${businessName}?`}
        description="The Truplexy team reviews the request. Nothing changes until they approve it, and you can withdraw it until then."
        label="Reason"
        hint="Shown to the Truplexy team."
        placeholder="We no longer need it."
        typeToConfirm={businessName}
        confirmLabel="Request deletion"
        tone="danger"
        onSubmit={(reason) => request.mutateAsync(reason)}
      >
        <Callout tone="warn" icon={<AlertTriangle />} title="Download a backup first">
          Once deleted, every bot's configuration and knowledge is erased after 30 days.{' '}
          <Link className="font-medium text-accent hover:underline" to={href('settings/backup')} onClick={() => setOpen(false)}>
            Go to Backup
          </Link>
        </Callout>
      </ReasonDialog>
    </div>
  );
}

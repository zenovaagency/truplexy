import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  KeyRound,
  LayoutGrid,
  Lock,
  Pause,
  Play,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Webhook as WebhookIcon,
  XCircle,
} from 'lucide-react';
import { useApiKeys } from '@/lib/api/endpoints/business';
import { useDeleteWebhook, useRotateWebhookSecret, useSaveWebhook, useTestWebhook, useWebhook } from '@/lib/api/endpoints/bot';
import type { Webhook, WebhookDelivery } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { notifySuccess } from '@/lib/notify';
import { useScopeCtx } from '@/lib/session/scope-context';
import {
  Badge,
  Button,
  Callout,
  Card,
  CodeBlock,
  DescList,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Page,
  PageHeader,
  SecretOnce,
  Sheet,
  Skeleton,
  SkeletonRows,
  SubNav,
  Switch,
  useConfirm,
} from '@/components/ui';
import { IssueKeyForm } from '@/features/api-keys/IssueKey';
import { GROUP_LABEL, INTEGRATIONS, IntegrationIcon, keysFor, type Integration, type IntegrationGroup } from './catalog';
import { ALL_LANGS, LangPicker, useLang, useLangPack } from './languages';
import type { LangPack } from './snippets/types';

export default function IntegrationsPage() {
  const { href, bot } = useScopeCtx();
  const webhook = useWebhook();
  return (
    <Page>
      <PageHeader
        title="Integrations"
        description={`Connect ${bot.name} to the places your customers already talk to you. Every channel uses the same assistant, knowledge and ticket queue.`}
      />
      <SubNav
        items={[
          { to: href('integrations'), label: 'Channels', icon: <LayoutGrid />, end: true },
          {
            to: href('integrations/webhook'),
            label: (
              <span className="flex items-center gap-1.5">
                Webhook {webhook.data && <span className={cn('size-1.5 rounded-full', webhook.data.enabled ? 'bg-live' : 'bg-warn')} />}
              </span>
            ),
            icon: <WebhookIcon />,
          },
        ]}
      />
      <Outlet />
    </Page>
  );
}

/* ------------------------------------------------------------------ */

export function CatalogTab() {
  const { can, scope } = useScopeCtx();
  const keys = useApiKeys(can('integrations.read'));
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<IntegrationGroup | 'all' | 'connected'>('all');
  const open = INTEGRATIONS.find((i) => i.id === params.get('guide'));

  const connected = (i: Integration) => keysFor(i, keys.data ?? [], scope.bot);
  const list = useMemo(
    () =>
      INTEGRATIONS.filter(
        (i) =>
          (group === 'all' || (group === 'connected' ? connected(i).length > 0 : i.group === group)) &&
          (!q || `${i.name} ${i.blurb}`.toLowerCase().includes(q.toLowerCase())),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, group, keys.data],
  );
  const groups = (Object.keys(GROUP_LABEL) as IntegrationGroup[]).filter((g) => list.some((i) => i.group === g));
  const connectedCount = INTEGRATIONS.filter((i) => connected(i).length).length;

  const openGuide = (i: Integration) =>
    i.id === 'webhooks'
      ? setParams({}, { replace: true })
      : setParams((p) => (p.set('guide', i.id), p), { replace: true });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input size="sm" className="pl-9" placeholder="Search channels" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search integrations" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'connected', ...Object.keys(GROUP_LABEL)] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g as typeof group)}
              aria-pressed={group === g}
              className={cn(
                'chip h-8 border transition-colors',
                group === g ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-muted hover:border-line-strong',
              )}
            >
              {g === 'all' ? 'All' : g === 'connected' ? `Connected · ${connectedCount}` : GROUP_LABEL[g as IntegrationGroup]}
            </button>
          ))}
        </div>
      </div>

      {!list.length && <EmptyState compact icon={<Search />} title="No channels match" />}

      {groups.map((g) => (
        <section key={g} className="grid gap-3">
          <h2 className="mono text-ink-faint">{GROUP_LABEL[g]}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list
              .filter((i) => i.group === g)
              .map((i) => {
                const n = connected(i).length;
                const card = (
                  <>
                    <div className="flex items-start gap-3">
                      <IntegrationIcon i={i} />
                      <div className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex items-center gap-2 font-semibold text-ink">
                          {i.name}
                          {i.teamSide && <Badge tone="outline" className="px-1.5 py-0 text-[0.65rem]">For your team</Badge>}
                        </span>
                        <span className="text-[0.8125rem] leading-snug text-ink-muted">{i.blurb}</span>
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      {n ? (
                        <Badge tone="live" dot>
                          Connected{n > 1 ? ` · ${n} keys` : ''}
                        </Badge>
                      ) : (
                        <span className="text-xs text-ink-faint">Not connected</span>
                      )}
                      <span className="text-[0.8125rem] font-semibold text-accent">{i.id === 'webhooks' ? 'Configure →' : n ? 'View guide →' : 'Set up →'}</span>
                    </div>
                  </>
                );
                const cls = 'panel flex min-h-[148px] flex-col p-4 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md';
                return i.id === 'webhooks' ? (
                  <Link key={i.id} to="webhook" className={cls}>
                    {card}
                  </Link>
                ) : (
                  <button key={i.id} type="button" onClick={() => openGuide(i)} className={cls}>
                    {card}
                  </button>
                );
              })}
          </div>
        </section>
      ))}

      <GuideSheet integration={open} onClose={() => setParams((p) => (p.delete('guide'), p), { replace: true })} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="group/step relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 pb-8 last:pb-0">
      <span className="absolute bottom-0 left-[15px] top-9 w-px bg-line group-last/step:hidden" aria-hidden />
      <span className={cn('z-[1] grid size-8 place-items-center rounded-full border text-xs font-bold', done ? 'border-live bg-live-soft text-live' : 'border-line bg-surface text-ink')}>
        {done ? <CheckCircle2 className="size-4" /> : n}
      </span>
      <div className="grid min-w-0 gap-3 pt-1">
        <h3 className="text-[0.9375rem] font-bold text-ink">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function GuideSheet({ integration: i, onClose }: { integration?: Integration; onClose: () => void }) {
  const { can, scope, href, bot } = useScopeCtx();
  const keys = useApiKeys(can('integrations.read'));
  const webhook = useWebhook();
  const existing = i ? keysFor(i, keys.data ?? [], scope.bot) : [];
  const [issued, setIssued] = useState(false);
  useEffect(() => setIssued(false), [i?.id]);
  const [lang, setLang] = useLang(i?.langs ?? []);
  const pack = useLangPack(lang);
  const code = pack.data?.integrations[i?.id ?? ''];
  const hook = code && pack.data && (code.receiver ?? (code.deliver || code.escalation ? pack.data.receiver(code) : null));

  return (
    <Sheet
      open={Boolean(i)}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={i ? `Connect ${i.name}` : ''}
      description={i?.teamSide ? 'Bring escalations to your team, and send their replies back to the customer.' : `Customers on ${i?.name} talk to ${bot.name}. Your server sits in between and holds the key.`}
    >
      {i && (
        <div className="grid gap-6">
          <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2/50 p-3.5">
            <IntegrationIcon i={i} size={44} />
            <p className="text-[0.8125rem] text-ink-muted">
              <span className="font-semibold text-ink">How it works:</span> {i.name} sends each message to your server, your server asks Truplexy with a chat key, and sends the reply back. When your team replies from Tickets, Truplexy signs a webhook to your server so it can deliver the message.
            </p>
          </div>
          <Callout tone="warn" icon={<ShieldCheck />} title="Keys stay on your server">
            Never put a chat key in a website, mobile app or theme file. Anyone could copy it.
          </Callout>
          {i.langs.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="text-[0.8125rem] text-ink-muted">Your server's language</span>
              <LangPicker langs={i.langs} value={lang} onChange={setLang} />
            </div>
          )}

          <ol className="grid">
            <Step n={1} title="Issue a chat key" done={existing.length > 0 || issued}>
              {existing.length > 0 && (
                <ul className="grid gap-1.5">
                  {existing.map((k) => (
                    <li key={k.id} className="flex items-center gap-2 text-[0.8125rem]">
                      <KeyRound className="size-3.5 text-live" />
                      <span className="font-medium text-ink">{k.name}</span>
                      <code className="font-mono text-xs text-ink-faint">{k.key_prefix}…</code>
                      <span className="ml-auto text-xs text-ink-faint">{k.last_used_at ? `used ${formatRelative(k.last_used_at)}` : 'never used'}</span>
                    </li>
                  ))}
                </ul>
              )}
              {can('integrations.write') ? (
                <IssueKeyForm compact defaultName={`${i.name} · Production`} onIssued={() => setIssued(true)} />
              ) : (
                <p className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
                  <Lock className="size-3.5" /> Ask an admin to issue a key for {i.name}.
                </p>
              )}
              <p className="text-xs text-ink-faint">
                Set it as <code className="font-mono">TRUPLEXY_CHAT_KEY</code> on your server. Manage keys under{' '}
                <Link to={href('api-keys')} className="text-accent hover:underline">API keys</Link>.
              </p>
            </Step>

            <Step n={2} title={i.teamSide ? `Set up ${i.name}` : `Receive ${i.name} messages`}>
              <ol className="grid list-decimal gap-1.5 pl-5 text-[0.8125rem] text-ink-muted marker:text-ink-faint">
                {i.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {code && pack.data ? (
                <>
                  <CodeBlock
                    key={lang}
                    samples={[
                      { label: code.file ?? pack.data.files.server, code: code.handler },
                      ...(code.standalone ? [] : [{ label: pack.data.files.helper, code: pack.data.helper }]),
                    ]}
                  />
                  {pack.data.note && <p className="text-xs text-ink-faint">{pack.data.note}</p>}
                </>
              ) : (
                <CodeLoading error={pack.isError} />
              )}
            </Step>

            <Step n={3} title={i.teamSide ? 'Bring escalations to your team' : "Send your team's replies back"} done={Boolean(webhook.data?.enabled)}>
              <p className="text-[0.8125rem] text-ink-muted">
                {i.teamSide ? (
                  <>
                    When a ticket is escalated, Truplexy calls your webhook with <code className="font-mono text-xs">ticket.updated</code>. Verify the signature, then post it for your team.
                  </>
                ) : (
                  <>
                    When someone replies from Tickets, Truplexy calls your webhook with <code className="font-mono text-xs">message.created</code>. Verify the signature, then deliver it.
                  </>
                )}
              </p>
              {webhook.data ? (
                <p className="flex items-center gap-2 text-[0.8125rem]">
                  <span className={cn('size-2 rounded-full', webhook.data.enabled ? 'bg-live' : 'bg-warn')} />
                  <span className="truncate font-mono text-xs text-ink">{webhook.data.url}</span>
                  <Link to={href('integrations/webhook')} className="ml-auto shrink-0 text-xs font-semibold text-accent hover:underline">Manage</Link>
                </p>
              ) : (
                <Button asChild size="xs" variant="soft" className="justify-self-start">
                  <Link to={href('integrations/webhook')}>Set up the webhook</Link>
                </Button>
              )}
              {hook && pack.data && (
                <CodeBlock
                  key={lang}
                  samples={[
                    { label: code?.receiver ? `${code.file ?? pack.data.files.server} · webhook` : pack.data.files.webhook, code: hook },
                    { label: pack.data.files.verify, code: pack.data.verify },
                  ]}
                />
              )}
            </Step>

            <Step n={4} title="Try it">
              <ul className="grid gap-1.5 text-[0.8125rem] text-ink-muted">
                <li className="flex gap-2"><CircleDot className="mt-0.5 size-3.5 shrink-0 text-accent" /> Send a message on {i.name}. The reply should arrive within a few seconds.</li>
                <li className="flex gap-2"><CircleDot className="mt-0.5 size-3.5 shrink-0 text-accent" /> Ask for a person. The conversation shows up under Tickets → Handoffs.</li>
                <li className="flex gap-2"><CircleDot className="mt-0.5 size-3.5 shrink-0 text-accent" /> Take it over and reply from the ticket. Your reply should appear on {i.name}.</li>
              </ul>
            </Step>
          </ol>
        </div>
      )}
    </Sheet>
  );
}

function CodeLoading({ error }: { error: boolean }) {
  return error ? (
    <p className="rounded-[14px] border border-line px-4 py-6 text-center text-[0.8125rem] text-ink-faint">The code samples didn't load. Check your connection and reopen the guide.</p>
  ) : (
    <Skeleton className="h-48 rounded-[14px]" />
  );
}

/** The generic receiver and signature check, in any language. */
function WebhookCode() {
  const [lang, setLang] = useLang(ALL_LANGS);
  const pack = useLangPack(lang);
  const p: LangPack | undefined = pack.data;
  return (
    <div className="grid gap-3">
      <div className="-mx-1 overflow-x-auto px-1">
        <LangPicker langs={ALL_LANGS} value={lang} onChange={setLang} />
      </div>
      {p ? (
        <CodeBlock
          key={lang}
          samples={[
            { label: p.files.verify, code: p.verify },
            { label: p.files.webhook, code: p.receiver({ deliver: p.integrations.api?.deliver }) },
          ]}
        />
      ) : (
        <CodeLoading error={pack.isError} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Webhook                                                             */
/* ------------------------------------------------------------------ */

export function WebhookTab() {
  const { can, bot } = useScopeCtx();
  const q = useWebhook();
  const save = useSaveWebhook();
  const rotate = useRotateWebhookSecret();
  const del = useDeleteWebhook();
  const test = useTestWebhook();
  const confirm = useConfirm();
  const writable = can('integrations.write');
  const w = q.data;
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [lastTest, setLastTest] = useState<WebhookDelivery | null>(null);

  useEffect(() => setUrl(w?.url ?? ''), [w?.url]);

  const urlOk = /^https:\/\/[^\s#@]+$/.test(url) && url.length <= 2000;

  const onSave = (patch?: Partial<Pick<Webhook, 'enabled'>>) =>
    save.mutate(
      { url: patch ? w!.url : url, enabled: patch?.enabled ?? w?.enabled ?? true },
      {
        onSuccess: (r) => {
          if (r.secret) setSecret(r.secret);
          notifySuccess(patch ? (patch.enabled ? 'Deliveries resumed' : 'Deliveries paused') : w ? 'Webhook saved' : 'Webhook created');
        },
      },
    );

  const onRotate = () =>
    confirm({
      title: 'Replace the signing secret?',
      description: 'Deliveries are signed with the new secret right away. Update your server first, or it will reject them.',
      confirmLabel: 'Replace secret',
      tone: 'danger',
      onConfirm: () => rotate.mutateAsync().then((r) => r.secret && setSecret(r.secret)),
    });

  const onDelete = () =>
    confirm({
      title: 'Remove the webhook?',
      description: "Your integration stops hearing about your team's replies and ticket changes.",
      confirmLabel: 'Remove webhook',
      tone: 'danger',
      onConfirm: () => del.mutateAsync().then(() => setSecret(null)),
    });

  const delivery = lastTest ?? w?.last_delivery;

  if (q.isPending)
    return (
      <Card>
        <SkeletonRows rows={4} />
      </Card>
    );
  if (q.isError)
    return (
      <Card>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Card>
    );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid content-start gap-5">
        <Card
          title={`Webhook for ${bot.name}`}
          description="Truplexy posts signed events here when your team replies to a chat API conversation or its ticket changes. Your integration delivers them to the customer."
          actions={w && <Badge tone={w.enabled ? 'live' : 'warn'} dot>{w.enabled ? 'Active' : 'Paused'}</Badge>}
        >
          <div className="grid gap-5">
            {secret && <SecretOnce value={secret} title="Your signing secret" description="Shown once. Set it as TRUPLEXY_WEBHOOK_SECRET on your server to verify deliveries." />}
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (urlOk) onSave();
              }}
            >
              <Field label="Endpoint URL" className="min-w-[240px] flex-1" error={url && !urlOk ? 'Use an https:// URL with no user name, password or #fragment.' : undefined}>
                <Input value={url} disabled={!writable} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://your-server.com/truplexy-webhook" className="font-mono text-xs" />
              </Field>
              {writable && (
                <Button type="submit" variant="accent" loading={save.isPending} disabled={!urlOk || url === w?.url}>
                  {w ? 'Save' : 'Create webhook'}
                </Button>
              )}
            </form>

            {w && (
              <>
                <DescList
                  items={[
                    { label: 'Events', value: <span className="flex flex-wrap gap-1.5">{w.events.map((e) => <Badge key={e} tone="outline" className="font-mono">{e}</Badge>)}</span> },
                    { label: 'Signing secret', value: <code className="font-mono text-xs">{w.secret_hint}</code> },
                    { label: 'Created', value: formatDateTime(w.created_at) },
                  ]}
                />
                {writable && (
                  <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                    <Button size="xs" leading={<Send />} loading={test.isPending} onClick={() => test.mutate(undefined, { onSuccess: setLastTest })}>
                      Send test event
                    </Button>
                    <Switch checked={w.enabled} onCheckedChange={(v) => onSave({ enabled: v })} disabled={save.isPending} />
                    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                      {w.enabled ? <Play className="size-3" /> : <Pause className="size-3" />} {w.enabled ? 'Delivering' : 'Paused'}
                    </span>
                    <span className="flex-1" />
                    <Button size="xs" leading={<RefreshCw />} onClick={() => void onRotate()}>
                      Replace secret
                    </Button>
                    <Button size="xs" variant="danger-ghost" leading={<Trash2 />} onClick={() => void onDelete()}>
                      Remove
                    </Button>
                  </div>
                )}
              </>
            )}
            {!w && !writable && <EmptyState compact icon={<WebhookIcon />} title="No webhook yet" description="An admin can set one up." />}
          </div>
        </Card>

        {delivery && (
          <Card title={lastTest ? 'Test result' : 'Last delivery'}>
            <div className="flex items-start gap-3">
              {delivery.ok ? <CheckCircle2 className="mt-0.5 size-5 text-live" /> : <XCircle className="mt-0.5 size-5 text-danger" />}
              <div className="grid gap-1 text-[0.8125rem]">
                <p className="font-semibold text-ink">
                  {delivery.ok ? 'Delivered' : 'Failed'} · <span className="font-mono text-xs">{delivery.event}</span>
                </p>
                <p className="text-ink-muted">
                  {delivery.status ? `Your server answered ${delivery.status}` : 'No answer'}
                  {delivery.error && ` · ${delivery.error}`} · {formatRelative(delivery.at)}
                </p>
                {!delivery.ok && (
                  <p className="flex items-center gap-1.5 text-xs text-warn">
                    <AlertTriangle className="size-3.5" /> Failed deliveries are retried once, and never undo your team's change.
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>

      <Card title="Verify every delivery" description="Reject anything whose signature doesn't match or is older than 5 minutes.">
        <div className="grid gap-4">
          <DescList
            items={[
              { label: 'X-Truplexy-Event', value: 'message.created, ticket.updated or ping' },
              { label: 'X-Truplexy-Delivery', value: 'Event ID; a retry reuses it' },
              { label: 'X-Truplexy-Signature', value: <code className="font-mono text-xs">t=…,v1=…</code> },
            ]}
          />
          <WebhookCode />
          <p className="text-xs text-ink-faint">Answer 2xx within 2.5 seconds; do slow work after responding.</p>
        </div>
      </Card>
    </div>
  );
}

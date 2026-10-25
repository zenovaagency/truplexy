import { ChatApiReference, CustomerGuide } from './ChatApiGuide';
import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  CircleDot,
  KeyRound,
  Link2,
  Lock,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Webhook as WebhookIcon,
  XCircle,
} from 'lucide-react';
import { useApiKeys } from '@/lib/api/endpoints/business';
import { useChannelIcon, useChannels, useChannelTypes, useCreateChannel, useDeleteChannel, useUpdateChannel } from '@/lib/api/endpoints/channels';
import { useDeleteWebhook, useRotateWebhookSecret, useSaveWebhook, useTestWebhook, useTools, useWebhook } from '@/lib/api/endpoints/bot';
import type { Channel, ChannelInput, Webhook, WebhookDelivery } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber, formatRelative, pluralize } from '@/lib/format';
import { notifySuccess } from '@/lib/notify';
import { hasCode, isApiError } from '@/lib/api/client';
import { useScopeCtx } from '@/lib/session/scope-context';
import { isShopifyChannel, shopifyToolsUnavailable } from '@/lib/shopify';
import {
  Badge,
  Button,
  Callout,
  Card,
  CodeBlock,
  DataTable,
  DescList,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Page,
  PageHeader,
  SecretOnce,
  Select,
  Sheet,
  Skeleton,
  SkeletonRows,
  SubNav,
  Switch,
  Textarea,
  Tip,
  useConfirm,
  type Column,
} from '@/components/ui';
import { ChannelStatusBadge, ChannelTypeIcon } from '@/components/domain/ChannelBadge';
import { AutoCloseField, formatAutoClose } from '@/components/domain/AutoCloseField';
import { IssueKeyForm } from '@/features/api-keys/IssueKey';
import { GROUP_LABEL, INTEGRATIONS, IntegrationIcon, channelsFor, keysFor, type Integration, type IntegrationGroup } from './catalog';
import { useCopy } from '@/hooks';
import { ConnectReturnBanner, ShopifyConnectButton, ShopifyToolsPrompt, useConnectReturn } from './shopify';
import { buildLlmGuide } from './llm-guide';
import { ALL_LANGS, LangPicker, RecipeCode, RecipePicker, useLang, useLangPack, useRecipe, useWebRecipes } from './languages';
import { WEB_SDK_DOCS, type IntegrationCode, type Lang, type LangPack } from './snippets/types';

/** Turning a Shopify channel on can't undo an uninstall in Shopify: the store's access is gone until it's connected again. */
const SHOPIFY_SWITCH_NOTE = "Turning it back on doesn't restore the store's tools after an uninstall in Shopify; Reconnect does.";

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
          { to: href('integrations'), label: 'Your channels', icon: <Radio />, end: true },
          { to: href('integrations/guides'), label: 'Add a channel', icon: <Plus /> },
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
  const { can, scope, href } = useScopeCtx();
  const keys = useApiKeys(can('integrations.read'));
  const channels = useChannels();
  const types = useChannelTypes();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<IntegrationGroup | 'all' | 'connected'>('all');
  /** A platform admin marked the integration's channel type upcoming: it can't be added yet. */
  const isUpcoming = (i: Integration) => Boolean(i.channelType && types.data?.some((t) => t.id === i.channelType && t.upcoming));
  /**
   * The same catalog as Platform → Channel types: an integration whose channel type
   * the platform doesn't list (hidden and unused, or not in the catalog) isn't shown.
   * If the catalog can't be read, show everything rather than an empty page.
   */
  const available = useMemo(
    () =>
      types.data
        ? INTEGRATIONS.filter((i) => !i.channelType || types.data.some((t) => t.id === i.channelType))
        : // Shopify can only be connected when the API lists the type, so it waits for the catalog.
          INTEGRATIONS.filter((i) => i.connect !== 'shopify'),
    [types.data],
  );
  // Connect integrations have no guide, even from an old ?guide= link.
  const open = available.find((i) => i.id === params.get('guide') && !i.connect);
  const back = useConnectReturn();
  // An install started inside Shopify lands here with ?shopify_shop=<store>: prefill it, and the person presses Connect.
  const [shop] = useState(() => params.get('shopify_shop') ?? undefined);
  useEffect(() => {
    if (params.has('shopify_shop')) setParams((p) => (p.delete('shopify_shop'), p), { replace: true });
  }, [params, setParams]);

  /** Its active channels when it has a channel type; otherwise keys named after it. */
  const connected = (i: Integration): unknown[] => (i.channelType ? channelsFor(i, channels.data ?? []) : keysFor(i, keys.data ?? [], scope.bot));
  const list = useMemo(
    () =>
      available.filter(
        (i) =>
          (group === 'all' || (group === 'connected' ? connected(i).length > 0 : i.group === group)) &&
          (!q || `${i.name} ${i.blurb}`.toLowerCase().includes(q.toLowerCase())),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [available, q, group, keys.data, channels.data],
  );
  const groups = (Object.keys(GROUP_LABEL) as IntegrationGroup[]).filter((g) => list.some((i) => i.group === g));
  const connectedCount = available.filter((i) => connected(i).length).length;

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

      {back.failed && <ConnectReturnBanner code={back.failed} onDismiss={back.dismissFailed} />}
      {back.connected && <ShopifyToolsPrompt onDismiss={back.dismissConnected} />}

      {types.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, n) => (
            <Skeleton key={n} className="h-[148px] rounded-[14px]" />
          ))}
        </div>
      ) : (
        !list.length && <EmptyState compact icon={<Search />} title="No channels match" />
      )}

      {(types.isPending ? [] : groups).map((g) => (
        <section key={g} className="grid gap-3">
          <h2 className="mono text-ink-faint">{GROUP_LABEL[g]}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list
              .filter((i) => i.group === g)
              .map((i) => {
                // Channels it already has keep working, so only an unused upcoming type becomes a plain card.
                if (isUpcoming(i) && !connected(i).length)
                  return (
                    <div key={i.id} className={cn(CARD, 'opacity-80')} aria-disabled="true">
                      <CardHead i={i} />
                      <div className="mt-auto flex items-center justify-between pt-3">
                        <Badge tone="accent" dot>Upcoming</Badge>
                        <span className="text-xs text-ink-faint">Not available yet</span>
                      </div>
                    </div>
                  );
                if (i.connect === 'soon')
                  return (
                    <div key={i.id} className={cn(CARD, 'opacity-80')} aria-disabled="true">
                      <CardHead i={i} />
                      <div className="mt-auto flex items-center justify-between pt-3">
                        <Badge tone="accent" dot>Coming soon</Badge>
                        <span className="text-xs text-ink-faint">One-click connect is on its way</span>
                      </div>
                    </div>
                  );
                if (i.connect === 'shopify') return <ShopifyCard key={i.id} i={i} channels={(channels.data ?? []).filter(isShopifyChannel)} prefill={shop} />;
                const n = connected(i).length;
                const card = (
                  <>
                    <CardHead i={i} />
                    <div className="mt-auto flex items-center justify-between pt-3">
                      {n ? (
                        <Badge tone="live" dot>
                          Connected{n > 1 ? ` · ${n} ${i.channelType ? 'channels' : 'keys'}` : ''}
                        </Badge>
                      ) : (
                        <span className="text-xs text-ink-faint">Not connected</span>
                      )}
                      <span className="text-[0.8125rem] font-semibold text-accent">{i.id === 'webhooks' ? 'Configure →' : n ? 'View guide →' : 'Set up →'}</span>
                    </div>
                  </>
                );
                const cls = cn(CARD, 'transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md');
                return i.id === 'webhooks' ? (
                  <Link key={i.id} to={href('integrations/webhook')} className={cls}>
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

const CARD = 'panel flex min-h-[148px] flex-col p-4 text-left';

/** A catalog card's top: logo, name and blurb. */
function CardHead({ i }: { i: Integration }) {
  return (
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
  );
}

/** Shopify: one Connect button, no guide or code. */
function ShopifyCard({ i, channels, prefill }: { i: Integration; channels: Channel[]; prefill?: string }) {
  const { href, can } = useScopeCtx();
  const tools = useTools(can('tools.read'));
  const active = channels.filter((c) => c.active);
  // Off by the business's switch or by an uninstall in Shopify: the API can't tell which, so offer Reconnect.
  const stale = active.length ? (shopifyToolsUnavailable(tools.data?.data) ? active[0] : undefined) : channels.find((c) => !c.disabled_by_platform);
  return (
    <div className={CARD}>
      <CardHead i={i} />
      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
        {stale ? (
          <>
            <Badge tone="warn" dot className="min-w-0">
              <span className="truncate">{active.length ? 'Reconnect your store' : 'Disconnected'}</span>
            </Badge>
            <ShopifyConnectButton account={stale.external_id} size="xs" variant="soft">
              Reconnect
            </ShopifyConnectButton>
          </>
        ) : active.length ? (
          <>
            <Badge tone="live" dot className="min-w-0">
              <span className="truncate">{active.length > 1 ? `Connected · ${active.length} stores` : `Connected · ${active[0]!.external_id}`}</span>
            </Badge>
            {prefill ? (
              <ShopifyConnectButton size="xs" variant="soft" prefill={prefill} />
            ) : (
              <Link to={href('integrations')} className="shrink-0 text-[0.8125rem] font-semibold text-accent hover:underline">
                Manage →
              </Link>
            )}
          </>
        ) : channels.length ? (
          <span className="text-xs text-ink-faint">Turned off by the platform</span>
        ) : (
          <>
            <span className="text-xs text-ink-faint">Not connected</span>
            <ShopifyConnectButton size="xs" prefill={prefill} />
          </>
        )}
      </div>
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
  const channels = useChannels();
  const webhook = useWebhook();
  const ofType = i?.channelType ? (channels.data ?? []).filter((c) => c.type === i.channelType) : [];
  // Keys bound to the integration's channels; integrations without a channel type match key names.
  const existing = !i
    ? []
    : i.channelType
      ? (keys.data ?? []).filter((k) => k.status === 'active' && k.channel_id && ofType.some((c) => c.id === k.channel_id))
      : keysFor(i, keys.data ?? [], scope.bot);
  const [issued, setIssued] = useState(false);
  const [channelId, setChannelId] = useState('');
  useEffect(() => setIssued(false), [i?.id]);
  // Bind new keys to the first working channel of the type.
  // A ?channel= link from Your channels preselects that channel.
  const [params] = useSearchParams();
  const wanted = params.get('channel');
  const firstActive = (ofType.find((c) => c.id === wanted && c.active) ?? ofType.find((c) => c.active))?.id ?? '';
  useEffect(() => setChannelId(firstActive), [i?.id, firstActive]);
  const picked = ofType.find((c) => c.id === channelId);
  const langs = i?.langs ?? [];
  const steps = i?.steps ?? [];
  const [lang, setLang] = useLang(langs);
  const pack = useLangPack(lang);
  const code = pack.data?.integrations[i?.id ?? ''];
  const hook = code && pack.data && (code.receiver ?? (code.deliver || code.escalation ? pack.data.receiver(code) : null));
  const where = i?.widget ? 'your site' : i?.name;
  const { copied, copy } = useCopy(2400);
  // Wait for the code unless it failed to load; a guide without it would mislead the assistant.
  const llmReady = langs.length === 0 || Boolean(pack.data) || pack.isError;

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
              <span className="font-semibold text-ink">How it works:</span>{' '}
              {i.widget ? (
                <>
                  The Truplexy widget on your site sends each message to one route on your server, which asks Truplexy with a chat key. When your team replies from Tickets, the reply shows up in the widget by itself.
                </>
              ) : (
                <>
                  {i.name} sends each message to your server, your server asks Truplexy with a chat key, and sends the reply back. When your team replies from Tickets, Truplexy signs a webhook to your server so it can deliver the message.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="text-[0.8125rem] text-ink-muted">Building this with an AI assistant? Give it the whole guide.</span>
            <Button
              size="xs"
              variant="soft"
              leading={copied ? <Check className="text-live" /> : <Copy />}
              disabled={!llmReady}
              onClick={() => {
                void copy(buildLlmGuide({ integration: i, botName: bot.name, channels: ofType, lang: langs.length ? lang : undefined, pack: pack.data, code, hook }));
                notifySuccess('Guide copied', 'Paste it into your AI assistant. It holds no keys or secrets.');
              }}
            >
              {copied ? 'Copied' : 'Copy for LLM'}
            </Button>
          </div>
          <Callout tone="warn" icon={<ShieldCheck />} title="Keys stay on your server">
            Never put a chat key in a website, mobile app or theme file. Anyone could copy it.
          </Callout>
          {langs.length > 0 && i.id !== 'web' && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="text-[0.8125rem] text-ink-muted">Your server's language</span>
              <LangPicker langs={langs} value={lang} onChange={setLang} />
            </div>
          )}

          {!i.teamSide && (i.id === 'api' ? <ChatApiReference /> : <CustomerGuide />)}
          <ol className="grid">
            <Step n={1} title={i.channelType ? 'Add the channel and issue its key' : 'Issue a chat key'} done={existing.length > 0 || issued}>
              {i.channelType && <GuideChannel integration={i} channels={ofType} value={channelId} onChange={setChannelId} />}
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
                <IssueKeyForm compact defaultName={`${picked?.name ?? i.name} · Production`} defaultChannel={channelId} onIssued={() => setIssued(true)} />
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

            <Step n={2} title={i.id === 'web' ? 'Add the route to your server' : i.widget ? 'Install the plugin' : i.teamSide ? `Set up ${i.name}` : `Receive ${i.name} messages`}>
              <ol className={cn('grid gap-1.5 text-[0.8125rem] text-ink-muted marker:text-ink-faint', steps.length > 1 && 'list-decimal pl-5')}>
                {steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {i.id === 'web' ? (
                <WebServerCode lang={lang} setLang={setLang} pack={pack.data} code={code} packError={pack.isError} />
              ) : code && pack.data ? (
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

            {i.id === 'web' && (
              <Step n={3} title="Add the widget to your site">
                <WebWidgetCode />
              </Step>
            )}

            {i.widget ? (
              <Step n={i.id === 'web' ? 4 : 3} title="Your team's replies">
                <p className="text-[0.8125rem] text-ink-muted">
                  The visitor’s name and email link the conversation and its ticket to Customers. When someone replies from Tickets, the widget shows it live, or within a few seconds where live updates aren't available. Visitors keep their conversation when they reload or come back later.
                </p>
              </Step>
            ) : (
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
            )}

            <Step n={i.id === 'web' ? 5 : 4} title="Try it">
              <ul className="grid gap-1.5 text-[0.8125rem] text-ink-muted">
                <li className="flex gap-2"><CircleDot className="mt-0.5 size-3.5 shrink-0 text-accent" /> Send a message on {where}. The reply should arrive within a few seconds.</li>
                {!i.teamSide && <li className="flex gap-2"><CircleDot className="mt-0.5 size-3.5 shrink-0 text-accent" /> For an identified visitor, open Customers and check the contact and conversation link. Any tickets should carry that customer too.</li>}
                <li className="flex gap-2"><CircleDot className="mt-0.5 size-3.5 shrink-0 text-accent" /> Ask for a person. The conversation shows up under Tickets → Handoffs.</li>
                <li className="flex gap-2"><CircleDot className="mt-0.5 size-3.5 shrink-0 text-accent" /> Take it over and reply from the ticket. Your reply should appear on {where}.</li>
              </ul>
              {i.widget && (
                <a href={WEB_SDK_DOCS} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-accent hover:underline">
                  <BookOpen className="size-3.5" /> Website SDK docs: every option, event and framework
                </a>
              )}
            </Step>
          </ol>
        </div>
      )}
    </Sheet>
  );
}

/** Website chat, step 2: the widget's route, in the person's framework or any server language. */
function WebServerCode({ lang, setLang, pack, code, packError }: { lang: Lang; setLang: (l: Lang) => void; pack?: LangPack; code?: IntegrationCode; packError: boolean }) {
  const recipes = useWebRecipes();
  const [pick, setPick] = useRecipe('web-server', 'nextjs');
  const list = recipes.data?.SERVER_RECIPES ?? [];
  const recipe = list.find((r) => r.id === pick);
  return (
    <>
      <RecipePicker label="Your server" recipes={list} value={pick} onChange={setPick} other="Another language" />
      {pick === 'other' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="text-[0.8125rem] text-ink-muted">Language</span>
            <LangPicker langs={['node', 'python', 'php', 'go']} value={lang} onChange={setLang} />
          </div>
          {code && pack ? <CodeBlock key={lang} samples={[{ label: code.file ?? pack.files.server, code: code.handler }]} /> : <CodeLoading error={packError} />}
          <p className="text-xs text-ink-faint">
            Another language? The route is one POST endpoint;{' '}
            <a href={`${WEB_SDK_DOCS}#protocol`} target="_blank" rel="noreferrer" className="text-accent hover:underline">the protocol</a> describes it in full.
          </p>
        </>
      ) : recipe ? (
        <RecipeCode recipe={recipe} />
      ) : (
        <CodeLoading error={recipes.isError} />
      )}
      {recipes.data && pick !== 'other' && <details className="text-[0.8125rem] text-ink-muted">
        <summary className="cursor-pointer font-semibold text-ink">Link signed-in customers</summary>
        <p className="my-3">Return trusted contacts from your server session. This overrides the name/email form for new conversations. Return null to use the form; use details="off" when your server supplies identity.</p>
        <CodeBlock title={recipes.data.CUSTOMER_RECIPE.name} code={recipes.data.CUSTOMER_RECIPE.code} />
      </details>}
    </>
  );
}

/** Website chat, step 3: the widget, in the person's frontend framework. */
function WebWidgetCode() {
  const recipes = useWebRecipes();
  const [pick, setPick] = useRecipe('web-widget', 'html');
  const list = recipes.data?.WIDGET_RECIPES ?? [];
  const recipe = list.find((r) => r.id === pick) ?? list[0];
  return (
    <>
      <RecipePicker label="Your site" recipes={list} value={recipe?.id ?? pick} onChange={setPick} />
      {recipe ? <RecipeCode recipe={recipe} /> : <CodeLoading error={recipes.isError} />}
      <p className="text-xs text-ink-faint">
        Set <code className="font-mono">endpoint</code> to your route from step 2. Change the look with <code className="font-mono">heading</code>,{' '}
        <code className="font-mono">greeting</code>, <code className="font-mono">accent</code>, <code className="font-mono">theme</code> and{' '}
        <code className="font-mono">position</code>.
      </p>
    </>
  );
}

/** Step 1 of a guide: the channel its key is bound to, added on the spot if there is none. */
function GuideChannel({ integration: i, channels, value, onChange }: { integration: Integration; channels: Channel[]; value: string; onChange: (id: string) => void }) {
  const { can, href } = useScopeCtx();
  const types = useChannelTypes();
  const create = useCreateChannel();
  const [name, setName] = useState('');
  useEffect(() => setName(''), [i.id]);
  const type = types.data?.find((t) => t.id === i.channelType && t.offered);

  if (channels.length > 0) {
    return (
      <div className="grid gap-2">
        <ul className="grid gap-1.5">
          {channels.map((c) => (
            <li key={c.id}>
              <label
                className={cn(
                  'flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-[0.8125rem]',
                  value === c.id ? 'border-accent bg-accent-soft/50' : 'border-line',
                  c.active ? 'cursor-pointer' : 'opacity-60',
                )}
              >
                <input type="radio" name="guide-channel" className="accent-[var(--color-accent)]" checked={value === c.id} disabled={!c.active} onChange={() => onChange(c.id)} />
                <span className="flex-1 truncate font-medium text-ink">{c.name}</span>
                <span className="text-xs text-ink-faint">{pluralize(c.api_keys, 'key')}</span>
                <ChannelStatusBadge channel={c} />
              </label>
            </li>
          ))}
        </ul>
        {can('channels.write') && i.channelType && (
          <Link to={href(`integrations?add=${i.channelType}`)} className="justify-self-start text-xs font-semibold text-accent hover:underline">
            Add another {channels[0]!.type_label} channel →
          </Link>
        )}
      </div>
    );
  }
  if (types.isPending) return <Skeleton className="h-9 rounded-[10px]" />;
  if (!type)
    return (
      <p className="text-[0.8125rem] text-ink-muted">
        {types.data?.some((t) => t.id === i.channelType && t.upcoming) ? `${i.name} channels aren't available yet.` : `Truplexy doesn't offer ${i.name} channels right now.`} You can still issue a key
        without one.
      </p>
    );
  if (!can('channels.write'))
    return (
      <p className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
        <Lock className="size-3.5" /> Ask an admin to add a {type.label} channel.
      </p>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ type: type.id, name: name.trim() || i.name }, { onSuccess: (c) => onChange(c.id) });
      }}
    >
      <Field label={`${type.label} channel`} hint="Name it after the server, site or number, so tickets show where they came from." className="min-w-[200px] flex-1">
        <Input size="sm" value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder={i.name} />
      </Field>
      <Button type="submit" size="sm" variant="soft" leading={<Plus />} loading={create.isPending}>
        Add channel
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Your channels                                                       */
/* ------------------------------------------------------------------ */

export function ChannelsTab() {
  const { can, href, bot } = useScopeCtx();
  const q = useChannels();
  const iconOf = useChannelIcon();
  const update = useUpdateChannel();
  const del = useDeleteChannel();
  const confirm = useConfirm();
  const writable = can('channels.write');
  const [edit, setEdit] = useState<Channel | 'new' | { type: string } | null>(null);
  const back = useConnectReturn();
  const tools = useTools(can('tools.read'));
  // The store's channel is active, but its tools aren't: the app was uninstalled in Shopify.
  const lostAccess = (c: Channel) => isShopifyChannel(c) && c.active && shopifyToolsUnavailable(tools.data?.data);
  // A guide's "Add another" link arrives as ?add=<type>.
  const [params, setParams] = useSearchParams();
  const add = params.get('add');
  useEffect(() => {
    if (!add || !writable) return;
    setEdit({ type: add });
    setParams((p) => (p.delete('add'), p), { replace: true });
  }, [add, writable, setParams]);

  const onDelete = (c: Channel) =>
    confirm(
      isShopifyChannel(c)
        ? {
            title: `Delete “${c.name}”?`,
            description: `This also uninstalls the Truplexy app from ${c.external_id || 'the store'} (unless another of your bots uses the store), and ${bot.name} stops looking up its orders and products. Existing tickets keep the channel's name.`,
            confirmLabel: 'Delete and uninstall',
            tone: 'danger',
            onConfirm: () => del.mutateAsync(c.id),
          }
        : {
            title: `Delete “${c.name}”?`,
            description: c.api_keys
              ? `${pluralize(c.api_keys, 'active API key')} still ${c.api_keys === 1 ? 'uses' : 'use'} it. Revoke them under API keys first.`
              : "Its conversations and tickets keep the channel's name and type.",
            confirmLabel: 'Delete channel',
            tone: 'danger',
            onConfirm: () => del.mutateAsync(c.id),
          },
    );

  const toggle = (c: Channel, enabled: boolean) =>
    update.mutate(
      { id: c.id, patch: { enabled } },
      {
        onSuccess: () =>
          notifySuccess(
            enabled ? `${c.name} is on` : isShopifyChannel(c) ? `${c.name} is off. Its order and product lookups stop.` : `${c.name} is off. Its keys stop working.`,
            enabled && isShopifyChannel(c) ? SHOPIFY_SWITCH_NOTE : undefined,
          ),
      },
    );

  const columns: Column<Channel>[] = [
    {
      key: 'name',
      header: 'Channel',
      cell: (c) => (
        <span className="flex items-center gap-3">
          <ChannelTypeIcon icon={iconOf(c.type)} size={32} />
          <span className="grid min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-semibold text-ink">{c.name}</span>
              {isShopifyChannel(c) && <Badge tone="outline" className="shrink-0 px-1.5 py-0 text-[0.65rem]">Shopify</Badge>}
            </span>
            <span className="truncate text-xs text-ink-faint">
              {c.type_label}
              {c.external_id && (
                <>
                  {' · '}
                  <span className="font-mono">{c.external_id}</span>
                </>
              )}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) =>
        lostAccess(c) ? (
          <Tip content="Shopify no longer gives Truplexy access to this store, so order and product lookups don't work. Reconnect to restore them.">
            <Badge tone="warn" dot>Reconnect your store</Badge>
          </Tip>
        ) : (
          <ChannelStatusBadge channel={c} />
        ),
    },
    {
      key: 'tickets',
      header: 'Tickets',
      align: 'right',
      cell: (c) => (
        <Link to={href(`tickets?view=all&channel=${c.id}`)} className="whitespace-nowrap tabular-nums hover:underline">
          <span className="font-semibold text-ink">{formatNumber(c.open_tickets)}</span> <span className="text-ink-faint">open · {formatNumber(c.tickets)}</span>
        </Link>
      ),
    },
    {
      key: 'keys',
      header: 'Keys',
      align: 'right',
      hideBelowLg: true,
      cell: (c) =>
        isShopifyChannel(c) ? (
          <Tip content="Connected with Truplexy's Shopify app: no key needed">
            <span className="text-ink-faint">—</span>
          </Tip>
        ) : (
          <span className="tabular-nums text-ink-muted">{formatNumber(c.api_keys)}</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      hideOnCard: !writable,
      cell: (c) => {
        if (!writable) return null;
        // Platforms you run yourself keep their steps, so a 2nd or 3rd bot or server can follow them too.
        const guide = INTEGRATIONS.find((i) => i.channelType === c.type && !i.connect);
        return (
          <span className="flex items-center justify-end gap-1">
            {guide && (
              <Tip content={`${guide.name} setup guide`}>
                <Button asChild size="xs" icon variant="quiet" aria-label={`Setup guide for ${c.name}`}>
                  <Link to={href(`integrations/guides?guide=${guide.id}&channel=${c.id}`)}>
                    <BookOpen />
                  </Link>
                </Button>
              </Tip>
            )}
            {/* After an uninstall in Shopify the channel is just off; only Reconnect brings its tools back, so it's always offered. */}
            {isShopifyChannel(c) && c.external_id && !c.disabled_by_platform && (
              <span className="mr-1">
                <ShopifyConnectButton account={c.external_id} size="xs" variant={lostAccess(c) || !c.enabled ? 'accent' : 'soft'}>
                  Reconnect
                </ShopifyConnectButton>
              </span>
            )}
            {/* The business's switch can't undo the platform's, so don't offer it. */}
            {c.disabled_by_platform ? (
              <Tip content="Turned off by the platform. Only Truplexy can turn it back on.">
                <span className="mr-1 inline-grid size-7 place-items-center text-ink-faint" aria-label="Turned off by the platform">
                  <Lock className="size-3.5" />
                </span>
              </Tip>
            ) : (
              <Tip
                content={
                  isShopifyChannel(c)
                    ? c.enabled
                      ? 'Turn off: its order and product lookups stop'
                      : `Turn on. ${SHOPIFY_SWITCH_NOTE}`
                    : c.enabled
                      ? 'Turn off: its keys stop working'
                      : 'Turn on'
                }
              >
                <span className="mr-1 inline-flex">
                  <Switch checked={c.active} disabled={update.isPending} onCheckedChange={(v) => toggle(c, v)} />
                </span>
              </Tip>
            )}
            <Tip content="Edit">
              <Button size="xs" icon variant="quiet" onClick={() => setEdit(c)} aria-label={`Edit ${c.name}`}>
                <Pencil />
              </Button>
            </Tip>
            <Tip content="Delete">
              <Button size="xs" icon variant="quiet" className="hover:text-danger" onClick={() => void onDelete(c)} aria-label={`Delete ${c.name}`}>
                <Trash2 />
              </Button>
            </Tip>
          </span>
        );
      },
    },
  ];

  return (
    <div className="grid gap-5">
      {back.failed && <ConnectReturnBanner code={back.failed} onDismiss={back.dismissFailed} />}
      {back.connected && <ShopifyToolsPrompt onDismiss={back.dismissConnected} />}
      <Card
        flush
        title={`Channels of ${bot.name}`}
        description="Each place customers reach the assistant, such as a Discord server or your website's chat. Tickets show which channel they came from."
        actions={
          writable && (
            <span className="flex items-center gap-2">
              <Button asChild variant="soft" size="sm" leading={<Link2 />}>
                <Link to={href('integrations/guides')}>Connect a platform</Link>
              </Button>
              <Button variant="accent" size="sm" leading={<Plus />} onClick={() => setEdit('new')}>
                Add channel
              </Button>
            </span>
          )
        }
      >
        {q.isPending ? (
          <SkeletonRows rows={3} className="p-4" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={q.data}
            getKey={(c) => c.id}
            selectedKey={back.connected?.channelId ?? undefined}
            empty={
              <EmptyState
                icon={<Radio />}
                title="No channels yet"
                description="Connect your Shopify store in one click, or add a channel for each place you run yourself and issue its API key."
                action={
                  <Button asChild variant={writable ? 'accent' : 'soft'} leading={<Plus />}>
                    <Link to={href('integrations/guides')}>Add your first channel</Link>
                  </Button>
                }
              />
            }
          />
        )}
        {!writable && (
          <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-ink-faint">
            <Lock className="size-3.5" /> Only admins and owners can add or change channels.
          </p>
        )}
      </Card>
      <Callout tone="neutral" icon={<KeyRound />} title="Bind a key to each channel you run">
        Connected Shopify stores need no key. For a channel your own server runs, issue a chat API key with the channel picked, and every conversation it starts is marked with that channel. Turning the
        channel off stops its keys until you turn it back on.{' '}
        <Link to={href('integrations/guides')} className="font-semibold text-accent hover:underline">
          Setup guides →
        </Link>
      </Callout>
      <ChannelSheet channel={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

const EMPTY_CHANNEL: ChannelInput = { type: '', name: '', description: '', external_id: '', enabled: true, auto_close_hours: null };

function ChannelSheet({ channel, onClose }: { channel: Channel | 'new' | { type: string } | null; onClose: () => void }) {
  const types = useChannelTypes(Boolean(channel));
  const create = useCreateChannel();
  const update = useUpdateChannel();
  const existing = channel && channel !== 'new' && 'id' in channel ? channel : null;
  const presetType = channel && channel !== 'new' && !('id' in channel) ? channel.type : '';
  const [c, setC] = useState<ChannelInput>(EMPTY_CHANNEL);
  useEffect(() => {
    if (!channel) return;
    setC(
      existing
        ? {
            type: existing.type,
            name: existing.name,
            description: existing.description,
            external_id: existing.external_id,
            enabled: existing.enabled,
            auto_close_hours: existing.auto_close_hours ?? null,
          }
        : { ...EMPTY_CHANNEL, type: presetType },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);
  const set = <K extends keyof ChannelInput>(k: K, v: ChannelInput[K]) => setC((x) => ({ ...x, [k]: v }));

  const { href } = useScopeCtx();
  const connected = Boolean(existing && isShopifyChannel(existing));
  // Offered types, upcoming ones (listed but not pickable), and the channel's own
  // type even when it's upcoming or hidden now: it may keep it. Shopify stores are
  // added with Connect, never by hand.
  const own = types.data?.find((t) => t.id === existing?.type);
  const options = (types.data ?? [])
    .filter((t) => ((t.offered || t.upcoming) && !isShopifyChannel({ type: t.id })) || t.id === existing?.type)
    .map((t) =>
      t.offered
        ? { value: t.id, label: t.label }
        : t.id === existing?.type
          ? { value: t.id, label: `${t.label} (${t.upcoming ? 'upcoming' : 'no longer offered'})` }
          : { value: t.id, label: `${t.label} · Upcoming`, disabled: true },
    );
  const valid = Boolean(c.type && c.name.trim());
  const saving = create.isPending || update.isPending;

  const save = () => {
    const body: ChannelInput = { ...c, name: c.name.trim(), description: c.description.trim(), external_id: c.external_id.trim() };
    if (!existing) return create.mutate(body, { onSuccess: onClose });
    // Send only what changed, so an unchanged hidden type isn't rejected.
    const patch = Object.fromEntries(Object.entries(body).filter(([k, v]) => (existing[k as keyof ChannelInput] ?? null) !== v)) as Partial<ChannelInput>;
    if (!Object.keys(patch).length) return onClose();
    update.mutate({ id: existing.id, patch }, { onSuccess: () => (notifySuccess('Channel saved'), onClose()) });
  };

  return (
    <Sheet
      open={Boolean(channel)}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? existing.name : 'Add a channel'}
      description={existing ? `${existing.type_label} · added ${formatRelative(existing.created_at)}` : 'A place customers reach the assistant. Bind an API key to it afterwards.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={saving} disabled={!valid} onClick={save}>
            {existing ? 'Save channel' : 'Add channel'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save();
        }}
      >
        {existing?.disabled_by_platform && (
          <Callout tone="danger" icon={<AlertTriangle />} title="Turned off by the platform">
            {connected ? 'The assistant stops answering there' : "Its keys don't work"}, and only Truplexy can turn it back on. Contact support if you think this is a mistake.
          </Callout>
        )}
        <Field
          label="Type"
          hint={
            connected ? (
              `Connected to ${existing?.external_id || 'a Shopify store'}.`
            ) : existing ? (
              own && !own.offered && c.type === own.id ? (
                `${own.upcoming ? `${own.label} isn't available for new channels yet` : `Truplexy no longer offers new ${own.label} channels`}. This one keeps working, and you can still change it as long as its type stays.`
              ) : undefined
            ) : (
              <>
                Shopify stores are added with Connect under{' '}
                <Link to={href('integrations/guides')} onClick={onClose} className="text-accent hover:underline">
                  Add a channel
                </Link>
                .
              </>
            )
          }
        >
          <Select value={c.type} onChange={(e) => set('type', e.target.value)} disabled={connected} placeholder={types.isPending ? 'Loading…' : 'Pick a type'} options={options} />
        </Field>
        <Field label="Name" hint="Unique among this bot's channels, e.g. “Acme Telegram” or “Storefront chat”." aside={`${c.name.length}/80`}>
          <Input value={c.name} onChange={(e) => set('name', e.target.value.slice(0, 80))} />
        </Field>
        <Field label="Description" optional aside={`${c.description.length}/300`}>
          <Textarea rows={3} value={c.description} onChange={(e) => set('description', e.target.value.slice(0, 300))} />
        </Field>
        {!connected && (
          <Field label="External ID" optional hint="The platform's own ID for it, such as a Discord server ID or a phone number." aside={`${c.external_id.length}/128`}>
            <Input value={c.external_id} onChange={(e) => set('external_id', e.target.value.slice(0, 128))} className="font-mono text-xs" />
          </Field>
        )}
        <Switch
          checked={c.enabled && !existing?.disabled_by_platform}
          onCheckedChange={(v) => set('enabled', v)}
          disabled={existing?.disabled_by_platform}
          label="On"
          description={
            existing?.disabled_by_platform
              ? "Turned off by the platform. Your switch has no effect until Truplexy turns it back on."
              : connected
              ? c.enabled
                ? "The assistant can look up the store's orders and products."
                : `Order and product lookups are off until it's back on. ${SHOPIFY_SWITCH_NOTE}`
              : c.enabled
                ? 'Keys bound to it work.'
                : "Keys bound to it are refused until it's back on."
          }
        />
        <AutoCloseField
          value={c.auto_close_hours ?? null}
          onChange={(v) => set('auto_close_hours', v)}
          inheritLabel={
            existing && existing.auto_close_hours === null
              ? `Default (now ${formatAutoClose(existing.effective_auto_close_hours).toLowerCase()})`
              : "The channel type's or business's time"
          }
          hint="Open tickets from this channel close after this long without activity. Tickets marked keep open, and ones waiting on your team, never close on their own."
        />
        <button type="submit" hidden />
      </form>
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
  /** The new webhook's switch; a saved one's is changed in place. */
  const [enabled, setEnabled] = useState(true);
  /** The API's own words for a URL it refused. */
  const [urlError, setUrlError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [lastTest, setLastTest] = useState<WebhookDelivery | null>(null);

  useEffect(() => setUrl(w?.url ?? ''), [w?.url]);

  const urlOk = /^https:\/\/[^\s#@]+$/.test(url) && url.length <= 2000;

  const onSave = (patch?: Partial<Pick<Webhook, 'enabled'>>) => {
    setUrlError(null);
    save.mutate(
      { url: patch ? w!.url : url, enabled: patch?.enabled ?? w?.enabled ?? enabled },
      {
        onSuccess: (r) => {
          if (r.secret) setSecret(r.secret);
          notifySuccess(patch ? (patch.enabled ? 'Deliveries resumed' : 'Deliveries paused') : w ? 'Webhook saved' : 'Webhook created');
        },
        onError: (e) => {
          if (hasCode(e, 'INVALID_REQUEST') && isApiError(e)) setUrlError(e.message);
        },
      },
    );
  };

  const onRotate = () =>
    confirm({
      title: 'Replace the signing secret?',
      description: 'The old secret stops working at once: deliveries are signed with the new one from now on. Update your server right after, or it will reject them.',
      confirmLabel: 'Replace secret',
      tone: 'danger',
      onConfirm: () => rotate.mutateAsync().then((r) => r.secret && setSecret(r.secret)),
    });

  const onDelete = () =>
    confirm({
      title: 'Delete the webhook?',
      description: "Your integration stops hearing about your team's replies and ticket changes. Saving a URL again creates a new secret.",
      confirmLabel: 'Delete webhook',
      tone: 'danger',
      onConfirm: () =>
        del.mutateAsync().then(() => {
          setSecret(null);
          setLastTest(null);
          setEnabled(true);
          setUrlError(null);
        }),
    });

  const delivery = w ? (lastTest ?? w.last_delivery) : undefined;

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
          description="Truplexy calls this URL when your team replies to or updates a ticket from a chat API conversation (message.created, ticket.updated)."
          actions={w && <Badge tone={w.enabled ? 'live' : 'warn'} dot>{w.enabled ? 'Active' : 'Paused'}</Badge>}
        >
          <div className="grid gap-5">
            {secret && (
              <SecretOnce
                value={secret}
                title="Your signing secret"
                description="Save this now: it won't be shown again. Set it as TRUPLEXY_WEBHOOK_SECRET on your server to verify deliveries."
              />
            )}
            {(w || writable) && (
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (urlOk) onSave();
                }}
              >
                <div className="flex flex-wrap items-end gap-2">
                  <Field
                    label="Endpoint URL"
                    className="min-w-[240px] flex-1"
                    error={urlError ?? (url && !urlOk ? 'Use an https:// URL with no user name, password or #fragment.' : undefined)}
                  >
                    <Input
                      value={url}
                      disabled={!writable}
                      onChange={(e) => (setUrl(e.target.value.trim()), setUrlError(null))}
                      placeholder="https://your-server.com/truplexy-webhook"
                      aria-label="Endpoint URL"
                      className="font-mono text-xs"
                    />
                  </Field>
                  {writable && (
                    <Button type="submit" variant="accent" loading={save.isPending} disabled={!urlOk || url === w?.url}>
                      {w ? 'Save' : 'Create webhook'}
                    </Button>
                  )}
                </div>
                {!w && (
                  <Switch
                    checked={enabled}
                    onCheckedChange={setEnabled}
                    label="Enabled"
                    description={enabled ? 'Deliveries start as soon as it is saved.' : 'Saved paused: nothing is delivered until you turn it on.'}
                  />
                )}
              </form>
            )}

            {w && (
              <>
                <DescList
                  items={[
                    { label: 'Deliveries', value: w.enabled ? 'On' : 'Paused' },
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
                      Delete
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

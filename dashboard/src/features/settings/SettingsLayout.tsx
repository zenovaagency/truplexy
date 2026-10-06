import { useEffect, useRef, useState } from 'react';
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
  LogOut,
  Lock,
  Plus,
  Upload,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, hasCode } from '@/lib/api/client';
import { useBusinessTypes, usePlans } from '@/lib/api/endpoints/account';
import { useBots, useCreateBot, useLeaveTenant, useTenant, useUpdateTenant } from '@/lib/api/endpoints/business';
import { useWorkspace } from '@/lib/api/endpoints/bot';
import { useDocuments } from '@/lib/api/endpoints/knowledge';
import type { BotConfig, BusinessTypeId, DocumentList, KnowledgeDocument } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatCompact, formatDate, formatNumber, isoDay } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { qk } from '@/lib/query-keys';
import { scopePath, useScopeCtx } from '@/lib/session/scope-context';
import {
  Badge,
  Button,
  Callout,
  Card,
  Dialog,
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
  const { href, businessName } = useScopeCtx();
  return (
    <Page>
      <PageHeader title="Settings" description={`Business details, plan, bots and backups for ${businessName}.`} />
      <SubNav
        items={[
          { to: href('settings/business'), label: 'Business', icon: <Building2 /> },
          { to: href('settings/plan'), label: 'Plan & usage', icon: <CreditCard /> },
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
  const t = useTenant();
  const plans = usePlans();
  const docs = useDocuments({}).data;
  if (t.isPending) return <Card><SkeletonRows rows={4} /></Card>;
  if (t.isError) return <Card><ErrorState error={t.error} onRetry={() => t.refetch()} /></Card>;
  const b = t.data;
  const overrides = Object.keys(b.limit_overrides ?? {}).length;

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
          <LimitBar label="Team members" used={b.usage.members} limit={b.limits.members} />
          <LimitBar label="Bots" used={b.usage.bots} limit={b.limits.bots} />
          <LimitBar label="Documents in this bot" used={docs?.pages[0]?.total ?? 0} limit={b.limits.documents_per_bot} />
        </div>
        {b.limits.replies_per_month > 0 && b.usage.replies_this_month >= b.limits.replies_per_month && (
          <Callout tone="danger" icon={<AlertTriangle />} title="Your assistant has stopped replying" className="mt-5">
            This month's replies are used up. Customers get no AI answer until the 1st, or until your plan changes.
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
            <table className="table min-w-[560px]">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className="text-right">AI replies / month</th>
                  <th className="text-right">Bots</th>
                  <th className="text-right">Documents / bot</th>
                  <th className="text-right">Members</th>
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
                    <td className="text-right tabular-nums">{limitText(p.limits.bots)}</td>
                    <td className="text-right tabular-nums">{limitText(p.limits.documents_per_bot)}</td>
                    <td className="text-right tabular-nums">{limitText(p.limits.members)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-[0.8125rem] text-ink-muted">Need more replies, bots or seats?</p>
          <Button asChild variant="accent" size="xs">
            <a href="mailto:hello@truplexy.com?subject=Plan%20change">
              Contact us <ArrowRight />
            </a>
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** 0 means unlimited. */
const limitText = (n: number) => (n > 0 ? formatNumber(n) : 'Unlimited');

const ID_RULE = /^[a-z0-9][a-z0-9_-]{0,30}$/;

export function BotsTab() {
  const { can, scope, bot: current } = useScopeCtx();
  const bots = useBots();
  const create = useCreateBot();
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
                <span className="grid size-10 place-items-center rounded-[12px] bg-accent-soft text-accent">
                  <Bot className="size-5" />
                </span>
                <div className="grid min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    {b.name} {b.id === current.id && <Badge tone="live" dot>Current</Badge>}
                  </span>
                  <span className="text-xs text-ink-faint">
                    <code className="font-mono">{b.id}</code> · created {formatDate(b.created_at)} · knowledge v{b.kb_version}
                  </span>
                </div>
                {b.id !== current.id && (
                  <Button size="xs" asChild>
                    <Link to={scopePath({ tenant: scope.tenant, bot: b.id })}>Switch to it</Link>
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
            create.mutate({ bot_id: id, name: name.trim() }, { onSuccess: (b) => nav(scopePath({ tenant: scope.tenant, bot: b.id }, 'llm/prompt')) });
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
        const cur = await api<{ revision: number; bot: BotConfig }>('/workspace', { scope });
        // A legacy prompt can't be written; keep whatever the bot has now.
        await api('/workspace', { method: 'PUT', scope, body: { name: data.workspace.name, bot: { ...data.workspace.bot, prompt: cur.bot.prompt ?? '' }, revision: cur.revision } });
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
        <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-4">
          <div className="grid min-w-[240px] flex-1 gap-0.5">
            <p className="font-semibold text-ink">Delete this business</p>
            <p className="text-[0.8125rem] text-ink-muted">Businesses are deleted by the Truplexy team, so nothing is lost by accident. Download a backup of each bot first.</p>
          </div>
          <Button asChild variant="ghost">
            <a href={`mailto:hello@truplexy.com?subject=${encodeURIComponent(`Delete business ${businessName}`)}`}>Contact support</a>
          </Button>
        </div>
      </section>
    </div>
  );
}

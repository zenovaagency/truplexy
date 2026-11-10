import { useState } from 'react';
import { AlertTriangle, Clock, KeyRound, Lock, MessageCircle } from 'lucide-react';
import { hasCode, isApiError } from '@/lib/api/client';
import { useConnectMeta, useMeta, useUpdateMetaCredentials } from '@/lib/api/endpoints/channels';
import type { Channel, MetaConnectInput, MetaConnection, MetaProvider } from '@/lib/api/types';
import { formatRelative } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import { META_LABEL, metaAccountLabel, metaFieldError, metaWebhookWorking, type MetaField } from '@/lib/meta';
import { Badge, Button, Callout, CopyField, Field, Input, Sheet } from '@/components/ui';
import { SetupGuide } from './SetupGuide';
import { metaAfterSteps, metaSetupSteps } from './metaGuides';

const UNAVAILABLE = "Messenger and Instagram connections aren't set up on this server yet.";

type Errors = Partial<Record<MetaField, string>>;

/** Sorts an API refusal into a field's error or one for the whole form. Returns false for errors the app toasts. */
function refusal(provider: MetaProvider, e: unknown, setErrors: (e: Errors) => void, setFormError: (m: string) => void): boolean {
  if (!isApiError(e)) return false;
  if (hasCode(e, 'INVALID_REQUEST')) {
    if (e.field) setErrors({ [e.field as MetaField]: e.message });
    else setFormError(e.message);
  } else if (hasCode(e, 'META_ACCOUNT_TAKEN')) setErrors({ page_id: e.message || `Another of your bots already has this ${META_LABEL[provider].account}.` });
  else if (hasCode(e, 'META_UNAVAILABLE')) setFormError("Meta couldn't be reached to check these. Try again in a minute.");
  else if (hasCode(e, 'CHANNEL_CONNECT_UNAVAILABLE')) setFormError(UNAVAILABLE);
  else if (hasCode(e, 'CHANNEL_TYPE_NOT_ALLOWED')) setFormError(`${META_LABEL[provider].name} isn't available for this bot right now.`);
  else return false;
  return true;
}

/** What to do in Meta before the form, one step at a time with a screenshot of each. */
export function MetaGuide({ provider }: { provider: MetaProvider }) {
  return <SetupGuide steps={metaSetupSteps(provider)} after="Then paste the values below" label={`Set up ${META_LABEL[provider].name} in Meta`} />;
}

const EMPTY: MetaConnectInput = { page_id: '', access_token: '', app_secret: '', name: '' };
const REQUIRED: MetaField[] = ['page_id', 'access_token', 'app_secret'];

/** Opens the connect sheet, or says who can. */
export function MetaConnectButton({
  provider,
  size = 'sm',
  variant = 'accent',
  children,
}: {
  provider: MetaProvider;
  size?: 'xs' | 'sm';
  variant?: 'accent' | 'soft';
  children?: React.ReactNode;
}) {
  const { can } = useScopeCtx();
  const [open, setOpen] = useState(false);
  if (!can('channels.write'))
    return (
      <span className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Lock className="size-3" /> Ask an admin to connect
      </span>
    );
  return (
    <>
      <Button size={size} variant={variant} leading={<MessageCircle />} onClick={() => setOpen(true)}>
        {children ?? (provider === 'instagram' ? 'Connect account' : 'Connect Page')}
      </Button>
      {open && <MetaConnectSheet provider={provider} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Connects the business's own Page for Messenger or its Instagram account: the Meta guide and three
 * pasted values, then the webhook settings to put on the Meta app, watching for Meta to check them.
 */
export function MetaConnectSheet({ provider, onClose }: { provider: MetaProvider; onClose: () => void }) {
  const connect = useConnectMeta(provider);
  const [v, setV] = useState<MetaConnectInput>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const account = connect.data;
  const { name } = META_LABEL[provider];
  const ig = provider === 'instagram';

  const local = (f: MetaField) => (touched ? metaFieldError(f, v[f] ?? '') : null);
  const invalid = [...REQUIRED, 'name' as const].some((f) => metaFieldError(f, v[f] ?? ''));
  const set = (f: MetaField, value: string) => {
    setV((x) => ({ ...x, [f]: value }));
    setErrors((x) => ({ ...x, [f]: undefined }));
  };

  const submit = () => {
    setTouched(true);
    if (invalid) return;
    setErrors({});
    setFormError(null);
    connect.mutate(
      {
        page_id: v.page_id.trim(),
        access_token: v.access_token.trim(),
        app_secret: v.app_secret.trim(),
        ...(v.name?.trim() ? { name: v.name.trim() } : {}),
      },
      { onError: (e) => void refusal(provider, e, setErrors, setFormError) },
    );
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={account ? `${metaAccountLabel(account)} is connected` : ig ? 'Connect your Instagram account' : 'Connect your Facebook Page'}
      description={
        account
          ? 'Last steps in Meta: add the webhook, send a test message, then open it to customers.'
          : ig
            ? 'Answer Instagram Direct messages through your own Meta app. Customers reach the assistant once Meta has reviewed the app.'
            : "Answer your Page's Messenger inbox through your own Meta app. Customers reach the assistant once Meta has reviewed the app."
      }
      footer={
        account ? (
          <Button variant="accent" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="accent" loading={connect.isPending} disabled={touched && invalid} onClick={submit}>
              Connect {name}
            </Button>
          </>
        )
      }
    >
      {account ? (
        <MetaWebhookSetup provider={provider} id={account.channel.id} initial={account} />
      ) : (
        <div className="grid gap-6">
          <section className="grid gap-3">
            <h3 className="text-[0.9375rem] font-bold text-ink">1. Set up in Meta</h3>
            <MetaGuide provider={provider} />
          </section>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <h3 className="text-[0.9375rem] font-bold text-ink">2. Paste the three values</h3>
            {formError && <Callout tone="danger" icon={<AlertTriangle />} title={formError} />}
            <Field
              label="Page ID"
              hint={ig ? 'The Facebook Page your Instagram account is linked to.' : 'A long number, not the Page’s name or address.'}
              error={errors.page_id ?? local('page_id') ?? undefined}
            >
              <Input value={v.page_id} onChange={(e) => set('page_id', e.target.value.slice(0, 40))} inputMode="numeric" className="font-mono text-xs" aria-label="Page ID" />
            </Field>
            <Field label="Access token" hint="The system user's token that never expires, or the Page's access token." error={errors.access_token ?? local('access_token') ?? undefined}>
              <Input
                type="password"
                autoComplete="off"
                value={v.access_token}
                onChange={(e) => set('access_token', e.target.value.slice(0, 1000))}
                className="font-mono text-xs"
                aria-label="Access token"
              />
            </Field>
            <Field label="App secret" hint="App settings → Basic in the same app." error={errors.app_secret ?? local('app_secret') ?? undefined}>
              <Input type="password" autoComplete="off" value={v.app_secret} onChange={(e) => set('app_secret', e.target.value.slice(0, 64))} className="font-mono text-xs" aria-label="App secret" />
            </Field>
            <Field
              label="Channel name"
              optional
              hint={ig ? 'Leave empty to name it after the Instagram username.' : "Leave empty to name it after the Page."}
              error={errors.name ?? local('name') ?? undefined}
              aside={`${v.name?.length ?? 0}/80`}
            >
              <Input value={v.name ?? ''} onChange={(e) => set('name', e.target.value.slice(0, 80))} aria-label="Channel name" />
            </Field>
            <p className="flex items-start gap-2 text-xs text-ink-faint">
              <KeyRound className="mt-0.5 size-3.5 shrink-0" />
              Truplexy checks these with Meta before saving, and keeps the token and secret encrypted. They're never shown again.
            </p>
            <button type="submit" hidden />
          </form>
        </div>
      )}
    </Sheet>
  );
}

/** Whether Meta has reached the webhook yet. */
function WebhookStatus({ account }: { account?: MetaConnection }) {
  if (account?.last_event_at)
    return (
      <Badge tone="live" dot>
        Receiving messages · last {formatRelative(account.last_event_at)}
      </Badge>
    );
  if (account?.webhook_verified_at)
    return (
      <Badge tone="live" dot>
        Webhook verified · send a message to try it
      </Badge>
    );
  return (
    <Badge tone="warn" dot>
      Waiting for Meta to check the webhook
    </Badge>
  );
}

/** The Callback URL and Verify token for the Meta app, and whether Meta has used them. */
export function MetaWebhookSetup({ provider, id, initial }: { provider: MetaProvider; id: string; initial?: MetaConnection }) {
  const [done, setDone] = useState(() => metaWebhookWorking(initial));
  const q = useMeta(provider, id, !done);
  const account = q.data ?? initial;
  if (!done && metaWebhookWorking(q.data)) setDone(true);
  if (!account) return null;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <WebhookStatus account={account} />
        {!metaWebhookWorking(account) && <Clock className="size-3.5 animate-pulse text-ink-faint" aria-hidden />}
      </div>
      <Field label="Callback URL">
        <CopyField value={account.webhook_url} />
      </Field>
      <Field label="Verify token">
        <CopyField value={account.verify_token} masked />
      </Field>
      <SetupGuide steps={metaAfterSteps(provider)} label="Finish in Meta" />
    </div>
  );
}

/**
 * A connected Page or Instagram account in the channel sheet: its webhook settings and a form for a
 * new token or app secret. Nothing for a channel of the type added by hand.
 */
export function MetaPanel({ provider, channel }: { provider: MetaProvider; channel: Channel }) {
  const { can } = useScopeCtx();
  const q = useMeta(provider, channel.id);
  const [editing, setEditing] = useState(false);
  if (!q.data) return null;
  const n = q.data;
  return (
    <section className="grid gap-4 rounded-[14px] border border-line p-4">
      <div className="grid gap-0.5">
        <span className="font-semibold text-ink">{metaAccountLabel(n)}</span>
        <span className="text-xs text-ink-faint">
          Page ID <span className="font-mono">{n.page_id}</span>
          {provider === 'instagram' && (
            <>
              {' · '}Instagram account ID <span className="font-mono">{n.account_id}</span>
            </>
          )}
        </span>
      </div>
      <MetaWebhookSetup provider={provider} id={channel.id} initial={n} />
      {can('channels.write') &&
        (editing ? (
          <UpdateCredentials provider={provider} id={channel.id} onDone={() => setEditing(false)} />
        ) : (
          <div>
            <Button size="sm" variant="soft" leading={<KeyRound />} onClick={() => setEditing(true)}>
              Update credentials
            </Button>
          </div>
        ))}
    </section>
  );
}

function UpdateCredentials({ provider, id, onDone }: { provider: MetaProvider; id: string; onDone: () => void }) {
  const update = useUpdateMetaCredentials(provider, id);
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const local = (f: 'access_token' | 'app_secret', value: string) => (touched ? metaFieldError(f, value) : null);
  const invalid = Boolean(metaFieldError('access_token', token) || metaFieldError('app_secret', secret));
  const save = () => {
    setTouched(true);
    if (invalid) return;
    setErrors({});
    setFormError(null);
    update.mutate({ access_token: token.trim(), app_secret: secret.trim() }, { onSuccess: onDone, onError: (e) => void refusal(provider, e, setErrors, setFormError) });
  };
  // Not a <form>: it sits inside the channel sheet's form.
  return (
    <div className="grid gap-3">
      {formError && <Callout tone="danger" icon={<AlertTriangle />} title={formError} />}
      <Field label="New access token" error={errors.access_token ?? local('access_token', token) ?? undefined}>
        <Input type="password" autoComplete="off" value={token} onChange={(e) => (setToken(e.target.value.slice(0, 1000)), setErrors({}))} className="font-mono text-xs" aria-label="New access token" />
      </Field>
      <Field label="App secret" hint="Of the app that made the token." error={errors.app_secret ?? local('app_secret', secret) ?? undefined}>
        <Input type="password" autoComplete="off" value={secret} onChange={(e) => (setSecret(e.target.value.slice(0, 64)), setErrors({}))} className="font-mono text-xs" aria-label="App secret" />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="accent" loading={update.isPending} onClick={save}>
          Save credentials
        </Button>
      </div>
    </div>
  );
}

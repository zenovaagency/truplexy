import { useState } from 'react';
import { AlertTriangle, Clock, KeyRound, Lock, MessageCircle } from 'lucide-react';
import { hasCode, isApiError } from '@/lib/api/client';
import { useConnectWhatsApp, useUpdateWhatsAppCredentials, useWhatsApp } from '@/lib/api/endpoints/channels';
import type { Channel, WhatsAppConnectInput, WhatsAppConnection } from '@/lib/api/types';
import { formatRelative } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import { whatsAppFieldError, webhookWorking, type WhatsAppField } from '@/lib/whatsapp';
import { Badge, Button, Callout, CopyField, Field, Input, Sheet } from '@/components/ui';
import { SetupGuide } from './SetupGuide';
import { whatsAppAfterSteps, whatsAppSetupSteps } from './metaGuides';

const UNAVAILABLE = "WhatsApp connections aren't set up on this server yet.";

type Errors = Partial<Record<WhatsAppField, string>>;

/** Sorts an API refusal into a field's error or one for the whole form. Returns false for errors the app toasts. */
function refusal(e: unknown, setErrors: (e: Errors) => void, setFormError: (m: string) => void): boolean {
  if (!isApiError(e)) return false;
  if (hasCode(e, 'INVALID_REQUEST')) {
    if (e.field) setErrors({ [e.field as WhatsAppField]: e.message });
    else setFormError(e.message);
  } else if (hasCode(e, 'WHATSAPP_NUMBER_TAKEN')) setErrors({ phone_number_id: e.message || 'Another of your bots already has this number.' });
  else if (hasCode(e, 'WHATSAPP_UNAVAILABLE')) setFormError("Meta couldn't be reached to check these. Try again in a minute.");
  else if (hasCode(e, 'CHANNEL_CONNECT_UNAVAILABLE')) setFormError(UNAVAILABLE);
  else if (hasCode(e, 'CHANNEL_TYPE_NOT_ALLOWED')) setFormError("WhatsApp isn't available for this bot right now.");
  else return false;
  return true;
}

/** What to do in Meta before the form, one step at a time with a screenshot of each. */
function MetaGuide() {
  return <SetupGuide steps={whatsAppSetupSteps()} after="Then paste the values below" label="Set up WhatsApp in Meta" />;
}

const EMPTY: WhatsAppConnectInput = { phone_number_id: '', waba_id: '', access_token: '', app_secret: '', name: '' };
const REQUIRED: WhatsAppField[] = ['phone_number_id', 'waba_id', 'access_token', 'app_secret'];

/** Opens the connect sheet, or says who can. */
export function WhatsAppConnectButton({ size = 'sm', variant = 'accent', children }: { size?: 'xs' | 'sm'; variant?: 'accent' | 'soft'; children?: React.ReactNode }) {
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
        {children ?? 'Connect number'}
      </Button>
      {open && <WhatsAppConnectSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Connects the business's own number: the Meta guide and four pasted values, then the
 * webhook settings to put on the Meta app, watching for Meta to check them.
 */
export function WhatsAppConnectSheet({ onClose }: { onClose: () => void }) {
  const connect = useConnectWhatsApp();
  const [v, setV] = useState<WhatsAppConnectInput>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const number = connect.data;

  const local = (f: WhatsAppField) => (touched ? whatsAppFieldError(f, v[f] ?? '') : null);
  const invalid = [...REQUIRED, 'name' as const].some((f) => whatsAppFieldError(f, v[f] ?? ''));
  const set = (f: WhatsAppField, value: string) => {
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
        phone_number_id: v.phone_number_id.trim(),
        waba_id: v.waba_id.trim(),
        access_token: v.access_token.trim(),
        app_secret: v.app_secret.trim(),
        ...(v.name?.trim() ? { name: v.name.trim() } : {}),
      },
      { onError: (e) => void refusal(e, setErrors, setFormError) },
    );
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={number ? `${number.display_phone || number.channel.name} is connected` : 'Connect your WhatsApp number'}
      description={
        number
          ? 'Last steps in Meta: publish the app, add the webhook, then send a test message.'
          : 'Use a WhatsApp number from your own Meta app. Meta delivers messages once the app is published.'
      }
      footer={
        number ? (
          <Button variant="accent" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="accent" loading={connect.isPending} disabled={touched && invalid} onClick={submit}>
              Connect number
            </Button>
          </>
        )
      }
    >
      {number ? (
        <WebhookSetup id={number.channel.id} initial={number} />
      ) : (
        <div className="grid gap-6">
          <section className="grid gap-3">
            <h3 className="text-[0.9375rem] font-bold text-ink">1. Set up in Meta</h3>
            <MetaGuide />
          </section>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <h3 className="text-[0.9375rem] font-bold text-ink">2. Paste the four values</h3>
            {formError && <Callout tone="danger" icon={<AlertTriangle />} title={formError} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone number ID" hint="On Step 1. Try it out, next to the number. Not the number itself." error={errors.phone_number_id ?? local('phone_number_id') ?? undefined}>
                <Input value={v.phone_number_id} onChange={(e) => set('phone_number_id', e.target.value.slice(0, 40))} inputMode="numeric" autoComplete="off" className="font-mono text-xs" aria-label="Phone number ID" />
              </Field>
              <Field label="WhatsApp Business Account ID" hint="Meta calls it Messaging account ID." error={errors.waba_id ?? local('waba_id') ?? undefined}>
                <Input value={v.waba_id} onChange={(e) => set('waba_id', e.target.value.slice(0, 40))} inputMode="numeric" autoComplete="off" className="font-mono text-xs" aria-label="WhatsApp Business Account ID" />
              </Field>
            </div>
            <Field label="Access token" hint="The system user's token that never expires." error={errors.access_token ?? local('access_token') ?? undefined}>
              <Input
                type="password"
                autoComplete="new-password" data-1p-ignore data-lpignore="true"
                value={v.access_token}
                onChange={(e) => set('access_token', e.target.value.slice(0, 1000))}
                className="font-mono text-xs"
                aria-label="Access token"
              />
            </Field>
            <Field label="App secret" hint="App settings → Basic in the same app." error={errors.app_secret ?? local('app_secret') ?? undefined}>
              <Input type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={v.app_secret} onChange={(e) => set('app_secret', e.target.value.slice(0, 64))} className="font-mono text-xs" aria-label="App secret" />
            </Field>
            <Field label="Channel name" optional hint="Leave empty to name it after the number's business name." error={errors.name ?? local('name') ?? undefined} aside={`${v.name?.length ?? 0}/80`}>
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

/** Whether Meta has reached the webhook yet, polled while it hasn't. */
function WebhookStatus({ number }: { number?: WhatsAppConnection }) {
  if (number?.last_event_at)
    return (
      <Badge tone="live" dot>
        Receiving messages · last {formatRelative(number.last_event_at)}
      </Badge>
    );
  if (number?.webhook_verified_at)
    return (
      <Badge tone="live" dot>
        Webhook verified · send the number a message to try it
      </Badge>
    );
  return (
    <Badge tone="warn" dot>
      Waiting for Meta to check the webhook
    </Badge>
  );
}

/** The Callback URL and Verify token for the Meta app, and whether Meta has used them. */
export function WebhookSetup({ id, initial }: { id: string; initial?: WhatsAppConnection }) {
  const [done, setDone] = useState(() => webhookWorking(initial));
  const q = useWhatsApp(id, !done);
  const number = q.data ?? initial;
  if (!done && webhookWorking(q.data)) setDone(true);
  if (!number) return null;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <WebhookStatus number={number} />
        {!webhookWorking(number) && <Clock className="size-3.5 animate-pulse text-ink-faint" aria-hidden />}
      </div>
      <Field label="Callback URL">
        <CopyField value={number.webhook_url} />
      </Field>
      <Field label="Verify token">
        <CopyField value={number.verify_token} masked />
      </Field>
      <SetupGuide steps={whatsAppAfterSteps()} label="Finish in Meta" />
    </div>
  );
}

/**
 * A connected number in the channel sheet: its webhook settings and a form for a new token or
 * app secret. Nothing for a WhatsApp channel added by hand, which isn't a connected number.
 */
export function WhatsAppPanel({ channel }: { channel: Channel }) {
  const { can } = useScopeCtx();
  const q = useWhatsApp(channel.id);
  const [editing, setEditing] = useState(false);
  if (!q.data) return null;
  const n = q.data;
  return (
    <section className="grid gap-4 rounded-[14px] border border-line p-4">
      <div className="grid gap-0.5">
        <span className="font-semibold text-ink">{n.display_phone || n.phone_number_id}</span>
        <span className="text-xs text-ink-faint">
          {n.verified_name ? `${n.verified_name} · ` : ''}Phone number ID <span className="font-mono">{n.phone_number_id}</span>
        </span>
      </div>
      <WebhookSetup id={channel.id} initial={n} />
      {can('channels.write') &&
        (editing ? (
          <UpdateCredentials id={channel.id} onDone={() => setEditing(false)} />
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

function UpdateCredentials({ id, onDone }: { id: string; onDone: () => void }) {
  const update = useUpdateWhatsAppCredentials(id);
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const local = (f: 'access_token' | 'app_secret', value: string) => (touched ? whatsAppFieldError(f, value) : null);
  const invalid = Boolean(whatsAppFieldError('access_token', token) || whatsAppFieldError('app_secret', secret));
  const save = () => {
    setTouched(true);
    if (invalid) return;
    setErrors({});
    setFormError(null);
    update.mutate({ access_token: token.trim(), app_secret: secret.trim() }, { onSuccess: onDone, onError: (e) => void refusal(e, setErrors, setFormError) });
  };
  // Not a <form>: it sits inside the channel sheet's form.
  return (
    <div className="grid gap-3">
      {formError && <Callout tone="danger" icon={<AlertTriangle />} title={formError} />}
      <Field label="New access token" error={errors.access_token ?? local('access_token', token) ?? undefined}>
        <Input type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={token} onChange={(e) => (setToken(e.target.value.slice(0, 1000)), setErrors({}))} className="font-mono text-xs" aria-label="New access token" />
      </Field>
      <Field label="App secret" hint="Of the app that made the token." error={errors.app_secret ?? local('app_secret', secret) ?? undefined}>
        <Input type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={secret} onChange={(e) => (setSecret(e.target.value.slice(0, 64)), setErrors({}))} className="font-mono text-xs" aria-label="App secret" />
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

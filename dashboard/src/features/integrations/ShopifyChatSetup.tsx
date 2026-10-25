import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Lock, MessageCircle, RotateCcw } from 'lucide-react';
import { isApiError } from '@/lib/api/client';
import { useChannelWidget, useSaveChannelWidget } from '@/lib/api/endpoints/channels';
import type { ChannelWidgetSettings } from '@/lib/api/types';
import { notifySuccess } from '@/lib/notify';
import { useScopeCtx } from '@/lib/session/scope-context';
import { WIDGET_DEFAULTS, WIDGET_LIMITS, cleanWidget, widgetErrors, widgetIsLive } from '@/lib/shopify';
import { Button, Callout, Dialog, Field, Input, Segmented, Switch, Textarea } from '@/components/ui';
import { WidgetPreview } from './WidgetPreview';

/**
 * A connected Shopify store's chat window: how it looks on the storefront, then how to switch it on
 * in the store's theme. Opens right after the install, and from "Customize chat" any time later.
 */
export function ShopifyChatSetup({ channelId, fresh, onClose }: { channelId: string; fresh?: boolean; onClose: () => void }) {
  const { can, bot } = useScopeCtx();
  const writable = can('channels.write');
  const [step, setStep] = useState<'design' | 'live'>('design');
  const widget = useChannelWidget(channelId, step === 'live');
  const save = useSaveChannelWidget(channelId);
  const [draft, setDraft] = useState<ChannelWidgetSettings | null>(null);
  const [shown, setShown] = useState(true);
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // The form starts from what is saved, once it has loaded.
  useEffect(() => {
    if (widget.data && draft === null) {
      setDraft(widget.data.settings);
      setShown(widget.data.enabled);
    }
  }, [widget.data, draft]);

  const errors = useMemo(() => (draft ? widgetErrors(draft) : {}), [draft]);
  const invalid = Object.keys(errors).length > 0;
  const dirty = Boolean(widget.data && draft && (shown !== widget.data.enabled || JSON.stringify(cleanWidget(draft)) !== JSON.stringify(widget.data.settings)));
  const set = <K extends keyof ChannelWidgetSettings>(key: K, value: ChannelWidgetSettings[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setFormError(null);
  };
  const shopName = widget.data?.shop ?? 'your store';

  const submit = () => {
    setTouched(true);
    if (!draft || invalid) return;
    setFormError(null);
    save.mutate(
      { enabled: shown, settings: cleanWidget(draft) },
      {
        onSuccess: (saved) => {
          setDraft(saved.settings);
          notifySuccess('Chat window saved.');
          setStep('live');
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'INVALID_REQUEST') setFormError(e.message);
        },
      },
    );
  };

  const loadFailed = widget.isError && !widget.data;
  const live = widgetIsLive(widget.data);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      title={step === 'design' ? 'Customize your chat window' : shown ? 'Show it on your store' : 'Your chat window is hidden'}
      description={
        step === 'design'
          ? fresh
            ? `${shopName} is connected. Choose how ${bot.name} appears to your customers; you can change this any time.`
            : `How ${bot.name} appears to customers on ${shopName}.`
          : undefined
      }
      footer={
        step === 'design' ? (
          <>
            <Button variant="quiet" leading={<RotateCcw />} disabled={!writable || !draft} onClick={() => (setDraft(WIDGET_DEFAULTS), setFormError(null))}>
              Reset to defaults
            </Button>
            <span className="flex-1" />
            <Button variant="ghost" onClick={onClose}>
              {fresh ? 'Later' : 'Cancel'}
            </Button>
            {writable ? (
              <Button variant="accent" loading={save.isPending} disabled={!draft || (touched && invalid)} onClick={submit}>
                {dirty || !widget.data ? 'Save and continue' : 'Continue'}
              </Button>
            ) : (
              <Button variant="accent" onClick={() => setStep('live')}>
                Continue
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep('design')}>
              Back to the design
            </Button>
            <Button variant="accent" onClick={onClose}>
              Done
            </Button>
          </>
        )
      }
    >
      {loadFailed ? (
        <Callout tone="danger" icon={<AlertTriangle />} title="The chat settings couldn't be loaded">
          {isApiError(widget.error) ? widget.error.message : 'Check your connection and open this again.'}
        </Callout>
      ) : step === 'design' ? (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <form
            className="grid content-start gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (writable) submit();
            }}
          >
            {!writable && (
              <Callout tone="neutral" icon={<Lock />} title="Only admins can change this">
                You can see how the window is set up. Ask an admin to change it.
              </Callout>
            )}
            {formError && (
              <Callout tone="danger" icon={<AlertTriangle />} title="That couldn't be saved">
                {formError}
              </Callout>
            )}
            {draft && (
              <fieldset disabled={!writable || save.isPending} className="grid min-w-0 gap-4 border-0 p-0">
                <Switch label="Show the chat on my store" description="Turn this off to hide the window without uninstalling." checked={shown} onCheckedChange={setShown} />
                <Field label="Title" optional hint="Defaults to your business name." error={errors.heading} aside={<Count value={draft.heading} max={WIDGET_LIMITS.heading} />}>
                  <Input value={draft.heading} onChange={(e) => set('heading', e.target.value)} placeholder="Your business name" />
                </Field>
                <Field label="Subtitle" optional error={errors.subtitle} aside={<Count value={draft.subtitle} max={WIDGET_LIMITS.subtitle} />}>
                  <Input value={draft.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="Ask us anything…" />
                </Field>
                <Field label="Greeting" optional hint="The first message customers see. Markdown works." error={errors.greeting} aside={<Count value={draft.greeting} max={WIDGET_LIMITS.greeting} />}>
                  <Textarea rows={3} value={draft.greeting} onChange={(e) => set('greeting', e.target.value)} placeholder="Hi there! How can we help you today?" />
                </Field>
                <Field label="Message box hint" optional error={errors.placeholder} aside={<Count value={draft.placeholder} max={WIDGET_LIMITS.placeholder} />}>
                  <Input value={draft.placeholder} onChange={(e) => set('placeholder', e.target.value)} placeholder="Write a message…" />
                </Field>
                <Field label="Colour" error={errors.accent}>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Pick a colour"
                      value={/^#[0-9a-fA-F]{6}$/.test(draft.accent) ? draft.accent : WIDGET_DEFAULTS.accent}
                      onChange={(e) => set('accent', e.target.value)}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
                    />
                    <Input value={draft.accent} onChange={(e) => set('accent', e.target.value.slice(0, 7))} aria-label="Colour code" className="font-mono text-xs" spellCheck={false} />
                  </div>
                </Field>
                <Field label="Header picture" optional hint="An https link to a square picture. Defaults to your business logo." error={errors.avatar_url}>
                  <Input type="url" value={draft.avatar_url} onChange={(e) => set('avatar_url', e.target.value)} placeholder="https://…" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Side of the page">
                    <Segmented
                      label="Side of the page"
                      value={draft.position}
                      onChange={(v) => set('position', v)}
                      options={[
                        { value: 'right', label: 'Right' },
                        { value: 'left', label: 'Left' },
                      ]}
                    />
                  </Field>
                  <Field label="Look">
                    <Segmented
                      label="Look"
                      value={draft.theme}
                      onChange={(v) => set('theme', v)}
                      options={[
                        { value: 'light', label: 'Light' },
                        { value: 'dark', label: 'Dark' },
                        { value: 'auto', label: 'Auto' },
                      ]}
                    />
                  </Field>
                </div>
                <Switch
                  label="Ask for a name and email first"
                  description="Customers give their details before their first message, so your team knows who they are."
                  checked={draft.details === 'ask'}
                  onCheckedChange={(on) => set('details', on ? 'ask' : 'off')}
                />
                <Switch label="Link the pages answers came from" description="Shows the articles and pages the assistant used." checked={draft.show_sources} onCheckedChange={(on) => set('show_sources', on)} />
              </fieldset>
            )}
          </form>
          <div className="grid content-start gap-2 md:sticky md:top-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Preview</p>
            {draft ? <WidgetPreview settings={invalid ? { ...draft, ...pickValid(draft) } : cleanWidget(draft)} /> : <div className="h-[440px] animate-pulse rounded-[14px] bg-surface-2" />}
            <p className="text-xs text-ink-faint">Sample replies only. Your assistant answers from your knowledge once it is on your store.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {!shown ? (
            <Callout tone="warn" icon={<MessageCircle />} title="The chat is hidden on your store">
              Your settings are saved, but the window is switched off. Go back to the design and turn on <strong>Show the chat on my store</strong>.
            </Callout>
          ) : live ? (
            <Callout tone="live" icon={<CheckCircle2 />} title="Live on your store">
              A page of {shopName} loaded your chat window{widget.data?.last_seen_at ? ` (most recently ${formatSeen(widget.data.last_seen_at)})` : ''}. Changes you save here reach it within a minute.
            </Callout>
          ) : (
            <Callout tone="accent" icon={<MessageCircle />} title="One more step in Shopify">
              Shopify needs you to switch the chat on in your theme. This page shows <strong>Live</strong> as soon as a page of your store loads it.
            </Callout>
          )}
          {shown && (
            <ol className="grid gap-3 text-[0.8125rem] text-ink-muted">
              <li className="flex flex-wrap items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface text-xs font-bold text-ink">1</span>
                <span className="min-w-[200px] flex-1">Open your theme editor with the Truplexy chat already selected.</span>
                <Button asChild variant="accent" size="sm">
                  <a href={widget.data?.activation_url} target="_blank" rel="noreferrer noopener">
                    Open the theme editor <ExternalLink />
                  </a>
                </Button>
              </li>
              <li className="flex items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface text-xs font-bold text-ink">2</span>
                <span>
                  Check that <strong className="text-ink">Truplexy chat</strong> is on under <em>App embeds</em>, then press <strong className="text-ink">Save</strong>.
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface text-xs font-bold text-ink">3</span>
                <span>Open your store. The chat appears in the corner of every page.</span>
              </li>
            </ol>
          )}
          <p className="text-xs text-ink-faint">
            You can switch it on or off later under Online Store → Themes → Customize → App embeds. Use <strong>Customize chat</strong> on the Integrations page to change how it looks.
          </p>
        </div>
      )}
    </Dialog>
  );
}

/** The settings with the fields that don't pass their rules put back to defaults, so a half-typed value doesn't break the preview. */
function pickValid(s: ChannelWidgetSettings): Partial<ChannelWidgetSettings> {
  const errors = widgetErrors(s);
  const out: Partial<ChannelWidgetSettings> = {};
  for (const key of Object.keys(errors) as (keyof ChannelWidgetSettings)[]) (out as Record<string, unknown>)[key] = WIDGET_DEFAULTS[key];
  return out;
}

function Count({ value, max }: { value: string; max: number }) {
  const n = [...value].length;
  return <span className={n > max ? 'text-xs font-semibold text-danger' : 'text-xs text-ink-faint'}>{n}/{max}</span>;
}

function formatSeen(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? 'just now' : d.toLocaleString();
}

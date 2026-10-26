import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Lock, RotateCcw } from 'lucide-react';
import { WidgetPictureEditor } from '@/components/domain/WidgetPictureEditor';
import { Button, Callout, Card, Field, Input, Segmented, Switch, Textarea } from '@/components/ui';
import { isApiError } from '@/lib/api/client';
import { useChannels } from '@/lib/api/endpoints/channels';
import { useRemoveWidgetPicture, useSaveWidget, useSetWidgetPicture, useWidget } from '@/lib/api/endpoints/widget';
import type { WidgetSettings } from '@/lib/api/types';
import { useScopeCtx } from '@/lib/session/scope-context';
import { isShopifyChannel } from '@/lib/shopify';
import { WIDGET_DEFAULTS, WIDGET_LIMITS, cleanWidget, previewable, sameWidget, widgetErrors } from '@/lib/widget';
import { ShopifyStoreStatus } from './ShopifyChatSetup';
import { WidgetPreview } from './WidgetPreview';

/** Where the same chat widget shows up, with the guide that sets each one up. */
const PLACES = [
  { id: 'web', name: 'Your website', note: 'The chat widget and your server route.' },
  { id: 'wordpress', name: 'WordPress & WooCommerce', note: 'The Truplexy Chat plugin, on a site or a store.' },
] as const;

/**
 * Integrations → Chat widget: how the chat window looks, once, for every place it is shown
 * (a website, WordPress, WooCommerce, a Shopify store). It is saved on the bot, and the chat
 * widget reads it through the API's profile, so nothing is pasted into a site to change it.
 */
export function WidgetTab() {
  const { can, href, bot } = useScopeCtx();
  const writable = can('bot.write');
  const widget = useWidget();
  const save = useSaveWidget();
  const setPicture = useSetWidgetPicture();
  const removePicture = useRemoveWidgetPicture();
  const channels = useChannels(undefined, can('channels.read'));
  const stores = (channels.data ?? []).filter((c) => isShopifyChannel(c) && c.active);
  const [draft, setDraft] = useState<WidgetSettings | null>(null);
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // The form starts from what is saved, once it has loaded.
  useEffect(() => {
    if (widget.data && draft === null) setDraft(widget.data.settings);
  }, [widget.data, draft]);

  const errors = useMemo(() => (draft ? widgetErrors(draft) : {}), [draft]);
  const invalid = Object.keys(errors).length > 0;
  const dirty = Boolean(widget.data && draft && !sameWidget(draft, widget.data.settings));
  const set = <K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setFormError(null);
  };

  const submit = () => {
    setTouched(true);
    if (!draft || invalid) return;
    setFormError(null);
    save.mutate(cleanWidget(draft), {
      onSuccess: (saved) => setDraft(saved.settings),
      onError: (e) => {
        if (isApiError(e) && e.code === 'INVALID_REQUEST') setFormError(e.message);
      },
    });
  };

  if (widget.isError && !widget.data)
    return (
      <Callout tone="danger" icon={<AlertTriangle />} title="The chat widget settings couldn't be loaded">
        {isApiError(widget.error) ? widget.error.message : 'Check your connection and reload this page.'}
      </Callout>
    );

  const pictureUrl = widget.data?.picture_url ?? '';
  return (
    <div className="grid gap-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="grid content-start gap-5">
          {!writable && (
            <Callout tone="neutral" icon={<Lock />} title="Only editors and above can change this">
              You can see how the chat is set up. Ask an editor or admin to change it.
            </Callout>
          )}
          {formError && (
            <Callout tone="danger" icon={<AlertTriangle />} title="That couldn't be saved">
              {formError}
            </Callout>
          )}
          {!draft ? (
            <div className="h-72 animate-pulse rounded-[18px] bg-surface-2" />
          ) : (
            <form
              className="grid gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (writable) submit();
              }}
            >
              <fieldset disabled={!writable || save.isPending} className="m-0 grid min-w-0 gap-5 border-0 p-0">
                <Card title="Words" description={`What ${bot.name}'s chat says. Leave a field empty to use the default.`}>
                  <div className="grid gap-4">
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
                  </div>
                </Card>

                <Card title="Brand" description="Shown in the header and on the chat button.">
                  <div className="grid gap-5">
                    <Field label="Header picture">
                      {/* The editor has its own buttons; Field only labels it. */}
                      <div>
                        <WidgetPictureEditor
                          value={pictureUrl}
                          disabled={!writable}
                          busy={setPicture.isPending || removePicture.isPending}
                          onSave={(file) => setPicture.mutateAsync(file)}
                          onRemove={() => removePicture.mutateAsync()}
                        />
                      </div>
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
                  </div>
                </Card>

                <Card title="Behaviour">
                  <div className="grid gap-5">
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
                  </div>
                </Card>
              </fieldset>

              <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-[14px] border border-line bg-surface/95 px-4 py-3 shadow-md backdrop-blur">
                <span className="mr-auto text-[0.8125rem] text-ink-muted">{dirty ? 'You have unsaved changes.' : 'Everything is saved.'}</span>
                <Button type="button" variant="quiet" leading={<RotateCcw />} disabled={!writable || save.isPending} onClick={() => (setDraft(WIDGET_DEFAULTS), setFormError(null))}>
                  Reset to defaults
                </Button>
                <Button type="submit" variant="accent" loading={save.isPending} disabled={!writable || !dirty || (touched && invalid)}>
                  Save
                </Button>
              </div>
            </form>
          )}
        </div>

        <div className="grid content-start gap-2 lg:sticky lg:top-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Preview</p>
          {draft ? <WidgetPreview settings={previewable(draft)} pictureUrl={pictureUrl} /> : <div className="h-[440px] animate-pulse rounded-[14px] bg-surface-2" />}
          <p className="text-xs text-ink-faint">Sample replies only. Your assistant answers from your knowledge on your sites.</p>
        </div>
      </div>

      <Card title="Where it shows" description="One setting, every place. Change it here and each site picks it up on its next page load.">
        <ul className="grid gap-3">
          {PLACES.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[0.8125rem]">
              <span>
                <span className="font-semibold text-ink">{p.name}</span> <span className="text-ink-muted">· {p.note}</span>
              </span>
              <Link to={href(`integrations/guides?guide=${p.id}`)} className="font-semibold text-accent hover:underline">
                Set up →
              </Link>
            </li>
          ))}
          <li className="grid gap-3 text-[0.8125rem]">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-semibold text-ink">Shopify</span> <span className="text-ink-muted">· the Truplexy app on your store.</span>
              </span>
              {stores.length === 0 && (
                <Link to={href('integrations/guides')} className="font-semibold text-accent hover:underline">
                  Connect a store →
                </Link>
              )}
            </span>
            {stores.map((c) => (
              <div key={c.id} className="rounded-[14px] border border-line p-4">
                <p className="mb-3 text-xs font-semibold text-ink-muted">{c.external_id || c.name}</p>
                <ShopifyStoreStatus channelId={c.id} shop={c.external_id} poll />
              </div>
            ))}
          </li>
        </ul>
        <p className="mt-4 text-xs text-ink-faint">
          Sites that built their own server route need it to pass the <code className="font-mono">widget</code> part of the profile on; the guides above include it. Anything you set directly on a widget, such as an{' '}
          <code className="font-mono">accent</code> attribute, wins over this page.
        </p>
      </Card>
    </div>
  );
}

function Count({ value, max }: { value: string; max: number }) {
  const n = [...value].length;
  return <span className={n > max ? 'text-xs font-semibold text-danger' : 'text-xs text-ink-faint'}>{n}/{max}</span>;
}

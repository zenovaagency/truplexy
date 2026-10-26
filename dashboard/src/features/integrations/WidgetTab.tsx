import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Lock, RotateCcw } from 'lucide-react';
import { AccentPicker } from '@/components/domain/AccentPicker';
import { WidgetPictureEditor } from '@/components/domain/WidgetPictureEditor';
import { Button, Callout, Card, Field, Input, Segmented, Switch, Textarea } from '@/components/ui';
import { isApiError } from '@/lib/api/client';
import { useChannels } from '@/lib/api/endpoints/channels';
import { useRemoveWidgetPicture, useSaveWidget, useSetWidgetPicture, useWidget } from '@/lib/api/endpoints/widget';
import type { WidgetSettings } from '@/lib/api/types';
import { useScopeCtx } from '@/lib/session/scope-context';
import { isShopifyChannel } from '@/lib/shopify';
import { WIDGET_DEFAULTS, WIDGET_LIMITS, cleanWidget, lowContrast, previewable, sameWidget, widgetErrors } from '@/lib/widget';
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
  // Custom stays open on a ready-made colour typed or picked there, until a swatch is chosen.
  const [customColour, setCustomColour] = useState(false);
  const colourNote = useId();

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
  const accentOk = draft ? /^#[0-9a-fA-F]{6}$/.test(draft.accent) : false;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      {/* First on a phone, so the look being changed is in view; beside the form from lg up. */}
      <div className="grid content-start gap-2 lg:sticky lg:top-4 lg:order-last">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[0.8125rem] font-semibold text-ink">Preview</h2>
          <span className="text-xs text-ink-faint">Sample replies only</span>
        </div>
        {draft ? <WidgetPreview settings={previewable(draft)} pictureUrl={pictureUrl} /> : <div className="h-[400px] animate-pulse rounded-[14px] bg-surface-2 lg:h-[460px]" />}
      </div>

      <div className="grid min-w-0 content-start gap-5">
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
                  <div className="grid gap-1.5">
                    {/* The editor has its own buttons, so it is titled rather than labelled. */}
                    <p className="text-[0.8125rem] font-semibold text-ink">Header picture</p>
                    <WidgetPictureEditor
                      value={pictureUrl}
                      accent={accentOk ? draft.accent : WIDGET_DEFAULTS.accent}
                      disabled={!writable}
                      busy={setPicture.isPending || removePicture.isPending}
                      onSave={(file) => setPicture.mutateAsync(file)}
                      onRemove={() => removePicture.mutateAsync()}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    {/* A row of choices, so it is titled rather than labelled, like the picture above. */}
                    <p className="text-[0.8125rem] font-semibold text-ink">Colour</p>
                    <AccentPicker value={draft.accent} onChange={(hex) => set('accent', hex)} custom={customColour} onCustomChange={setCustomColour} disabled={!writable} describedBy={colourNote} />
                    {errors.accent ? (
                      <p id={colourNote} className="text-xs font-medium text-danger">
                        {errors.accent}
                      </p>
                    ) : lowContrast(draft.accent) ? (
                      <p id={colourNote} className="text-xs font-medium text-warn">
                        White text is hard to read on this colour. Try a darker shade.
                      </p>
                    ) : (
                      <p id={colourNote} className="text-xs text-ink-faint">
                        The header, the chat button and the send button.
                      </p>
                    )}
                  </div>
                </div>
              </Card>

              <Card title="Behaviour">
                <div className="grid gap-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Side of the page">
                      <Segmented
                        stretch
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
                        stretch
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

            <div className="sticky bottom-3 z-10 flex items-center gap-2 rounded-[14px] border border-line bg-surface/95 py-2.5 pl-4 pr-2.5 shadow-md backdrop-blur">
              <span className="mr-auto flex min-w-0 items-center gap-2 text-[0.8125rem] text-ink-muted">
                <span className={dirty ? 'size-2 shrink-0 rounded-full bg-warn' : 'size-2 shrink-0 rounded-full bg-live'} aria-hidden />
                {dirty ? (
                  <span className="truncate">Unsaved changes</span>
                ) : (
                  <>
                    <span className="sm:hidden">Saved</span>
                    <span className="hidden truncate sm:inline">All changes saved</span>
                  </>
                )}
              </span>
              <Button type="button" variant="quiet" className="shrink-0" leading={<RotateCcw />} disabled={!writable || save.isPending} onClick={() => (setDraft(WIDGET_DEFAULTS), setCustomColour(false), setFormError(null))}>
                Reset to defaults
              </Button>
              <Button type="submit" variant="accent" className="shrink-0" loading={save.isPending} disabled={!writable || !dirty || (touched && invalid)}>
                Save
              </Button>
            </div>
          </form>
        )}

        <Card
          title="Where it shows"
          description="One setting, every place. Each site picks up a change on its next page load."
          flush
          footer={
            <p className="text-xs text-ink-faint">
              A site with its own server route must pass the profile's <code className="font-mono">widget</code> part on; the guides include it. Anything set directly on a widget, such as an{' '}
              <code className="font-mono">accent</code> attribute, wins over this page.
            </p>
          }
        >
          <ul className="divide-y divide-line">
            {PLACES.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5 text-[0.8125rem]">
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-semibold text-ink">{p.name}</span>
                  <span className="text-xs text-ink-muted">{p.note}</span>
                </span>
                <Link to={href(`integrations/guides?guide=${p.id}`)} className="shrink-0 font-semibold text-accent hover:underline">
                  Set up →
                </Link>
              </li>
            ))}
            <li className="grid gap-3 px-5 py-3.5 text-[0.8125rem]">
              <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-semibold text-ink">Shopify</span>
                  <span className="text-xs text-ink-muted">The Truplexy app on your store.</span>
                </span>
                {stores.length === 0 && (
                  <Link to={href('integrations/guides')} className="shrink-0 font-semibold text-accent hover:underline">
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
        </Card>
      </div>
    </div>
  );
}

function Count({ value, max }: { value: string; max: number }) {
  const n = [...value].length;
  return <span className={n > max ? 'text-xs font-semibold text-danger' : 'text-xs text-ink-faint'}>{n}/{max}</span>;
}

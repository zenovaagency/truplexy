import { AlertTriangle, CheckCircle2, ExternalLink, MessageCircle, Palette } from 'lucide-react';
import { Link } from 'react-router';
import { isApiError } from '@/lib/api/client';
import { useChannelWidget, useSetChannelWidgetEnabled } from '@/lib/api/endpoints/channels';
import { useScopeCtx } from '@/lib/session/scope-context';
import { widgetIsLive } from '@/lib/shopify';
import { Button, Callout, Dialog, Switch } from '@/components/ui';

/**
 * A connected store's chat window: whether it is shown, how to switch it on in the store's theme,
 * and whether a page of the store has loaded it yet. How it looks is the bot's one chat widget
 * setting (Integrations → Chat widget), shared with every other place the chat is shown.
 */
export function ShopifyStoreStatus({ channelId, shop, poll }: { channelId: string; shop?: string; poll?: boolean }) {
  const { can } = useScopeCtx();
  const state = useChannelWidget(channelId, poll);
  const set = useSetChannelWidgetEnabled(channelId);
  const writable = can('channels.write');
  const data = state.data;
  const name = data?.shop ?? shop ?? 'your store';

  if (state.isError && !data)
    return (
      <Callout tone="danger" icon={<AlertTriangle />} title="The store's chat status couldn't be loaded">
        {isApiError(state.error) ? state.error.message : 'Check your connection and try again.'}
      </Callout>
    );
  if (!data) return <div className="h-24 animate-pulse rounded-[14px] bg-surface-2" />;

  const live = widgetIsLive(data);
  return (
    <div className="grid gap-4">
      {!data.enabled ? (
        <Callout tone="warn" icon={<MessageCircle />} title="The chat is hidden on your store">
          Your chat widget settings are saved, but the window is switched off for {name}.
        </Callout>
      ) : live ? (
        <Callout tone="live" icon={<CheckCircle2 />} title="Live on your store">
          A page of {name} loaded your chat window{data.last_seen_at ? ` (most recently ${formatSeen(data.last_seen_at)})` : ''}. Changes to your chat widget reach it within a minute.
        </Callout>
      ) : (
        <Callout tone="accent" icon={<MessageCircle />} title="One more step in Shopify">
          Shopify needs you to switch the chat on in your theme. This shows <strong>Live</strong> as soon as a page of {name} loads it.
        </Callout>
      )}
      <Switch
        label="Show the chat on this store"
        description="Turn this off to hide the window without uninstalling the app."
        checked={data.enabled}
        disabled={!writable || set.isPending}
        onCheckedChange={(on) => set.mutate(on)}
      />
      {data.enabled && (
        <ol className="grid gap-3 text-[0.8125rem] text-ink-muted">
          <li className="flex flex-wrap items-center gap-3">
            <Step n={1} />
            <span className="min-w-[200px] flex-1">Open your theme editor with the Truplexy chat already selected.</span>
            <Button asChild variant="accent" size="sm">
              <a href={data.activation_url} target="_blank" rel="noreferrer noopener">
                Open the theme editor <ExternalLink />
              </a>
            </Button>
          </li>
          <li className="flex items-center gap-3">
            <Step n={2} />
            <span>
              Check that <strong className="text-ink">Truplexy chat</strong> is on under <em>App embeds</em>, then press <strong className="text-ink">Save</strong>.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Step n={3} />
            <span>Open your store. The chat appears in the corner of every page.</span>
          </li>
        </ol>
      )}
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface text-xs font-bold text-ink">{n}</span>;
}

/** Opens right after a store connects: turn the chat on in the theme, with a way on to how it looks. */
export function ShopifyChatSetup({ channelId, onClose }: { channelId: string; fresh?: boolean; onClose: () => void }) {
  const { href } = useScopeCtx();
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      size="md"
      title="Show the chat on your store"
      description="Your store is connected. The chat window uses the look you set for your chat widget."
      footer={
        <>
          <Button asChild variant="ghost" leading={<Palette />}>
            <Link to={href('integrations/widget')} onClick={onClose}>
              Customize how it looks
            </Link>
          </Button>
          <span className="flex-1" />
          <Button variant="accent" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <ShopifyStoreStatus channelId={channelId} poll />
      <p className="mt-4 text-xs text-ink-faint">
        You can switch it on or off later under Online Store → Themes → Customize → App embeds, or from Integrations → Chat widget.
      </p>
    </Dialog>
  );
}

function formatSeen(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? 'just now' : d.toLocaleString();
}

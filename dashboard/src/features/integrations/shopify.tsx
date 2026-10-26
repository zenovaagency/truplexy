import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, Link2, Lock, Palette, Wrench } from 'lucide-react';
import { hasCode, isApiError } from '@/lib/api/client';
import { useEnableStoreTools, useTools, useWorkspace } from '@/lib/api/endpoints/bot';
import { useConnectChannel } from '@/lib/api/endpoints/channels';
import { describeError } from '@/lib/errors';
import { notifySuccess } from '@/lib/notify';
import { qk } from '@/lib/query-keys';
import { useScopeCtx } from '@/lib/session/scope-context';
import { SHOPIFY_TOOLS, connectErrorMessage, markShopifyUnavailable, readConnectReturn, shopifyUnavailable, storeFieldError, subscribeShopifyUnavailable } from '@/lib/shopify';
import { WOOCOMMERCE_TOOLS, readWooConnectReturn, wooConnectErrorMessage } from '@/lib/woocommerce';
import { Button, Callout, Dialog, Field, Input, Tip } from '@/components/ui';
import { ShopifyChatSetup } from './ShopifyChatSetup';
import { WooCommerceConnectButton } from './woocommerce';

const UNAVAILABLE = "Shopify connections aren't set up on this server yet.";

export type StorePlatform = 'shopify' | 'woocommerce';

const PLATFORM_NAME: Record<StorePlatform, string> = { shopify: 'Shopify', woocommerce: 'WooCommerce' };

/**
 * After Shopify or a WooCommerce store, the API returns to the page with
 * ?connected=<platform>&channel_id=…&type=<platform> or ?connect_error=<code>&type=<platform>.
 * Says so once, reloads the channels and tools, and tidies the URL so a reload or a shared
 * link doesn't say it again. Any page can use it.
 */
export function useConnectReturn() {
  const [params, setParams] = useSearchParams();
  const { scope } = useScopeCtx();
  const qc = useQueryClient();
  const ret = useMemo(() => {
    const shopify = readConnectReturn(params);
    if (shopify) return { ...shopify, platform: 'shopify' as StorePlatform };
    const woo = readWooConnectReturn(params);
    return woo ? { ...woo, platform: 'woocommerce' as StorePlatform } : null;
  }, [params]);
  const [failed, setFailed] = useState<{ code: string; platform: StorePlatform } | null>(null);
  const [connected, setConnected] = useState<{ channelId: string | null; platform: StorePlatform } | null>(null);
  // The channel whose chat window the person is asked to set up, right after the install.
  const [customize, setCustomize] = useState<string | null>(null);
  const told = useRef('');

  useEffect(() => {
    if (!ret) return;
    const key = params.toString();
    if (told.current === key) return;
    told.current = key;
    if (ret.ok) {
      notifySuccess(`Your ${PLATFORM_NAME[ret.platform]} store is connected.`);
      void qc.invalidateQueries({ queryKey: qk.bot(scope, 'channels') });
      void qc.invalidateQueries({ queryKey: qk.bot(scope, 'tools') });
      setConnected({ channelId: ret.channelId, platform: ret.platform });
      setCustomize(ret.platform === 'shopify' ? ret.channelId : null);
      setFailed(null);
    } else {
      setFailed({ code: ret.code, platform: ret.platform });
      setConnected(null);
    }
    setParams(
      (p) => {
        for (const k of ['connected', 'connect_error', 'channel_id', 'type']) p.delete(k);
        return p;
      },
      { replace: true },
    );
  }, [ret, params, setParams, qc, scope]);

  return {
    /** The connect_error code and the platform it came from, until dismissed. */
    failed,
    dismissFailed: () => setFailed(null),
    /** Set after a successful return; channelId is the store's channel. */
    connected,
    dismissConnected: () => setConnected(null),
    /** The store's channel, until the chat window set-up that opens after the install is closed. */
    customize,
    closeCustomize: () => setCustomize(null),
  };
}

/** The chat window set-up that opens right after a store connects. */
export function ConnectedChatSetup({ back }: { back: Pick<ReturnType<typeof useConnectReturn>, 'customize' | 'closeCustomize'> }) {
  if (!back.customize) return null;
  return <ShopifyChatSetup channelId={back.customize} fresh onClose={back.closeCustomize} />;
}

/** A way from a connected store to how its chat looks: the bot's one chat widget setting. */
export function CustomizeChatButton({ size = 'xs', variant = 'soft' }: { size?: 'xs' | 'sm'; variant?: 'accent' | 'soft' }) {
  const { href } = useScopeCtx();
  return (
    <Button asChild size={size} variant={variant} leading={<Palette />}>
      <Link to={href('integrations/widget')}>Customize chat</Link>
    </Button>
  );
}

/** Why the store wasn't connected. Stays until dismissed, with a way to try again. */
export function ConnectReturnBanner({ code, platform = 'shopify', onDismiss }: { code: string; platform?: StorePlatform; onDismiss: () => void }) {
  const Retry = platform === 'woocommerce' ? WooCommerceConnectButton : ShopifyConnectButton;
  return (
    <Callout
      tone="danger"
      icon={<AlertTriangle />}
      title={`Your ${PLATFORM_NAME[platform]} store wasn't connected`}
      action={
        <span className="flex items-center gap-2">
          <Retry size="xs" variant="soft">
            Try again
          </Retry>
          <Button size="xs" variant="quiet" onClick={onDismiss}>
            Dismiss
          </Button>
        </span>
      }
    >
      {platform === 'woocommerce' ? wooConnectErrorMessage(code) : connectErrorMessage(code)}
    </Callout>
  );
}

/**
 * Sends the person to Shopify to install Truplexy's app on their store.
 * With `account` (Reconnect), it goes straight there for that store;
 * otherwise it first asks for the store. `prefill` opens the dialog with a
 * store already in it, as when the install was started inside Shopify.
 */
export function ShopifyConnectButton({
  account,
  prefill,
  size = 'sm',
  variant = 'accent',
  children,
}: {
  account?: string;
  prefill?: string;
  size?: 'xs' | 'sm';
  variant?: 'accent' | 'soft';
  children?: React.ReactNode;
}) {
  const { can } = useScopeCtx();
  const connect = useConnectChannel();
  const [asking, setAsking] = useState(false);
  const [store, setStore] = useState('');
  const [touched, setTouched] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const unavailable = useSyncExternalStore(subscribeShopifyUnavailable, shopifyUnavailable);
  // Stays busy after success: the browser is on its way to Shopify.
  const busy = connect.isPending || connect.isSuccess;

  useEffect(() => {
    if (!prefill) return;
    setStore(prefill);
    setAsking(true);
  }, [prefill]);

  const go = (value: string) => {
    setFieldError(null);
    setFormError(null);
    connect.mutate(
      { type: 'shopify', account: value.trim() },
      {
        onError: (e) => {
          if (hasCode(e, 'CHANNEL_CONNECT_UNAVAILABLE')) {
            markShopifyUnavailable();
          } else if (hasCode(e, 'INVALID_REQUEST') && isApiError(e)) setFieldError(e.message);
          else if (hasCode(e, 'CHANNEL_TYPE_NOT_ALLOWED')) setFormError("Shopify isn't available for this bot right now.");
          // Shouldn't happen for shopify: a bug, shown as a generic error.
          else if (hasCode(e, 'CHANNEL_CONNECT_UNSUPPORTED')) setFormError(`${describeError(e).title}. ${describeError(e).detail ?? ''}`.trim());
          else return; // Session, permission and rate-limit errors are toasted by the app.
          // Reconnect has no dialog of its own: open it so the error sits next to the store.
          if (!asking) {
            setStore(value);
            setAsking(true);
          }
        },
      },
    );
  };

  if (!can('channels.write'))
    return (
      <span className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Lock className="size-3" /> Ask an admin to connect
      </span>
    );
  // Spaces are pointed out at once; an empty field only once the person has tried.
  const localError = touched || /\s/.test(store.trim()) ? storeFieldError(store) : null;
  return (
    <>
      {unavailable && !asking ? (
        <Tip content={UNAVAILABLE}>
          <span className="inline-flex">
            <Button size={size} variant={variant} leading={<Link2 />} disabled>
              {children ?? 'Connect'}
            </Button>
          </span>
        </Tip>
      ) : (
        <Button size={size} variant={variant} leading={<Link2 />} loading={busy && !asking} onClick={() => (account ? go(account) : setAsking(true))}>
          {children ?? 'Connect'}
        </Button>
      )}
      <Dialog
        open={asking}
        onOpenChange={(o) => {
          setAsking(o);
          if (!o) setTouched(false);
        }}
        size="sm"
        title="Connect Shopify"
        description="Shopify asks you to approve the Truplexy app on this store, then brings you back here."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              leading={<Link2 />}
              loading={busy}
              disabled={unavailable || Boolean(storeFieldError(store))}
              onClick={() => {
                setTouched(true);
                if (!storeFieldError(store)) go(store);
              }}
            >
              Continue to Shopify
            </Button>
          </>
        }
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!unavailable && !storeFieldError(store)) go(store);
          }}
        >
          {(unavailable || formError) && (
            <Callout tone="danger" icon={<AlertTriangle />} title={unavailable ? UNAVAILABLE : formError}>
              {unavailable ? 'Ask Truplexy to set up the Shopify app.' : null}
            </Callout>
          )}
          <Field
            label="Your store"
            hint="Its address, such as your-store.myshopify.com, or the link to its Shopify admin."
            error={fieldError ?? localError ?? undefined}
          >
            <Input
              autoFocus
              value={store}
              onChange={(e) => (setStore(e.target.value.slice(0, 200)), setFieldError(null))}
              onBlur={() => setTouched(true)}
              placeholder="your-store.myshopify.com"
              aria-label="Your store"
              className="font-mono text-xs"
            />
          </Field>
        </form>
      </Dialog>
    </>
  );
}

/** After a store connects: turn on both of its tools for the bot in one go. */
export function ShopifyToolsPrompt({ platform = 'shopify', onDismiss }: { platform?: StorePlatform; onDismiss: () => void }) {
  const { can, bot } = useScopeCtx();
  const ws = useWorkspace();
  const tools = useTools();
  const names: readonly string[] = platform === 'woocommerce' ? WOOCOMMERCE_TOOLS : SHOPIFY_TOOLS;
  const enable = useEnableStoreTools(names);
  const listed = tools.data?.data.some((t) => t.built_in && names.includes(t.name));
  const on = Boolean(ws.data?.bot.toolsEnabled && names.every((n) => ws.data?.bot.tools?.includes(n)));

  if (!can('bot.write') || !ws.data || !listed) return null;
  if (on)
    return (
      <Callout tone="neutral" icon={<CheckCircle2 />} title="Order and product lookups are on" action={<Button size="xs" variant="quiet" onClick={onDismiss}>Dismiss</Button>}>
        {bot.name} can look up a customer's order and search your products.
      </Callout>
    );
  return (
    <Callout
      tone="accent"
      icon={<Wrench />}
      title="Let the assistant look up orders and products"
      action={
        <span className="flex items-center gap-2">
          <Button size="xs" variant="accent" loading={enable.isPending} onClick={() => enable.mutate()}>
            Turn on order and product lookups
          </Button>
          <Button size="xs" variant="quiet" onClick={onDismiss}>
            Not now
          </Button>
        </span>
      }
    >
      Your store gives {bot.name} two read-only tools, order status and product search. They're off until you turn them on.
      {enable.error && !isApiError(enable.error) && <span className="mt-1 block text-danger">{enable.error.message}</span>}
    </Callout>
  );
}

import { useState } from 'react';
import { AlertTriangle, Link2, Lock } from 'lucide-react';
import { hasCode, isApiError } from '@/lib/api/client';
import { useConnectChannel } from '@/lib/api/endpoints/channels';
import { describeError } from '@/lib/errors';
import { useScopeCtx } from '@/lib/session/scope-context';
import { siteFieldError } from '@/lib/woocommerce';
import { Button, Callout, Dialog, Field, Input } from '@/components/ui';

const UNAVAILABLE = "WooCommerce connections aren't set up on this server yet.";

/**
 * Sends the person to their own store to approve read access for Truplexy: the store
 * makes API keys and the API keeps them. With `account` (Reconnect), it goes straight
 * there for that store; otherwise it first asks for the store's address.
 */
export function WooCommerceConnectButton({
  account,
  size = 'sm',
  variant = 'accent',
  children,
}: {
  account?: string;
  size?: 'xs' | 'sm';
  variant?: 'accent' | 'soft';
  children?: React.ReactNode;
}) {
  const { can } = useScopeCtx();
  const connect = useConnectChannel();
  const [asking, setAsking] = useState(false);
  const [site, setSite] = useState('');
  const [touched, setTouched] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Stays busy after success: the browser is on its way to the store.
  const busy = connect.isPending || connect.isSuccess;

  const go = (value: string) => {
    setFieldError(null);
    setFormError(null);
    connect.mutate(
      { type: 'woocommerce', account: value.trim() },
      {
        onError: (e) => {
          if (hasCode(e, 'CHANNEL_CONNECT_UNAVAILABLE')) setFormError(UNAVAILABLE);
          else if (hasCode(e, 'INVALID_REQUEST') && isApiError(e)) setFieldError(e.message);
          else if (hasCode(e, 'CHANNEL_TYPE_NOT_ALLOWED')) setFormError("WooCommerce isn't available for this bot right now.");
          else if (hasCode(e, 'CHANNEL_CONNECT_UNSUPPORTED')) setFormError(`${describeError(e).title}. ${describeError(e).detail ?? ''}`.trim());
          else return; // Session, permission and rate-limit errors are toasted by the app.
          // Reconnect has no dialog of its own: open it so the error sits next to the store.
          if (!asking) {
            setSite(value);
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
  const localError = touched || /\s/.test(site.trim()) ? siteFieldError(site) : null;
  return (
    <>
      <Button size={size} variant={variant} leading={<Link2 />} loading={busy && !asking} onClick={() => (account ? go(account) : setAsking(true))}>
        {children ?? 'Connect store'}
      </Button>
      <Dialog
        open={asking}
        onOpenChange={(o) => {
          setAsking(o);
          if (!o) setTouched(false);
        }}
        size="sm"
        title="Connect your WooCommerce store"
        description="Your store asks you to approve read-only access for Truplexy, then brings you back here. Sign in to the store's admin first if it asks."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              leading={<Link2 />}
              loading={busy}
              disabled={Boolean(siteFieldError(site))}
              onClick={() => {
                setTouched(true);
                if (!siteFieldError(site)) go(site);
              }}
            >
              Continue to your store
            </Button>
          </>
        }
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!siteFieldError(site)) go(site);
          }}
        >
          {formError && <Callout tone="danger" icon={<AlertTriangle />} title={formError} />}
          <Field label="Your store" hint="Its address, such as shop.example.com. It must use https." error={fieldError ?? localError ?? undefined}>
            <Input
              autoFocus
              value={site}
              onChange={(e) => (setSite(e.target.value.slice(0, 200)), setFieldError(null))}
              onBlur={() => setTouched(true)}
              placeholder="shop.example.com"
              aria-label="Your store"
              className="font-mono text-xs"
            />
          </Field>
        </form>
      </Dialog>
    </>
  );
}

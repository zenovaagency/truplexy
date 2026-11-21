import { useEffect, useState } from 'react';
import { env } from '@/lib/env';
import { COOKIE_SETTINGS_EVENT, getConsent, loadPixel, revokePixel, setConsent } from '@/lib/metaPixel';
import { Button } from '@/components/ui';

/** Whether a Pixel applies here at all: an ID is set and this is not the demo (mock) dashboard. */
export const pixelEnabled = () => Boolean(env.metaPixelId) && !env.useMocks;

/**
 * Consent for the Meta Pixel on the sign-in / sign-up page. Renders nothing, and loads nothing, without
 * VITE_META_PIXEL_ID. A saved "granted" loads the Pixel; with no saved choice the banner asks; declining keeps it off.
 */
export function PixelConsent() {
  const enabled = pixelEnabled();
  const [open, setOpen] = useState(() => enabled && getConsent() === null);

  useEffect(() => {
    if (!enabled) return;
    if (getConsent() === 'granted') loadPixel(env.metaPixelId);
    const reopen = () => setOpen(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, [enabled]);

  if (!enabled || !open) return null;

  const choose = (granted: boolean) => {
    setConsent(granted ? 'granted' : 'denied');
    if (granted) loadPixel(env.metaPixelId);
    else revokePixel();
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie choices"
      className="fixed inset-x-4 bottom-4 z-50 grid max-w-md gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-ink shadow-lg sm:right-auto"
    >
      <p className="text-ink-muted">
        We use cookies to measure our ads and see which visits lead to sign-ups. Decline and no advertising cookies are set.{' '}
        <a className="text-ink underline" href="https://truplexy.com/privacy#site" target="_blank" rel="noopener noreferrer">
          Details
        </a>
      </p>
      <div className="flex justify-end gap-2">
        <Button size="md" variant="ghost" onClick={() => choose(false)}>
          Decline
        </Button>
        <Button size="md" onClick={() => choose(true)}>
          Accept cookies
        </Button>
      </div>
    </div>
  );
}

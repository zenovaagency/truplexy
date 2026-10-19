import { useEffect, useState } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import type { Attachment } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { urlExpired, type ImageRefresher } from '@/lib/images/refresh';
import { Dialog } from '@/components/ui';

/** Fits a picture inside a box without changing its shape, so space is reserved before it loads. */
export function fitBox(width: number, height: number, maxW: number, maxH: number) {
  if (!(width > 0) || !(height > 0)) return { width: maxW, height: Math.round(maxW * 0.75) };
  const k = Math.min(1, maxW / width, maxH / height);
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export const pictureAlt = (index: number, total: number, who = 'the customer') =>
  `Picture sent by ${who}${total > 1 ? ` (${index + 1} of ${total})` : ''}`;

type Phase = 'loading' | 'loaded' | 'refreshing' | 'broken';

/**
 * The pictures a customer message carried, with click-to-enlarge.
 *
 * Each `url` is signed for one hour. When one has run out, or stops loading,
 * the owner (the conversation or the ticket) is reloaded once through
 * `refresher` and the fresh URL replaces it. URLs are only ever held in props:
 * nothing here writes them anywhere.
 */
export function MessageImages({
  images,
  refresher,
  who,
  align = 'start',
  className,
}: {
  images: Attachment[];
  refresher: ImageRefresher;
  /** Who sent them, for the alt text. Defaults to "the customer". */
  who?: string;
  align?: 'start' | 'end';
  className?: string;
}) {
  if (!images.length) return null;
  return (
    <div role="group" aria-label={images.length > 1 ? 'Pictures in this message' : 'Picture in this message'} className={cn('flex flex-wrap gap-1.5', align === 'end' && 'justify-end', className)}>
      {images.map((img, i) => (
        <Picture key={img.id} img={img} alt={pictureAlt(i, images.length, who)} refresher={refresher} />
      ))}
    </div>
  );
}

function Picture({ img, alt, refresher }: { img: Attachment; alt: string; refresher: ImageRefresher }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [open, setOpen] = useState(false);
  const thumb = fitBox(img.width, img.height, 240, 300);

  // A new URL (after a reload) starts loading afresh. A link that has already run out is renewed before it is tried.
  useEffect(() => {
    setPhase('loading');
    if (!urlExpired(img.url_expires_at) || refresher.tried(img.id)) return;
    let live = true;
    setPhase('refreshing');
    void refresher.request(img.id).then(() => live && setPhase((p) => (p === 'refreshing' ? 'loading' : p)));
    return () => {
      live = false;
    };
  }, [img.url, img.url_expires_at, img.id, refresher]);

  /** The image didn't load: one reload for a fresh URL, then give up. */
  const failed = () => {
    if (refresher.tried(img.id)) return setPhase('broken');
    setPhase('refreshing');
    void refresher.request(img.id).then((reloaded) => setPhase(reloaded ? 'loading' : 'broken'));
  };

  const reloadByHand = () => {
    refresher.reset(img.id);
    failed();
  };

  const enlarge = async () => {
    // A link that expired while the page sat open: renew it before showing the big one.
    if (urlExpired(img.url_expires_at) && !refresher.tried(img.id)) {
      setPhase('refreshing');
      await refresher.request(img.id);
      setPhase('loading');
    }
    setOpen(true);
  };

  if (phase === 'broken') {
    return (
      <div className="flex min-h-[72px] items-center gap-2 rounded-[12px] border border-line bg-surface-2 px-3 py-2 text-xs text-ink-muted" style={{ maxWidth: thumb.width }}>
        <ImageOff className="size-4 shrink-0 text-ink-faint" aria-hidden />
        <span>Picture unavailable</span>
        <button type="button" onClick={reloadByHand} className="ml-auto inline-flex items-center gap-1 font-semibold text-accent [@media(pointer:coarse)]:min-h-0">
          <RefreshCw className="size-3" aria-hidden /> Reload
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void enlarge()}
        aria-haspopup="dialog"
        aria-label={`${alt}. View larger`}
        className="relative overflow-hidden rounded-[12px] border border-line bg-surface-2 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent [@media(pointer:coarse)]:min-h-0"
        style={{ width: thumb.width, height: thumb.height }}
      >
        {phase === 'refreshing' ? (
          <span className="absolute inset-0 animate-pulse bg-surface-2" aria-hidden />
        ) : (
          <img
            src={img.url}
            alt={alt}
            width={img.width}
            height={img.height}
            loading="lazy"
            decoding="async"
            // The link is a bearer URL: keep it out of the Referer that other requests could carry.
            referrerPolicy="no-referrer"
            onLoad={() => {
              refresher.loaded(img.id);
              setPhase('loaded');
            }}
            onError={failed}
            className="h-full w-full object-cover"
          />
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={alt} size="xl">
        {phase !== 'refreshing' && (
          <img src={img.url} alt={alt} onError={failed} referrerPolicy="no-referrer" className="mx-auto max-h-[72dvh] w-auto max-w-full rounded-[12px] object-contain" />
        )}
      </Dialog>
    </>
  );
}

/** The pictures of a message that is still on its way: the local files, shown until the stored message arrives. */
export function LocalImages({ pictures, align = 'end' }: { pictures: { key: string; name: string; previewUrl: string }[]; align?: 'start' | 'end' }) {
  if (!pictures.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', align === 'end' && 'justify-end')}>
      {pictures.map((p, i) => (
        <img
          key={p.key}
          src={p.previewUrl}
          alt={`Picture you are sending${pictures.length > 1 ? ` (${i + 1} of ${pictures.length})` : ''}`}
          className="max-h-[200px] max-w-[240px] rounded-[12px] border border-line object-cover opacity-80"
        />
      ))}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ImageOff, Package } from 'lucide-react';
import { useProperties } from '@/lib/api/endpoints/properties';
import { useFeature } from '@/lib/features';

/** The bot's product properties, once the API serves them; [] before. */
export function useProductProperties() {
  const on = useFeature('properties') === 'on';
  const q = useProperties('product', { enabled: on });
  return useMemo(() => (on ? (q.data ?? []) : []), [on, q.data]);
}

/** A product's picture, or a placeholder when it has none or it doesn't load. */
export function ProductImage({ src, name, size = 36 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const box = { width: size, height: size };
  if (!src || failed) {
    return (
      <span style={box} className="grid shrink-0 place-items-center rounded-[8px] border border-line bg-surface-2 text-ink-faint" aria-hidden>
        {src ? <ImageOff className="size-4" /> : <Package className="size-4" />}
      </span>
    );
  }
  // Pictures come from other sites: no referrer leaks which dashboard showed them.
  return <img src={src} alt={name} style={box} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="shrink-0 rounded-[8px] border border-line object-cover" />;
}

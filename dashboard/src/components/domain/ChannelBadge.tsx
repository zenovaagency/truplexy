import { siDiscord, siInstagram, siLine, siMessenger, siSignal, siTelegram, siViber, siWechat, siWhatsapp } from 'simple-icons';
import { Code2, Globe, Mail, MessageSquare, Radio, Smartphone, type LucideIcon } from 'lucide-react';
import type { Channel } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { Badge, Tip } from '@/components/ui';

/**
 * Channel types carry an `icon`: a name or a URL. Known names (and the
 * default type IDs) get a brand mark or a glyph; a URL is shown as an image.
 */
const BRANDS: Record<string, { path: string; hex: string }> = {
  discord: siDiscord,
  whatsapp: siWhatsapp,
  telegram: siTelegram,
  messenger: siMessenger,
  instagram: siInstagram,
  line: siLine,
  viber: siViber,
  wechat: siWechat,
  signal: siSignal,
};

const GLYPHS: Record<string, LucideIcon> = {
  website: Globe,
  web: Globe,
  globe: Globe,
  widget: Globe,
  email: Mail,
  mail: Mail,
  slack: MessageSquare,
  chat: MessageSquare,
  sms: Smartphone,
  phone: Smartphone,
  custom: Code2,
  api: Code2,
  code: Code2,
};

const isUrl = (s: string) => /^(https?:\/\/|\/)/.test(s);

/** The bare mark, sized by `className` (e.g. size-4). */
export function ChannelGlyph({ icon, className }: { icon?: string; className?: string }) {
  const key = (icon ?? '').trim();
  if (key && isUrl(key)) return <img src={key} alt="" className={cn('size-4 shrink-0 object-contain', className)} />;
  const brand = BRANDS[key.toLowerCase()];
  if (brand)
    return (
      <svg viewBox="0 0 24 24" className={cn('size-4 shrink-0', className)} style={{ fill: `#${brand.hex}` }} aria-hidden>
        <path d={brand.path} />
      </svg>
    );
  const Glyph = GLYPHS[key.toLowerCase()] ?? Radio;
  return <Glyph className={cn('size-4 shrink-0 text-ink-muted', className)} aria-hidden />;
}

/** The mark on a tile, matching the integration catalog's icons. */
export function ChannelTypeIcon({ icon, size = 36, className }: { icon?: string; size?: number; className?: string }) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-[10px] border border-line bg-surface', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <ChannelGlyph icon={icon} className="size-1/2" />
    </span>
  );
}

/** A channel's name with its type's mark, for ticket rows and tables. */
export function ChannelBadge({ name, icon, muted, className }: { name: string; icon?: string; muted?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', muted && 'opacity-60', className)}>
      <ChannelGlyph icon={icon} className="size-3.5" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function ChannelStatusBadge({ channel: c }: { channel: Pick<Channel, 'enabled' | 'disabled_by_platform'> }) {
  if (c.disabled_by_platform)
    return (
      <Tip content="Turned off by Truplexy. Its keys don't work, and only Truplexy can turn it back on.">
        <Badge tone="danger" dot>Disabled by Truplexy</Badge>
      </Tip>
    );
  return c.enabled ? <Badge tone="live" dot>Active</Badge> : <Badge tone="neutral" dot>Off</Badge>;
}

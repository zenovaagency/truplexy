import { Code2, Globe, Mail, MessageSquare, Radio, Smartphone, type LucideIcon } from 'lucide-react';
import type { Channel } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { Badge, Tip } from '@/components/ui';

/**
 * Channel types carry an `icon`: a name or a URL. Known names (and the
 * default type IDs) get a full-colour brand logo (theSVG, under public/brands)
 * or a glyph; a URL is shown as an image.
 */
const BRANDS: Record<string, string> = {
  discord: '/brands/discord.svg',
  whatsapp: '/brands/whatsapp.svg',
  telegram: '/brands/telegram.svg',
  messenger: '/brands/messenger.svg',
  instagram: '/brands/instagram.svg',
  line: '/brands/line.svg',
  viber: '/brands/viber.svg',
  wechat: '/brands/wechat.svg',
  signal: '/brands/signal.svg',
  slack: '/brands/slack.svg',
  teams: '/brands/microsoft-teams.svg',
  shopify: '/brands/shopify.svg',
  hubspot: '/brands/hubspot.svg',
  zendesk: '/brands/zendesk.svg',
  wordpress: '/brands/wordpress.svg',
  woocommerce: '/brands/woocommerce.svg',
};

const GLYPHS: Record<string, LucideIcon> = {
  website: Globe,
  web: Globe,
  globe: Globe,
  widget: Globe,
  email: Mail,
  mail: Mail,
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
  if (brand) return <img src={brand} alt="" draggable={false} className={cn('size-4 shrink-0 object-contain', className)} />;
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
      <Tip content="Turned off by the platform. Its keys don't work, and only Truplexy can turn it back on.">
        <Badge tone="danger" dot>Turned off by the platform</Badge>
      </Tip>
    );
  if (!c.enabled) return <Badge tone="neutral" dot>Off</Badge>;
  return <Badge tone="live" dot>Active</Badge>;
}

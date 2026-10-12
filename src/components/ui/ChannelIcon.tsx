import { Braces, Globe, Mail, Plug, UserRound, Webhook, type LucideIcon } from 'lucide-react';
import { channel, type ChannelId } from '@/data/channels';

/**
 * One glyph per channel. Brand marks are full-colour logos from theSVG,
 * vendored under public/brands and set on the channel in the registry
 * (`npm run brand:icons` regenerates them). Channels without a brand get a
 * neutral lucide glyph instead of an approximated logo.
 *
 * Marks are drawn as <img> rather than inline SVG: the logos carry gradient
 * ids that would collide when several share a page.
 *
 * Rendered statically from Astro (no client directive) and inside islands,
 * so every surface draws channels the same way.
 */
const FALLBACK: Partial<Record<ChannelId | 'human', LucideIcon>> = {
  web: Globe,
  email: Mail,
  api: Braces,
  custom: Plug,
  webhooks: Webhook,
  human: UserRound,
};

interface Props {
  id: ChannelId | 'human';
  size?: number;
  /** Brand tint for the neutral glyph when live; muted ink when not, or when false. */
  colored?: boolean;
  className?: string;
  /** Decorative by default — the channel name is almost always printed beside it. */
  title?: string;
  /** Line weight for the lucide fallbacks; raise it at small sizes to match the solid brand marks. */
  strokeWidth?: number;
}

export default function ChannelIcon({ id, size = 16, colored = true, className, title, strokeWidth = 1.9 }: Props) {
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const };

  if (id === 'human') {
    return <UserRound size={size} strokeWidth={strokeWidth} className={className} {...a11y} />;
  }

  const c = channel(id);

  if (c.icon) {
    return (
      <img
        src={c.icon}
        width={size}
        height={size}
        alt={title ?? ''}
        decoding="async"
        draggable={false}
        className={className}
        style={{ width: size, height: size, objectFit: 'contain', opacity: c.status === 'live' ? undefined : 0.45 }}
      />
    );
  }

  const color = colored && c.status === 'live' ? c.color : 'var(--color-ink-faint)';
  const Icon = FALLBACK[id] ?? Globe;
  return <Icon size={size} strokeWidth={strokeWidth} color={color} className={className} {...a11y} />;
}

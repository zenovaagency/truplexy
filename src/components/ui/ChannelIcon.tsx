import { Braces, Globe, Hash, Mail, Plug, UserRound, Users, Webhook, type LucideIcon } from 'lucide-react';
import { channel, type ChannelId } from '@/data/channels';

/**
 * One glyph per channel. Brand marks come from simple-icons (24×24 paths in
 * the registry); channels without a brand mark there get a neutral lucide
 * glyph instead of an approximated logo.
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
  slack: Hash,
  teams: Users,
  human: UserRound,
};

interface Props {
  id: ChannelId | 'human';
  size?: number;
  /** Brand tint when live; muted ink when not, or when false. */
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
  const color = colored && c.status === 'live' ? c.color : 'var(--color-ink-faint)';

  if (c.path) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill={color} focusable="false" {...a11y}>
        <path d={c.path} />
      </svg>
    );
  }

  const Icon = FALLBACK[id] ?? Globe;
  return <Icon size={size} strokeWidth={strokeWidth} color={color} className={className} {...a11y} />;
}

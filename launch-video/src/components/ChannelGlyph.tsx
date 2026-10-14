import { Globe, Mail, UserRound } from 'lucide-react';
import { Img, staticFile } from 'remotion';
import { C } from '../theme';

/**
 * One glyph per channel, drawn the way the site's ChannelIcon does: the
 * vendored full-colour brand logo where one exists, a lucide glyph otherwise.
 * Only channels marked `live` in src/data/channels.ts appear in the film.
 */
export type Channel = 'web' | 'email' | 'telegram' | 'discord' | 'whatsapp' | 'messenger' | 'instagram' | 'human';

export const CHANNEL_NAME: Record<Channel, string> = {
  web: 'Website chat',
  email: 'Email',
  telegram: 'Telegram',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  human: 'Human support',
};

export const ChannelGlyph = ({ id, size = 16 }: { id: Channel; size?: number }) => {
  if (id === 'web') return <Globe size={size} strokeWidth={1.9} color={C.accent} />;
  if (id === 'email') return <Mail size={size} strokeWidth={1.9} color={C.ink} />;
  if (id === 'human') return <UserRound size={size} strokeWidth={1.9} color={C.human} />;
  return <Img src={staticFile(`brands/${id}.svg`)} style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />;
};

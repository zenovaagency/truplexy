/** Helpers and variant names shared by the demo skins. */

/** Clock times for a demo's lines: 10:42, then a minute later for each line. */
export function times(count: number, start = 10 * 60 + 42): string[] {
  return Array.from({ length: count }, (_, i) => {
    const m = start + i;
    const h = Math.floor(m / 60) % 12 || 12;
    return `${h}:${String(m % 60).padStart(2, '0')}`;
  });
}

/** "Imran Kabir" → "IK". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export type SiteVariant = 'site' | 'shopify' | 'woocommerce' | 'wordpress';
export type PhoneVariant = 'whatsapp' | 'telegram' | 'messenger' | 'instagram';
export type TeamVariant = 'discord' | 'slack' | 'teams';
export type HelpdeskVariant = 'zendesk' | 'hubspot';

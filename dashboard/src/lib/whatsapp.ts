import type { Channel, WhatsAppConnectInput, WhatsAppConnection } from '@/lib/api/types';

/* The business's own WhatsApp number (API_REFERENCE.md → POST /channels/whatsapp). */

export const WHATSAPP = 'whatsapp';

export const isWhatsAppChannel = (c: Pick<Channel, 'type'>) => c.type === WHATSAPP;

/** Where the person does each step in Meta. */
export const META_LINKS = {
  apps: 'https://developers.facebook.com/apps/',
  systemUsers: 'https://business.facebook.com/settings/system-users',
  docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
} as const;

export type WhatsAppField = keyof WhatsAppConnectInput;

/** Light checks only, so a pasted value with a typo is caught before Meta is asked. The API says what Meta refused. */
export function whatsAppFieldError(field: WhatsAppField, value: string): string | null {
  const v = value.trim();
  switch (field) {
    case 'phone_number_id':
      if (!v) return 'Paste the Phone number ID.';
      if (!/^\d{5,32}$/.test(v)) return v.startsWith('+') || /\s/.test(v) ? "That's the phone number. Paste the Phone number ID shown under it." : 'The Phone number ID is digits only.';
      return null;
    case 'waba_id':
      if (!v) return 'Paste the WhatsApp Business Account ID.';
      return /^\d{5,32}$/.test(v) ? null : 'The WhatsApp Business Account ID is digits only.';
    case 'access_token':
      if (!v) return 'Paste the access token.';
      if (/\s/.test(v)) return 'A token has no spaces.';
      return v.length < 20 ? "That's too short for an access token." : null;
    case 'app_secret':
      if (!v) return 'Paste the App secret.';
      return /^[0-9a-fA-F]{32}$/.test(v) ? null : 'The App secret is 32 letters and digits.';
    case 'name':
      return v.length > 80 ? 'Keep the name to 80 characters.' : null;
  }
}

/** Whether Meta has reached the webhook: it checked the URL, or a message arrived. */
export const webhookWorking = (n: Pick<WhatsAppConnection, 'webhook_verified_at' | 'last_event_at'> | undefined) =>
  Boolean(n?.webhook_verified_at || n?.last_event_at);

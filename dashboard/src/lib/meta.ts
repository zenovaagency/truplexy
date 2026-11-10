import type { Channel, MetaConnectInput, MetaConnection, MetaProvider } from '@/lib/api/types';

/* The business's own Facebook Page, for Messenger or its Instagram account (API_REFERENCE.md → POST /channels/messenger). */

export const META_PROVIDERS: MetaProvider[] = ['messenger', 'instagram'];

export const isMetaProvider = (t: string): t is MetaProvider => t === 'messenger' || t === 'instagram';

export const isMetaChannel = (c: Pick<Channel, 'type'>) => isMetaProvider(c.type);

/** How each provider is named, and what it is connected to. */
export const META_LABEL: Record<MetaProvider, { name: string; account: string }> = {
  messenger: { name: 'Messenger', account: 'Facebook Page' },
  instagram: { name: 'Instagram', account: 'Instagram account' },
};

/** Where the person does each step in Meta. */
export const META_PAGE_LINKS = {
  apps: 'https://developers.facebook.com/apps/',
  systemUsers: 'https://business.facebook.com/settings/system-users',
  pages: 'https://business.facebook.com/settings/pages',
  messengerDocs: 'https://developers.facebook.com/docs/messenger-platform/get-started',
  instagramDocs: 'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/messaging-api',
} as const;

/** The permissions the system user's token needs, by provider. */
export const META_PERMISSIONS: Record<MetaProvider, string[]> = {
  messenger: ['pages_messaging', 'pages_manage_metadata', 'pages_show_list', 'pages_read_engagement'],
  instagram: ['pages_messaging', 'pages_manage_metadata', 'pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_manage_messages'],
};

export type MetaField = keyof MetaConnectInput;

/** Light checks only, so a pasted value with a typo is caught before Meta is asked. The API says what Meta refused. */
export function metaFieldError(field: MetaField, value: string): string | null {
  const v = value.trim();
  switch (field) {
    case 'page_id':
      if (!v) return 'Paste the Page ID.';
      if (/facebook\.com|^@|[a-z]/i.test(v)) return "That's the Page's name or address. Paste its ID: digits only.";
      return /^\d{5,32}$/.test(v) ? null : 'The Page ID is digits only.';
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
export const metaWebhookWorking = (n: Pick<MetaConnection, 'webhook_verified_at' | 'last_event_at'> | undefined) =>
  Boolean(n?.webhook_verified_at || n?.last_event_at);

/** How a connected account is shown: the Instagram @username, or the Page's name. */
export const metaAccountLabel = (n: Pick<MetaConnection, 'provider' | 'account_name' | 'username' | 'account_id'>) =>
  n.provider === 'instagram' && n.username ? `@${n.username}` : n.account_name || n.account_id;

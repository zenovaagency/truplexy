import type { AuditEvent } from '@/lib/api/types';
import { formatCurrency, humanize } from '@/lib/format';

export type AuditCategory = 'members' | 'invites' | 'keys' | 'channels' | 'bots' | 'business' | 'plan' | 'billing' | 'webhook' | 'other';

export const AUDIT_CATEGORY_LABEL: Record<AuditCategory, string> = {
  members: 'Members',
  invites: 'Invitations',
  keys: 'API keys',
  channels: 'Channels',
  bots: 'Bots',
  business: 'Business',
  plan: 'Plan & limits',
  billing: 'Billing',
  webhook: 'Webhook',
  other: 'Other',
};

const PREFIX: [string, AuditCategory][] = [
  ['member.', 'members'],
  ['invite.', 'invites'],
  ['api_key.', 'keys'],
  ['channel.', 'channels'],
  ['channel_type.', 'channels'],
  ['bot.', 'bots'],
  ['business.', 'business'],
  ['plan.', 'plan'],
  ['limits.', 'plan'],
  ['billing.', 'billing'],
  ['webhook.', 'webhook'],
];

export const auditCategory = (action: string): AuditCategory => PREFIX.find(([p]) => action.startsWith(p))?.[1] ?? 'other';

const VERB: Record<string, string> = {
  'member.role_changed': 'changed the role of',
  'member.removed': 'removed',
  'member.left': 'left the business',
  'member.joined': 'joined the business',
  'invite.created': 'invited',
  'invite.revoked': 'cancelled the invitation for',
  'invite.accepted': 'accepted an invitation',
  'api_key.created': 'issued API key',
  'api_key.revoked': 'revoked API key',
  'channel.create': 'added channel',
  'channel.update': 'changed channel',
  'channel.delete': 'deleted channel',
  'channel.widget_update': 'changed the chat window of',
  'bot.widget_update': 'changed the chat widget',
  'bot.widget_picture_updated': 'changed the chat widget picture',
  'bot.widget_picture_removed': 'removed the chat widget picture',
  'channel.platform_disabled': 'turned off channel',
  'channel.platform_enabled': 'turned back on channel',
  'channel.connect_started': 'started connecting a Shopify store',
  'channel.connect': 'connected a Shopify store',
  'channel.disconnect': 'Shopify store disconnected',
  'channel_type.create': 'added channel type',
  'channel_type.update': 'changed channel type',
  // Events recorded before the API settled on the names above.
  'channel.created': 'added channel',
  'channel.updated': 'changed channel',
  'channel.deleted': 'deleted channel',
  'channel.disabled': 'turned off channel',
  'channel.enabled': 'turned on channel',
  'bot.created': 'created bot',
  'business.created': 'created the business',
  'business.updated': 'updated business details',
  'business.logo_updated': 'changed the business logo',
  'business.logo_removed': 'removed the business logo',
  'business.suspended': 'suspended the business',
  'business.reactivated': 'reactivated the business',
  'business.deletion_requested': 'asked to delete the business',
  'business.deletion_cancelled': 'withdrew the deletion request',
  'business.deletion_rejected': 'rejected the deletion request',
  'business.deleted': 'deleted the business',
  'business.restored': 'restored the business',
  'plan.changed': 'changed the plan',
  'limits.changed': 'changed plan limits',
  'billing.credit': 'credited the balance',
  'billing.debit': 'debited the balance',
  'billing.token_addon': 'bought extra tokens',
  'webhook.updated': 'updated the webhook',
  'webhook.deleted': 'removed the webhook',
  'webhook.secret_rotated': 'rotated the webhook secret',
  'tool.enabled': 'enabled tool',
  'tool.disabled': 'disabled tool',
};

/** "changed the role of", plus the target when the sentence needs one. */
export function describeAudit(e: AuditEvent, nameOf?: (userId: string) => string | undefined) {
  const verb = VERB[e.action] ?? humanize(e.action).toLowerCase();
  const selfContained = /business$|left the business|joined the business|accepted an invitation|the webhook|secret$|the plan|plan limits|the balance|extra tokens|details$|deletion request$|shopify store|store disconnected$/i.test(verb);
  const d = e.details ?? {};
  let extra = '';
  if (e.action === 'member.role_changed' && d.from && d.to) extra = ` from ${d.from} to ${d.to}`;
  if (e.action === 'invite.created' && d.role) extra = ` as ${d.role}`;
  if (e.action === 'plan.changed' && d.to) extra = ` to ${d.to}`;
  if (e.action.startsWith('channel.platform_')) extra = ' as a platform admin';
  if (e.action === 'channel.connect_started' || e.action === 'channel.connect' || e.action === 'channel.disconnect') {
    const why = d.reason === 'app/uninstalled' ? 'the app was uninstalled in Shopify' : d.reason === 'shop/redact' ? "Shopify asked to erase the store's data" : '';
    const parts = [typeof d.name === 'string' && d.name, e.action === 'channel.disconnect' && why].filter(Boolean);
    if (parts.length) extra = ` (${parts.join(': ')})`;
  }
  if ((e.action === 'billing.credit' || e.action === 'billing.debit') && typeof d.amount === 'number') extra = ` by ${formatCurrency(Math.abs(d.amount))}`;
  const label = (typeof d.email === 'string' && d.email) || (typeof d.name === 'string' && d.name) || nameOf?.(e.target) || e.target;
  return { verb, target: selfContained ? '' : label, extra };
}

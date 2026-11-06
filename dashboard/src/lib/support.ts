import type { AutoAssignMode, Availability, Member, SupportCategory } from '@/lib/api/types';

/** The kinds of issue a team handles: a ticket's category and a member's support roles (backend `internal/support`). */
export const SUPPORT_CATEGORIES: SupportCategory[] = ['general', 'billing', 'technical', 'orders', 'returns', 'account', 'sales', 'product'];

export const CATEGORY_LABEL: Record<SupportCategory, string> = {
  general: 'General support',
  billing: 'Payments & billing',
  technical: 'Technical support',
  orders: 'Orders & shipping',
  returns: 'Returns & refunds',
  account: 'Account & login',
  sales: 'Sales',
  product: 'Product questions',
};

/** Short labels for badges and narrow columns. */
export const CATEGORY_SHORT: Record<SupportCategory, string> = {
  general: 'General',
  billing: 'Billing',
  technical: 'Technical',
  orders: 'Orders',
  returns: 'Returns',
  account: 'Account',
  sales: 'Sales',
  product: 'Product',
};

export const CATEGORY_DESCRIPTION: Record<SupportCategory, string> = {
  general: 'Anything that fits nowhere else. Members without a role count here.',
  billing: 'Charges, invoices, cards, subscriptions and pricing.',
  technical: 'Errors, bugs, setup, integrations and anything not working.',
  orders: 'Order status, shipping, tracking and delivery.',
  returns: 'Returns, refunds, exchanges and damaged items.',
  account: 'Signing in, passwords, profiles and account changes.',
  sales: 'Buying, quotes, discounts, demos and bulk orders.',
  product: 'How products work, sizes, materials and stock.',
};

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Available',
  away: 'Away',
  offline: 'Offline',
};

export const AVAILABILITIES: Availability[] = ['available', 'away', 'offline'];

export const AUTO_ASSIGN_LABEL: Record<AutoAssignMode, string> = {
  category: 'By issue category',
  overall: 'Everyone in turn',
  off: 'Off',
};

export const AUTO_ASSIGN_DESCRIPTION: Record<AutoAssignMode, string> = {
  category:
    'Each new ticket goes to the next online member with the ticket’s support role, then to general support, then to anyone online.',
  overall: 'Each new ticket goes to the next online member of the whole team, whatever their support roles.',
  off: 'New tickets stay unassigned until someone picks them up.',
};

/**
 * What a member's status dot shows: `online` (available and active in the last 15 minutes, so tickets are assigned
 * to them), `idle` (available but not seen lately, so treated as away), `away` or `offline`.
 */
export type Presence = 'online' | 'idle' | 'away' | 'offline';

export function presenceOf(m: Pick<Member, 'availability' | 'online'>): Presence {
  if (m.availability === 'away') return 'away';
  if (m.availability === 'offline') return 'offline';
  return m.online ? 'online' : 'idle';
}

export const PRESENCE_LABEL: Record<Presence, string> = {
  online: 'Available',
  idle: 'Away (inactive)',
  away: 'Away',
  offline: 'Offline',
};

/** A member's support roles, with none read as general. */
export function rolesOf(m: Pick<Member, 'support_roles'>): SupportCategory[] {
  return m.support_roles?.length ? m.support_roles : ['general'];
}

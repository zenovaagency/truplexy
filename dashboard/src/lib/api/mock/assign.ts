import type { AutoAssignMode, Availability, Member, SupportCategory } from '@/lib/api/types';
import type { MockDb, MockMembership, MockTicket } from './db';

/**
 * Team assignment in demo mode, as the API does it (backend `internal/support` and `internal/tickets/assign.go`):
 * keyword categories, availability with a 15-minute activity window, and round robin per category or overall.
 */

const RULES: [SupportCategory, string[]][] = [
  ['returns', ['return', 'returning', 'refund', 'exchange', 'send it back', 'send back', 'money back', 'wrong size', 'wrong item', 'damaged', 'broken on arrival', 'rma']],
  ['billing', ['payment', 'pay', 'paid', 'charge', 'charged', 'invoice', 'receipt', 'billing', 'bill', 'card', 'credit card', 'debit', 'subscription', 'renewal', 'price', 'pricing', 'plan', 'upgrade', 'downgrade', 'cancel my subscription', 'double charged', 'transaction', 'paypal', 'stripe', 'vat', 'tax']],
  ['orders', ['order', 'shipping', 'shipment', 'ship', 'delivery', 'deliver', 'delivered', 'tracking', 'track', 'courier', 'package', 'parcel', 'dispatch', 'arrive', 'arrived', 'late', 'lost', 'address']],
  ['account', ['account', 'login', 'log in', 'sign in', 'signin', 'password', 'reset', 'username', 'email address', '2fa', 'two factor', 'verification code', 'locked out', "can't access", 'cannot access', 'delete my account', 'profile']],
  ['technical', ['error', 'bug', 'crash', 'crashes', 'not working', "doesn't work", 'does not work', "isn't working", 'broken', 'fails', 'failed', 'failing', 'issue', 'glitch', 'slow', 'loading', "won't load", 'install', 'setup', 'set up', 'integration', 'api', 'app', 'website', '500', '404', 'timeout', 'sync', 'configure']],
  ['sales', ['buy', 'purchase', 'quote', 'demo', 'discount', 'coupon', 'promo', 'bulk', 'wholesale', 'enterprise', 'trial', 'sales', 'offer', 'deal']],
  ['product', ['product', 'feature', 'how do i', 'how to', 'does it', 'size', 'sizing', 'colour', 'color', 'material', 'compatible', 'compatibility', 'specs', 'specification', 'in stock', 'stock', 'available', 'recommend', 'difference between']],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = RULES.map(([, words]) => words.map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}(s|es|ed|d|ing)?([^\\p{L}\\p{N}]|$)`, 'u')));

/** The category with the most keyword matches (phrases count double); general when none match. */
export function classify(text: string): SupportCategory {
  const lower = text.toLowerCase().replace(/’/g, "'");
  let best: SupportCategory = 'general';
  let bestScore = 0;
  RULES.forEach(([category, words], i) => {
    let score = 0;
    PATTERNS[i]!.forEach((p, j) => {
      if (p.test(lower)) score += words[j]!.includes(' ') ? 2 : 1;
    });
    if (score > bestScore) [best, bestScore] = [category, score];
  });
  return best;
}

const ACTIVE_MS = 15 * 60_000;
const WORKERS = new Set(['owner', 'admin', 'editor', 'agent']);

/** Available and active in the last 15 minutes. Seeded teammates marked `demo_active` always count as active. */
export function isOnline(m: MockMembership, now = Date.now()): boolean {
  if ((m.availability ?? 'available') !== 'available') return false;
  return Boolean(m.demo_active) || (!!m.last_active_at && now - new Date(m.last_active_at).getTime() <= ACTIVE_MS);
}

export function memberFields(m: MockMembership): Pick<Member, 'support_roles' | 'availability' | 'last_active_at' | 'online'> {
  return {
    support_roles: m.support_roles ?? [],
    availability: (m.availability ?? 'available') as Availability,
    last_active_at: m.last_active_at,
    online: isOnline(m),
  };
}

const rolesOf = (m: MockMembership): SupportCategory[] => (m.support_roles?.length ? m.support_roles : ['general']);

/**
 * Classifies a ticket nobody classified, then gives an open, unassigned ticket to the online member whose turn it is.
 * Returns the member's user ID, or undefined when nobody was assigned.
 */
export function autoAssign(db: MockDb, t: MockTicket, text = ''): string | undefined {
  if (!t.category) t.category = classify([t.subject, text].join('\n'));
  const tenant = db.tenants.find((x) => x.id === t.tenant_id);
  const mode: AutoAssignMode = tenant?.auto_assign ?? 'category';
  if (mode === 'off' || t.status !== 'open' || t.assignee_user_id) return undefined;
  const key = mode === 'category' ? t.category : '*';
  db.rotation ??= {};
  const rotation = db.rotation;
  const last = (m: MockMembership) => rotation[`${t.tenant_id}|${key}|${m.user_id}`] ?? '';
  const tier = (m: MockMembership) => (mode !== 'category' ? 0 : rolesOf(m).includes(t.category!) ? 0 : rolesOf(m).includes('general') ? 1 : 2);
  const next = db.memberships
    .filter((m) => m.tenant_id === t.tenant_id && WORKERS.has(m.role) && isOnline(m))
    .sort((a, b) => tier(a) - tier(b) || last(a).localeCompare(last(b)) || a.joined_at.localeCompare(b.joined_at) || a.user_id.localeCompare(b.user_id))[0];
  if (!next) return undefined;
  t.assignee_user_id = next.user_id;
  t.assignee_name = db.users.find((u) => u.id === next.user_id)?.name;
  rotation[`${t.tenant_id}|${key}|${next.user_id}`] = new Date().toISOString();
  return next.user_id;
}

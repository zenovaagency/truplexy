/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ApiKey,
  DeletionRequest,
  Billing,
  BillingAddon,
  BotConfig,
  Business,
  BusinessTypeId,
  Channel,
  Customer,
  LedgerEntry,
  Limits,
  Permission,
  PlatformChannelType,
  PlaygroundMessage,
  PlaygroundRunResult,
  Role,
  SearchHit,
  Source,
  SupportStats,
  Ticket,
  TicketMessage,
  TicketReply,
  TicketStatus,
  ToolRun,
  UsageDay,
  UsageSummary,
} from '@/lib/api/types';
import { quoteTokens } from '@/lib/billing';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '@/lib/permissions';
import { emit, topicFor } from './bus';
import { hex, newId, nowIso, saveDb, wsKey, type MockBotConfig, type MockChannel, type MockCustomer, type MockDb, type MockDoc, type MockModel, type MockTenant, type MockTicket, type MockUser } from './db';
import { BUSINESS_TYPES, PLANS, hashString, rng } from './fixtures';

/* ------------------------------------------------------------------ */
/* Plumbing                                                            */
/* ------------------------------------------------------------------ */

export class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const err = (status: number, code: string, message: string, extra?: Record<string, unknown>) => new MockHttpError(status, code, message, extra);
const notFound = (code: string, what: string) => err(404, code, `${what} not found.`);
const invalid = (message: string) => err(400, 'INVALID_REQUEST', message);

export interface Ctx {
  db: MockDb;
  user: MockUser;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  tenant: MockTenant;
  botId: string;
  role: Role | null;
}

type Access = 'public' | 'account' | 'platform' | Permission;
type Handler = (c: Ctx) => unknown;
interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  access: Access;
  fn: Handler;
}

const routes: Route[] = [];
function route(method: string, path: string, access: Access, fn: Handler) {
  const keys: string[] = [];
  const re = new RegExp(`^${path.replace(/:([a-z_]+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
  routes.push({ method, re, keys, access, fn });
}

/** Status 201 / 204 are signalled by wrapping the result. */
export const created = (body: unknown) => ({ __status: 201, body });
export const noContent = () => ({ __status: 204, body: null });

const DAY = 86_400_000;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/;

const userById = (db: MockDb, id: string) => db.users.find((u) => u.id === id);
const memberOf = (db: MockDb, tenant: string, user: string) => db.memberships.find((m) => m.tenant_id === tenant && m.user_id === user);
const permsFor = (role: Role | null, platform: boolean): Set<Permission> =>
  new Set(platform ? DEFAULT_ROLE_PERMISSIONS.owner : role ? DEFAULT_ROLE_PERMISSIONS[role] : []);

function limitsOf(t: MockTenant): Limits {
  const plan = PLANS.find((p) => p.id === t.plan) ?? PLANS[0]!;
  return { ...plan.limits, ...t.limit_overrides };
}

function businessOf(db: MockDb, t: MockTenant): Business {
  return {
    id: t.id,
    name: t.name,
    business_type: t.business_type,
    plan: t.plan,
    status: t.status,
    created_at: t.created_at,
    logo_url: t.logo_url,
    reply_target_hours: t.reply_target_hours,
    limits: limitsOf(t),
    limit_overrides: t.limit_overrides,
    usage: {
      bots: db.bots.filter((b) => b.tenant_id === t.id).length,
      members:
        db.memberships.filter((m) => m.tenant_id === t.id).length +
        db.invites.filter((i) => i.tenant_id === t.id && i.status === 'pending').length,
      replies_this_month: t.replies_this_month,
      tokens_this_month: t.tokens_this_month,
    },
    balance: t.balance,
    ...(t.deleted_at ? { deleted_at: t.deleted_at } : {}),
  };
}

/* Pricing -------------------------------------------------------------- */

/** The platform defaults (PRICE_FEE_PERCENT, PRICE_COMMISSION_PERCENT). */
const PRICE_FEE_PERCENT = 5.5;
const PRICE_COMMISSION_PERCENT = 20;

/** The mock's usage costs are OpenRouter's; businesses were billed this much more, at the default markup. */
const MOCK_MARKUP = 1 + (PRICE_FEE_PERCENT + PRICE_COMMISSION_PERCENT) / 100;

const round = (n: number, digits: number) => +n.toFixed(digits);

/** A catalog model's markup and what businesses pay per million tokens. */
function pricing(m: MockModel) {
  const fee = m.fee_percent ?? PRICE_FEE_PERCENT;
  const commission = m.commission_percent ?? PRICE_COMMISSION_PERCENT;
  const k = 1 + (fee + commission) / 100;
  return {
    effective_fee_percent: fee,
    effective_commission_percent: commission,
    billed_input_price_per_mtok: round(m.input_price_per_mtok * k, 6),
    billed_output_price_per_mtok: round(m.output_price_per_mtok * k, 6),
  };
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

function billingOf(t: MockTenant): Billing {
  const plan = PLANS.find((p) => p.id === t.plan) ?? PLANS[0]!;
  const planAllowance = limitsOf(t).tokens_per_month;
  const unlimited = planAllowance === 0;
  const addons = t.addons.filter((a) => a.month === thisMonth());
  const extra = addons.reduce((n, a) => n + a.tokens, 0);
  const allowance = unlimited ? 0 : planAllowance + extra;
  return {
    currency: 'USD',
    balance: t.balance,
    month: thisMonth(),
    plan: { id: plan.id, name: plan.name },
    tokens: { unlimited, plan_allowance: planAllowance, addons: extra, allowance, used: t.tokens_this_month, remaining: unlimited ? null : Math.max(0, allowance - t.tokens_this_month) },
    token_addon: unlimited ? null : plan.token_addon,
    addons,
  };
}

function addonMillions(t: MockTenant, raw: unknown) {
  const b = billingOf(t);
  const a = b.token_addon;
  if (!a) {
    throw err(400, 'ADDON_NOT_AVAILABLE', b.tokens.unlimited ? "This business's tokens are unlimited, so it needs no extra tokens." : "This business's plan doesn't sell extra tokens.");
  }
  const m = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isInteger(m) || m < a.min_millions || m > a.max_millions || (m - a.min_millions) % a.step_millions) {
    throw invalid(`millions must be ${a.min_millions}–${a.max_millions}.`);
  }
  return { addon: a, millions: m };
}

function ledgerEntry(t: MockTenant, e: Omit<LedgerEntry, 'id' | 'balance_after' | 'created_at'>): LedgerEntry {
  t.balance = round(t.balance + e.amount, 6);
  const entry: LedgerEntry = { id: newId('led'), ...e, balance_after: t.balance, created_at: nowIso() };
  t.ledger.unshift(entry);
  return entry;
}

function audit(c: Ctx, action: string, target: string, details: Record<string, unknown> | null = null, tenantId = c.tenant?.id) {
  c.db.audit.unshift({
    id: newId('aud'),
    tenant_id: tenantId ?? '_platform',
    actor: c.user.id,
    actor_email: c.user.email,
    action,
    target,
    details,
    created_at: nowIso(),
  });
}

function requireLimit(t: MockTenant, key: keyof Limits, used: number) {
  const max = limitsOf(t)[key];
  if (max > 0 && used >= max) throw err(403, 'PLAN_LIMIT_REACHED', `The ${t.plan} plan allows ${max} ${key.replace(/_/g, ' ')}.`, { limit: key });
}

function str(v: unknown, field: string, min: number, max: number, required = true): string | undefined {
  if (v === undefined || v === null) {
    if (required) throw invalid(`${field} is required.`);
    return undefined;
  }
  if (typeof v !== 'string') throw invalid(`${field} must be a string.`);
  if (v.length < min || v.length > max) throw invalid(`${field} must be ${min}–${max} characters.`);
  return v;
}

/* ------------------------------------------------------------------ */
/* Tickets                                                             */
/* ------------------------------------------------------------------ */

const TICKET_STATUSES: TicketStatus[] = ['open', 'closed'];

function ticketOut(db: MockDb, t: MockTicket): Ticket {
  const tenant = db.tenants.find((x) => x.id === t.tenant_id)!;
  const done = t.status !== 'open';
  const needs = !done && !!t.last_customer_at && (!t.last_agent_at || t.last_customer_at > t.last_agent_at);
  const overdue = needs && Date.now() - new Date(t.last_customer_at!).getTime() > tenant.reply_target_hours * 3_600_000;
  const assignee = t.assignee_user_id ? userById(db, t.assignee_user_id) : undefined;
  const ch = t.channel_id ? db.channels.find((x) => x.id === t.channel_id) : undefined;
  return {
    ...t,
    channel_name: ch?.name ?? t.channel_name,
    channel_type: ch?.type ?? t.channel_type,
    assignee_name: assignee?.name ?? t.assignee_name,
    needs_reply: needs,
    flags: {
      needs_reply: needs,
      escalated: t.escalated,
      handed_off: t.handed_off,
      unassigned: !t.assignee_user_id,
      overdue,
      reopened: t.reopen_count > 0,
    },
  } as Ticket & { tenant_id?: string; bot_id?: string };
}

function findTicket(c: Ctx) {
  const t = c.db.tickets.find((x) => x.id === c.params.id && x.tenant_id === c.tenant.id && x.bot_id === c.botId);
  if (!t) throw notFound('TICKET_NOT_FOUND', 'Ticket');
  return t;
}

function emitTicket(c: Ctx, t: MockTicket, event: 'ticket.created' | 'ticket.updated') {
  emit(t.tenant_id, t.bot_id, event, {
    conversation_id: t.conversation_id,
    ticket: { id: t.id, subject: t.subject, status: t.status, priority: t.priority, escalated: t.escalated, channel_id: t.channel_id },
  });
  void c;
}

/** Reads an optional ?status= filter; anything but open or closed is a 400. */
function statusParam(q: URLSearchParams): TicketStatus | undefined {
  const s = q.get('status');
  if (!s) return undefined;
  if (!TICKET_STATUSES.includes(s as TicketStatus)) throw invalid('status must be open or closed.');
  return s as TicketStatus;
}

function applyStatus(t: MockTicket, next: TicketStatus) {
  if (!TICKET_STATUSES.includes(next)) throw invalid('status must be open or closed.');
  if (next === 'open' && t.status === 'closed') {
    t.reopen_count += 1;
    t.closed_at = undefined;
  }
  if (next === 'closed' && t.status !== 'closed') {
    t.closed_at = nowIso();
    t.escalated = false;
  }
  t.status = next;
}

/* ------------------------------------------------------------------ */
/* Usage, derived deterministically from the date                      */
/* ------------------------------------------------------------------ */

const BASE_VOLUME: Record<string, number> = { 'acme/support': 150, 'acme/wholesale': 14, 'northwind/support': 72, 'bloom-clinic/support': 9, 'harbor-realty/support': 18, 'old-bakery/support': 0 };

function usageDay(tenant: string, bot: string, date: string): UsageDay {
  const r = rng(hashString(`${tenant}/${bot}/${date}`));
  const d = new Date(`${date}T00:00:00Z`);
  if (d.getTime() > Date.now()) return { date, requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost: 0 };
  const weekday = d.getUTCDay();
  const base = BASE_VOLUME[`${tenant}/${bot}`] ?? 5;
  const weekly = weekday === 0 || weekday === 6 ? 0.62 : 1;
  const trend = 1 + (d.getTime() - Date.now()) / (DAY * 400);
  const requests = Math.round(base * weekly * trend * (0.75 + r() * 0.5));
  const input = requests * (1700 + Math.floor(r() * 500));
  const output = requests * (120 + Math.floor(r() * 60));
  return {
    date,
    requests,
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output,
    estimated_cost: +(input * 0.0000001 + output * 0.0000004).toFixed(4),
  };
}

function rangeOf(q: URLSearchParams) {
  const to = q.get('to') ?? new Date().toISOString().slice(0, 10);
  const from = q.get('from') ?? new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * DAY).toISOString().slice(0, 10);
  const days: string[] = [];
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= new Date(`${to}T00:00:00Z`).getTime(); t += DAY) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw invalid('from and to must be YYYY-MM-DD, with from ≤ to.');
  if (days.length > 366) throw invalid('The range is at most 366 days.');
  return { from, to, days };
}

/* ------------------------------------------------------------------ */
/* Retrieval: a tiny keyword ranker over the bot's documents            */
/* ------------------------------------------------------------------ */

const STOP = new Set('a an the and or of to in on for is are do does can i my me you your it with how what when where be from at this that there please hi hello'.split(' '));
const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !STOP.has(w) && w.length > 1) ?? [];

function sections(doc: MockDoc) {
  const parts = doc.content.split(/\n(?=## )/);
  return parts.map((p, i) => {
    const heading = p.match(/^#{1,3} (.+)$/m)?.[1] ?? doc.title;
    return { id: `${doc.id}:${i}`, doc, heading, position: i, content: p.replace(/^#{1,3} .+$/gm, '').trim() };
  });
}

function retrieve(db: MockDb, tenant: string, bot: string, query: string, topK: number) {
  const q = tokens(query);
  const all = db.documents
    .filter((d) => d.tenant_id === tenant && d.bot_id === bot && d.status === 'indexed' && d.content)
    .flatMap(sections);
  const scored = all
    .map((s) => {
      const words = tokens(`${s.heading} ${s.content}`);
      const set = new Set(words);
      const hits = q.filter((w) => set.has(w) || [...set].some((x) => x.startsWith(w.slice(0, 5)) && w.length > 4)).length;
      const score = q.length ? hits / q.length : 0;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score);
  return { q, scored, selected: scored.filter((x) => x.score > 0).slice(0, topK) };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

route('GET', '/health', 'public', () => ({ status: 'ok' }));

/* Account ------------------------------------------------------------ */

route('GET', '/me', 'account', ({ db, user }) => ({
  user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url },
  platform_admin: user.platform_admin,
  memberships: db.memberships
    .filter((m) => m.user_id === user.id && !db.tenants.find((t) => t.id === m.tenant_id)?.deleted_at)
    .map((m) => {
      const t = db.tenants.find((x) => x.id === m.tenant_id)!;
      return {
        tenant_id: t.id,
        name: t.name,
        business_type: t.business_type,
        plan: t.plan,
        status: t.status,
        role: m.role,
        bots: db.bots.filter((b) => b.tenant_id === t.id).map((b) => ({ id: b.id, name: b.name, avatar_url: b.avatar_url })),
        logo_url: t.logo_url,
      };
    }),
  roles: DEFAULT_ROLE_PERMISSIONS,
}));

route('GET', '/business-types', 'account', () => ({ data: BUSINESS_TYPES }));
route('GET', '/plans', 'account', () => ({ data: PLANS }));

route('POST', '/tenants', 'account', (c) => {
  const name = str(c.body.name, 'name', 1, 80)!;
  const type = BUSINESS_TYPES.find((b) => b.id === c.body.business_type);
  if (!type) throw invalid('business_type must be an id from GET /business-types.');
  const owned = c.db.memberships.filter((m) => m.user_id === c.user.id && m.role === 'owner').length;
  if (owned >= 3 && !c.user.platform_admin) throw err(403, 'BUSINESS_LIMIT_REACHED', 'You already own 3 businesses.');
  let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'business';
  if (!/^[a-z0-9]/.test(id)) id = `b-${id}`;
  let n = 2;
  const base = id;
  while (c.db.tenants.some((t) => t.id === id)) id = `${base}-${n++}`;
  const now = nowIso();
  const t: MockTenant = { id, name, business_type: type.id, plan: 'free', status: 'active', created_at: now, reply_target_hours: 24, limit_overrides: {}, replies_this_month: 0, tokens_this_month: 0, balance: 0, addons: [], ledger: [] };
  c.db.tenants.push(t);
  c.db.memberships.push({ tenant_id: id, user_id: c.user.id, role: 'owner', joined_at: now });
  c.db.bots.push({ tenant_id: id, id: 'support', name: type.assistant_name, kb_version: 0, created_at: now });
  c.db.workspaces.push({ tenant_id: id, bot_id: 'support', name: type.assistant_name, revision: 0, history: [], bot: defaultBot(c.db, type.id, type.assistant_name) });
  audit({ ...c, tenant: t }, 'business.created', id, { business_type: type.id });
  return created({ tenant: businessOf(c.db, t), bot_id: 'support' });
});

function defaultBot(db: MockDb, type: BusinessTypeId, name: string) {
  const tpl = db.templates.find((t) => t.status === 'active' && t.business_types.includes(type)) ?? db.templates.find((t) => t.is_default)!;
  return {
    name,
    promptTemplateId: tpl.id,
    promptVariables: Object.fromEntries(tpl.variables.map((v) => [v.key, v.key === 'tone' ? 'Friendly and concise' : ''])),
    model: '',
    temperature: 0.4,
    maxTokens: 800,
    ragEnabled: true,
    topK: 4,
    toolsEnabled: false,
    tools: [],
  };
}

function inviteByToken(c: Ctx) {
  const inv = c.db.invites.find((i) => i.token === c.body?.token);
  if (!inv) throw notFound('INVITE_NOT_FOUND', 'Invitation');
  if (inv.status === 'accepted') throw err(409, 'INVITE_USED', 'This invitation was already used.');
  if (inv.status === 'revoked') throw err(410, 'INVITE_REVOKED', 'This invitation was cancelled.');
  if (new Date(inv.expires_at).getTime() < Date.now()) throw err(410, 'INVITE_EXPIRED', 'This invitation has expired.');
  const t = c.db.tenants.find((x) => x.id === inv.tenant_id)!;
  return { inv, out: { tenant_id: t.id, business_name: t.name, email: inv.email, role: inv.role, expires_at: inv.expires_at } };
}

route('POST', '/invites/preview', 'account', (c) => inviteByToken(c).out);
route('POST', '/invites/accept', 'account', (c) => {
  const { inv, out } = inviteByToken(c);
  // The demo account accepts any invitation; the real API checks the address (INVITE_EMAIL_MISMATCH).
  if (!memberOf(c.db, inv.tenant_id, c.user.id)) {
    c.db.memberships.push({ tenant_id: inv.tenant_id, user_id: c.user.id, role: inv.role, joined_at: nowIso() });
  }
  inv.status = 'accepted';
  return out;
});

/* Profile images (v2) ------------------------------------------------ */

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** The checks the API makes on an uploaded picture. Returns the data URL to store. */
function pictureOf(c: Ctx): string {
  const img = c.body.__image as { type: string; bytes: number; width: number; height: number; url: string } | null | undefined;
  if (!img) throw invalid('Send the image as multipart/form-data in a field named file.');
  if (!IMAGE_TYPES.includes(img.type)) throw err(415, 'UNSUPPORTED_IMAGE_TYPE', 'Use a PNG, JPEG or WebP image.');
  if (img.bytes > 512 * 1024) throw err(413, 'IMAGE_TOO_LARGE', 'The image is larger than 512 KiB.');
  if (!img.url || Math.min(img.width, img.height) < 16 || Math.max(img.width, img.height) > 4096) throw err(400, 'INVALID_IMAGE', 'The image is unreadable or its size is out of range.');
  return img.url;
}

route('PUT', '/me/avatar', 'account', (c) => {
  c.user.avatar_url = pictureOf(c);
  return { avatar_url: c.user.avatar_url };
});
route('DELETE', '/me/avatar', 'account', (c) => {
  delete c.user.avatar_url;
  return { avatar_url: null };
});

route('PUT', '/tenant/logo', 'business.write', (c) => {
  c.tenant.logo_url = pictureOf(c);
  audit(c, 'business.logo_updated', c.tenant.id);
  return { logo_url: c.tenant.logo_url };
});
route('DELETE', '/tenant/logo', 'business.write', (c) => {
  delete c.tenant.logo_url;
  audit(c, 'business.logo_removed', c.tenant.id);
  return { logo_url: null };
});

route('PUT', '/bots/:id/avatar', 'bot.write', (c) => {
  const bot = c.db.bots.find((b) => b.tenant_id === c.tenant.id && b.id === c.params.id);
  if (!bot) throw notFound('BOT_NOT_FOUND', 'Bot');
  bot.avatar_url = pictureOf(c);
  return { avatar_url: bot.avatar_url };
});
route('DELETE', '/bots/:id/avatar', 'bot.write', (c) => {
  const bot = c.db.bots.find((b) => b.tenant_id === c.tenant.id && b.id === c.params.id);
  if (!bot) throw notFound('BOT_NOT_FOUND', 'Bot');
  delete bot.avatar_url;
  return { avatar_url: null };
});

/* Business ----------------------------------------------------------- */

route('GET', '/tenant', 'members.read', (c) => businessOf(c.db, c.tenant));

route('PATCH', '/tenant', 'business.write', (c) => {
  const b = c.body;
  if (b.name !== undefined) c.tenant.name = str(b.name, 'name', 1, 80)!;
  if (b.business_type !== undefined) {
    if (!BUSINESS_TYPES.some((t) => t.id === b.business_type)) throw invalid('Unknown business_type.');
    if (b.business_type !== c.tenant.business_type) {
      c.tenant.business_type = b.business_type;
      // The system prompt follows the business type.
      for (const ws of c.db.workspaces.filter((w) => w.tenant_id === c.tenant.id)) {
        const { promptTemplateId, promptVariables } = defaultBot(c.db, b.business_type, ws.bot.name);
        ws.bot = { ...ws.bot, promptTemplateId, promptVariables, prompt: '' };
      }
    }
  }
  if (b.reply_target_hours !== undefined) {
    if (!Number.isInteger(b.reply_target_hours) || b.reply_target_hours < 1 || b.reply_target_hours > 720) throw invalid('reply_target_hours must be 1–720.');
    c.tenant.reply_target_hours = b.reply_target_hours;
  }
  audit(c, 'business.updated', c.tenant.id, b);
  return businessOf(c.db, c.tenant);
});

route('POST', '/tenant/leave', 'members.read', (c) => {
  const owners = c.db.memberships.filter((m) => m.tenant_id === c.tenant.id && m.role === 'owner');
  if (c.role === 'owner' && owners.length === 1) throw err(409, 'LAST_OWNER', 'A business always keeps at least one owner.');
  c.db.memberships = c.db.memberships.filter((m) => !(m.tenant_id === c.tenant.id && m.user_id === c.user.id));
  audit(c, 'member.left', c.user.id);
  return noContent();
});

/* Deletion requests --------------------------------------------------- */

const RESTORE_DAYS = 30;

const reasonOf = (v: unknown, field: string) => str(v, field, 0, 1000, false)?.trim() ?? '';

function protect(t: MockTenant) {
  if (t.id === 'default') throw err(409, 'TENANT_PROTECTED', "The default business can't be deleted.");
}

const latestRequest = (db: MockDb, tenant: string) =>
  db.deletionRequests.filter((r) => r.tenant_id === tenant).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
const pendingRequest = (db: MockDb, tenant: string) => db.deletionRequests.find((r) => r.tenant_id === tenant && r.status === 'pending');

route('GET', '/tenant/deletion-request', 'members.read', (c) => {
  const r = latestRequest(c.db, c.tenant.id);
  if (!r) throw notFound('DELETION_REQUEST_NOT_FOUND', 'Deletion request');
  return r;
});

route('POST', '/tenant/deletion-request', 'business.delete', (c) => {
  protect(c.tenant);
  if (pendingRequest(c.db, c.tenant.id)) throw err(409, 'DELETION_REQUEST_PENDING', 'A deletion request is already pending.');
  const reason = reasonOf(c.body?.reason, 'reason');
  const r: DeletionRequest = { id: newId('dlr'), tenant_id: c.tenant.id, tenant_name: c.tenant.name, requested_by: c.user.id, requested_by_email: c.user.email, reason, status: 'pending', created_at: nowIso() };
  c.db.deletionRequests.unshift(r);
  audit(c, 'business.deletion_requested', c.tenant.id, reason ? { reason } : null);
  return created(r);
});

route('DELETE', '/tenant/deletion-request', 'business.delete', (c) => {
  const r = pendingRequest(c.db, c.tenant.id);
  if (!r) throw notFound('DELETION_REQUEST_NOT_FOUND', 'Deletion request');
  r.status = 'cancelled';
  audit(c, 'business.deletion_cancelled', c.tenant.id);
  return r;
});

route('GET', '/members', 'members.read', (c) => ({
  data: c.db.memberships
    .filter((m) => m.tenant_id === c.tenant.id)
    .map((m) => {
      const u = userById(c.db, m.user_id)!;
      return { user_id: u.id, email: u.email, name: u.name, avatar_url: u.avatar_url, role: m.role, joined_at: m.joined_at };
    })
    .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.joined_at.localeCompare(b.joined_at)),
}));

function ownerGuard(c: Ctx, from: Role | undefined, to?: Role) {
  if ((from === 'owner' || to === 'owner') && !permsFor(c.role, c.user.platform_admin).has('owners.manage')) {
    throw err(403, 'FORBIDDEN', 'Only an owner can change owners.');
  }
}

route('PATCH', '/members/:user_id', 'members.write', (c) => {
  const m = memberOf(c.db, c.tenant.id, c.params.user_id!);
  if (!m) throw notFound('MEMBER_NOT_FOUND', 'Member');
  const role = c.body.role as Role;
  if (!ROLES.includes(role)) throw invalid('role must be owner, admin, editor, agent or viewer.');
  ownerGuard(c, m.role, role);
  if (m.role === 'owner' && role !== 'owner' && c.db.memberships.filter((x) => x.tenant_id === c.tenant.id && x.role === 'owner').length === 1) {
    throw err(409, 'LAST_OWNER', 'A business always keeps at least one owner.');
  }
  audit(c, 'member.role_changed', m.user_id, { from: m.role, to: role });
  m.role = role;
  const u = userById(c.db, m.user_id)!;
  return { user_id: u.id, email: u.email, name: u.name, role: m.role, joined_at: m.joined_at };
});

route('DELETE', '/members/:user_id', 'members.write', (c) => {
  const m = memberOf(c.db, c.tenant.id, c.params.user_id!);
  if (!m) throw notFound('MEMBER_NOT_FOUND', 'Member');
  ownerGuard(c, m.role);
  if (m.role === 'owner' && c.db.memberships.filter((x) => x.tenant_id === c.tenant.id && x.role === 'owner').length === 1) {
    throw err(409, 'LAST_OWNER', 'A business always keeps at least one owner.');
  }
  c.db.memberships = c.db.memberships.filter((x) => x !== m);
  audit(c, 'member.removed', m.user_id, { email: userById(c.db, m.user_id)?.email });
  return noContent();
});

route('GET', '/invites', 'members.read', (c) => ({
  data: c.db.invites
    .filter((i) => i.tenant_id === c.tenant.id && i.status === 'pending')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(({ token: _t, tenant_id: _x, ...i }) => i),
}));

route('POST', '/invites', 'members.write', (c) => {
  const email = str(c.body.email, 'email', 3, 254)!.toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw invalid('email is not a valid address.');
  const role = c.body.role as Role;
  if (!ROLES.includes(role)) throw invalid('role must be owner, admin, editor, agent or viewer.');
  ownerGuard(c, undefined, role);
  if (c.db.memberships.some((m) => m.tenant_id === c.tenant.id && userById(c.db, m.user_id)?.email === email)) {
    throw err(409, 'ALREADY_MEMBER', `${email} is already a member.`);
  }
  c.db.invites = c.db.invites.filter((i) => !(i.tenant_id === c.tenant.id && i.email === email && i.status === 'pending'));
  requireLimit(c.tenant, 'members', businessOf(c.db, c.tenant).usage.members);
  const inv = {
    id: newId('inv'),
    tenant_id: c.tenant.id,
    email,
    role,
    status: 'pending',
    invited_by: c.user.email,
    expires_at: new Date(Date.now() + 7 * DAY).toISOString(),
    created_at: nowIso(),
    token: `tpi_${hex(48)}`,
  };
  c.db.invites.push(inv);
  audit(c, 'invite.created', inv.id, { email, role });
  const { tenant_id: _t, ...out } = inv;
  // The mock API sends no email.
  return created({ ...out, emailed: false });
});

route('DELETE', '/invites/:id', 'members.write', (c) => {
  const inv = c.db.invites.find((i) => i.id === c.params.id && i.tenant_id === c.tenant.id && i.status === 'pending');
  if (!inv) throw notFound('INVITE_NOT_FOUND', 'Invitation');
  inv.status = 'revoked';
  audit(c, 'invite.revoked', inv.id, { email: inv.email });
  return noContent();
});

route('GET', '/audit', 'audit.read', (c) => ({
  data: c.db.audit.filter((a) => a.tenant_id === c.tenant.id).slice(0, 100).map(({ tenant_id: _t, ...a }) => a),
}));

/* Bots and keys ------------------------------------------------------ */

route('GET', '/bots', 'bot.read', (c) => ({
  data: c.db.bots.filter((b) => b.tenant_id === c.tenant.id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
}));

route('POST', '/bots', 'bots.create', (c) => {
  const id = str(c.body.bot_id, 'bot_id', 1, 31)!;
  if (!ID_RE.test(id)) throw invalid('bot_id must be lowercase letters, digits, - or _, starting with a letter or digit.');
  const name = str(c.body.name, 'name', 1, 80)!;
  if (c.db.bots.some((b) => b.tenant_id === c.tenant.id && b.id === id)) throw err(409, 'BOT_EXISTS', `A bot named ${id} exists.`);
  requireLimit(c.tenant, 'bots', c.db.bots.filter((b) => b.tenant_id === c.tenant.id).length);
  const bot = { tenant_id: c.tenant.id, id, name, kb_version: 0, created_at: nowIso() };
  c.db.bots.push(bot);
  c.db.workspaces.push({ tenant_id: c.tenant.id, bot_id: id, name, revision: 0, history: [], bot: defaultBot(c.db, c.tenant.business_type, name) });
  audit(c, 'bot.created', id, { name });
  return created(bot);
});

route('GET', '/api-keys', 'integrations.read', (c) => ({
  data: c.db.apiKeys.filter((k) => k.tenant_id === c.tenant.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
}));

route('POST', '/api-keys', 'integrations.write', (c) => {
  const name = str(c.body.name, 'name', 1, 80)!;
  const bot = c.db.bots.find((b) => b.tenant_id === c.tenant.id && b.id === c.body.bot_id);
  if (!bot) throw notFound('BOT_NOT_FOUND', 'Bot');
  const channel = c.body.channel_id ? channelOf(c, c.body.channel_id, bot.id) : undefined;
  const secret = `tpx_${hex(48)}`;
  const key: ApiKey = { id: newId('key'), name, tenant_id: c.tenant.id, bot_id: bot.id, key_prefix: secret.slice(0, 8), channel_id: channel?.id, status: 'active', created_at: nowIso() };
  c.db.apiKeys.push(key);
  audit(c, 'api_key.created', key.id, { name, bot_id: bot.id, ...(channel ? { channel: channel.name } : {}) });
  return created({ ...key, key: secret });
});

route('DELETE', '/api-keys/:id', 'integrations.write', (c) => {
  const k = c.db.apiKeys.find((x) => x.id === c.params.id && x.tenant_id === c.tenant.id);
  if (!k) throw notFound('KEY_NOT_FOUND', 'Key');
  k.status = 'revoked';
  audit(c, 'api_key.revoked', k.id, { name: k.name });
  return noContent();
});

/* Channels ------------------------------------------------------------- */

function channelOut(db: MockDb, ch: MockChannel): Channel {
  const tickets = db.tickets.filter((t) => t.channel_id === ch.id && t.tenant_id === ch.tenant_id);
  return {
    ...ch,
    type_label: db.channelTypes.find((t) => t.id === ch.type)?.label ?? ch.type,
    active: ch.enabled && !ch.disabled_by_platform,
    open_tickets: tickets.filter((t) => t.status === 'open').length,
    tickets: tickets.length,
    api_keys: db.apiKeys.filter((k) => k.channel_id === ch.id && k.status === 'active').length,
  };
}

const botChannels = (c: Ctx) => c.db.channels.filter((x) => x.tenant_id === c.tenant.id && x.bot_id === c.botId);

/** One of the bot's channels, or 404 CHANNEL_NOT_FOUND. */
function channelOf(c: Ctx, id: unknown, botId = c.botId) {
  const ch = c.db.channels.find((x) => x.id === id && x.tenant_id === c.tenant.id && x.bot_id === botId);
  if (!ch) throw notFound('CHANNEL_NOT_FOUND', 'Channel');
  return ch;
}

const offeredType = (db: MockDb, id: unknown) => db.channelTypes.find((t) => t.id === id && t.status === 'active');

/** Validates POST and PATCH /channels fields; `ch` is the channel being changed. */
function applyChannel(c: Ctx, ch: Partial<MockChannel>, b: any, existing?: MockChannel) {
  if (b.type !== undefined && (!existing || b.type !== existing.type)) {
    if (!offeredType(c.db, b.type)) throw err(400, 'CHANNEL_TYPE_NOT_ALLOWED', `Channel type ${b.type} isn't offered.`);
    ch.type = b.type;
  }
  if (b.name !== undefined) {
    const name = str(b.name, 'name', 1, 80)!.trim();
    if (!name) throw invalid('name must be 1–80 characters.');
    if (botChannels(c).some((x) => x !== existing && x.name.toLowerCase() === name.toLowerCase())) throw err(409, 'CHANNEL_EXISTS', `The bot has a channel named ${name}.`);
    ch.name = name;
  }
  if (b.description !== undefined) ch.description = str(b.description, 'description', 0, 300)!;
  if (b.external_id !== undefined) ch.external_id = str(b.external_id, 'external_id', 0, 128)!;
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== 'boolean') throw invalid('enabled must be true or false.');
    ch.enabled = b.enabled;
  }
}

route('GET', '/channel-types', 'channels.read', (c) => {
  const used = new Set(botChannels(c).map((x) => x.type));
  return {
    data: c.db.channelTypes
      .filter((t) => t.status === 'active' || used.has(t.id))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => ({ id: t.id, label: t.label, description: t.description, icon: t.icon, offered: t.status === 'active' })),
  };
});

route('GET', '/channels', 'channels.read', (c) => ({
  data: botChannels(c)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((x) => channelOut(c.db, x)),
}));

route('POST', '/channels', 'channels.write', (c) => {
  const b = c.body ?? {};
  if (b.type === undefined) throw invalid('type is required.');
  if (b.name === undefined) throw invalid('name is required.');
  const now = nowIso();
  const ch = { id: newId('chn'), tenant_id: c.tenant.id, bot_id: c.botId, description: '', external_id: '', enabled: true, disabled_by_platform: false, created_at: now, updated_at: now } as MockChannel;
  applyChannel(c, ch, b);
  c.db.channels.push(ch);
  audit(c, 'channel.created', ch.id, { name: ch.name, type: ch.type });
  return created(channelOut(c.db, ch));
});

route('GET', '/channels/:id', 'channels.read', (c) => channelOut(c.db, channelOf(c, c.params.id)));

route('PATCH', '/channels/:id', 'channels.write', (c) => {
  const ch = channelOf(c, c.params.id);
  const wasEnabled = ch.enabled;
  applyChannel(c, ch, c.body ?? {}, ch);
  ch.updated_at = nowIso();
  const action = ch.enabled === wasEnabled ? 'channel.updated' : ch.enabled ? 'channel.enabled' : 'channel.disabled';
  audit(c, action, ch.id, { name: ch.name });
  return channelOut(c.db, ch);
});

route('DELETE', '/channels/:id', 'channels.write', (c) => {
  const ch = channelOf(c, c.params.id);
  const keys = c.db.apiKeys.filter((k) => k.channel_id === ch.id && k.status === 'active').length;
  if (keys) throw err(409, 'CHANNEL_IN_USE', `${keys} active chat API key${keys === 1 ? ' is' : 's are'} bound to this channel. Revoke them first.`);
  // Its tickets keep its name and type.
  const label = c.db.channelTypes.find((t) => t.id === ch.type)?.label;
  for (const t of c.db.tickets) if (t.channel_id === ch.id) Object.assign(t, { channel_name: ch.name, channel_type: ch.type });
  c.db.channels = c.db.channels.filter((x) => x !== ch);
  audit(c, 'channel.deleted', ch.id, { name: ch.name, type: label ?? ch.type });
  return noContent();
});

/* Customers ------------------------------------------------------------ */

function customerOut(db: MockDb, cu: MockCustomer): Customer {
  const tickets = db.tickets.filter((t) => t.customer_id === cu.id && t.tenant_id === cu.tenant_id);
  return {
    ...cu,
    conversations: db.conversations.filter((x) => x.customer_id === cu.id && x.tenant_id === cu.tenant_id).length,
    tickets: tickets.length,
    open_tickets: tickets.filter((t) => t.status === 'open').length,
  };
}

const botCustomers = (c: Ctx) => c.db.customers.filter((x) => x.tenant_id === c.tenant.id && x.bot_id === c.botId);

function customerOf(c: Ctx, id: unknown) {
  const cu = botCustomers(c).find((x) => x.id === id);
  if (!cu) throw notFound('CUSTOMER_NOT_FOUND', 'Customer');
  return cu;
}

const CONTACT_LIMIT = 20;

/** Cleans a contacts array the way the API does: types lowercase, emails lowercased, phones stripped, one primary per type. */
function contactsOf(raw: unknown): MockCustomer['contacts'] {
  if (!Array.isArray(raw)) throw invalid('contacts must be an array.');
  if (raw.length > CONTACT_LIMIT) throw invalid(`A customer has at most ${CONTACT_LIMIT} contacts.`);
  const out: MockCustomer['contacts'] = [];
  for (const r of raw) {
    const type = str(r?.type, 'contact type', 2, 32)!.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]*$/.test(type)) throw invalid('A contact type is a lowercase word of 2–32 characters, such as email, phone or discord.');
    let value = str(r?.value, 'contact value', 1, 254)!.trim();
    if (type === 'email') {
      value = value.toLowerCase();
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) throw invalid('An email contact must be a bare address such as ann@example.com.');
    } else if (type === 'phone') {
      value = value.replace(/[\s\-.()]/g, '');
      if (!/^\+?\d{5,20}$/.test(value)) throw invalid('A phone contact must be 5–20 digits, with an optional leading +.');
    }
    if (!value) throw invalid('A contact needs a value.');
    if (out.some((x) => x.type === type && x.value === value)) throw invalid(`${type} ${value} is listed twice.`);
    const label = r?.label === undefined ? undefined : str(r.label, 'contact label', 0, 60)!.trim() || undefined;
    out.push({ type, value, ...(label && { label }), primary: r?.primary === true });
  }
  // One primary per type: the last one marked, else the first of the type.
  for (const type of new Set(out.map((x) => x.type))) {
    const same = out.filter((x) => x.type === type);
    const keep = same.filter((x) => x.primary).at(-1) ?? same[0]!;
    for (const x of same) x.primary = x === keep;
  }
  return out;
}

/** Validates POST and PATCH /customers fields; `existing` is the customer being changed. */
function applyCustomer(c: Ctx, cu: Partial<MockCustomer>, b: any, existing?: MockCustomer) {
  if (b.name !== undefined) cu.name = str(b.name, 'name', 0, 120)!.replace(/\s+/g, ' ').trim();
  if (b.contacts !== undefined) cu.contacts = contactsOf(b.contacts);
  if (b.metadata !== undefined) {
    if (!b.metadata || typeof b.metadata !== 'object' || Array.isArray(b.metadata)) throw invalid('metadata must be a JSON object.');
    if (JSON.stringify(b.metadata).length > 4096) throw invalid('metadata is at most 4 KB.');
    cu.metadata = b.metadata;
  }
  const next = { ...existing, ...cu };
  if (!next.name && !next.contacts?.length) throw invalid('A customer needs a name or at least one contact.');
  for (const k of next.contacts ?? []) {
    if (botCustomers(c).some((x) => x !== existing && x.contacts.some((y) => y.type === k.type && y.value === k.value))) {
      throw err(409, 'CUSTOMER_EXISTS', `The bot already has a customer with ${k.type} ${k.value}.`);
    }
  }
}

route('GET', '/customers', 'customers.read', (c) => {
  const s = (c.query.get('q') ?? '').trim().toLowerCase().slice(0, 100);
  const filtered = botCustomers(c)
    .filter((x) => !s || [x.name, ...x.contacts.map((k) => k.value)].some((f) => f.toLowerCase().startsWith(s) || f.toLowerCase().split(/\s+/).some((w) => w.startsWith(s))))
    .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at));
  const limit = Math.min(200, Math.max(1, Number(c.query.get('limit') ?? 50)));
  const start = Number(c.query.get('cursor') ?? 0);
  return {
    data: filtered.slice(start, start + limit).map((x) => customerOut(c.db, x)),
    next_cursor: start + limit < filtered.length ? String(start + limit) : undefined,
  };
});

route('POST', '/customers', 'customers.write', (c) => {
  const now = nowIso();
  const cu = { id: newId('cus'), tenant_id: c.tenant.id, bot_id: c.botId, name: '', contacts: [], metadata: {}, first_seen_at: now, last_seen_at: now, created_at: now, updated_at: now } as MockCustomer;
  applyCustomer(c, cu, c.body ?? {});
  c.db.customers.push(cu);
  return created(customerOut(c.db, cu));
});

route('GET', '/customers/:id', 'customers.read', (c) => {
  const cu = customerOf(c, c.params.id);
  const latest = <T extends { updated_at: string }>(rows: T[]) => rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 10);
  return {
    ...customerOut(c.db, cu),
    recent_conversations: latest(c.db.conversations.filter((x) => x.customer_id === cu.id)).map((x) => ({ id: x.id, created_at: x.created_at, updated_at: x.updated_at })),
    recent_tickets: latest(botTickets(c).filter((t) => t.customer_id === cu.id)).map((t) => ({ id: t.id, subject: t.subject, status: t.status, created_at: t.created_at, updated_at: t.updated_at })),
  };
});

route('PATCH', '/customers/:id', 'customers.write', (c) => {
  const cu = customerOf(c, c.params.id);
  const b = c.body ?? {};
  if (!['name', 'contacts', 'metadata'].some((k) => b[k] !== undefined)) throw invalid('Send at least one field to change.');
  const patch: Partial<MockCustomer> = {};
  applyCustomer(c, patch, b, cu);
  Object.assign(cu, patch, { updated_at: nowIso() });
  return customerOut(c.db, cu);
});

route('DELETE', '/customers/:id', 'customers.write', (c) => {
  const cu = customerOf(c, c.params.id);
  // Their conversations and tickets keep the customer_id.
  c.db.customers = c.db.customers.filter((x) => x !== cu);
  return noContent();
});

/* Workspace ---------------------------------------------------------- */

function workspaceOf(c: Ctx) {
  const ws = c.db.workspaces.find((w) => w.tenant_id === c.tenant.id && w.bot_id === c.botId);
  if (!ws) throw notFound('BOT_NOT_FOUND', 'Bot');
  return ws;
}

/** The system prompt is the platform's: businesses never see it. */
const publicBot = ({ promptTemplateId: _t, promptVariables: _v, prompt: _p, ...bot }: MockBotConfig): BotConfig => bot;

function workspaceOut(c: Ctx) {
  const ws = workspaceOf(c);
  const type = BUSINESS_TYPES.find((t) => t.id === c.tenant.business_type)!;
  return {
    name: ws.name,
    bot: publicBot(ws.bot),
    revision: ws.revision,
    updated_at: ws.updated_at,
    history: ws.history.slice(0, 30).map((v) => ({ ...v, bot: publicBot(v.bot) })),
    defaults: { name: type.assistant_name, bot: publicBot(defaultBot(c.db, c.tenant.business_type, type.assistant_name)) },
  };
}

route('GET', '/workspace', 'bot.read', workspaceOut);

route('PUT', '/workspace', 'bot.write', (c) => {
  const ws = workspaceOf(c);
  const { name, bot, revision } = c.body ?? {};
  if (revision !== ws.revision) throw err(409, 'WORKSPACE_CONFLICT', 'Someone saved this configuration since you loaded it.');
  str(name, 'name', 1, 80);
  if (!bot || typeof bot !== 'object') throw invalid('bot is required.');
  str(bot.name, 'bot.name', 1, 80);
  if (bot.temperature !== undefined && (bot.temperature < 0 || bot.temperature > 2)) throw invalid('temperature must be 0–2.');
  if (bot.topK !== undefined && (bot.topK < 1 || bot.topK > 20)) throw invalid('topK must be 1–20.');
  const model = bot.model ? c.db.models.find((m) => m.id === bot.model) : c.db.models.find((m) => m.is_default);
  if (bot.model && (!model || (model.status !== 'active' && bot.model !== ws.bot.model))) throw err(400, 'MODEL_NOT_ALLOWED', `${bot.model} isn't offered.`);
  if (bot.maxTokens !== undefined && (bot.maxTokens < 1 || bot.maxTokens > 32768)) throw invalid('maxTokens must be 1–32768.');
  if (bot.toolsEnabled && model && !model.supports_tools) throw err(400, 'MODEL_NOT_ALLOWED', `${model.label} can't call tools. Turn tools off or pick another model.`);
  if ((bot.tools ?? []).length > 20) throw invalid('At most 20 tools.');
  // Prompt fields in the request are ignored: the bot keeps its business type's prompt.
  const { promptTemplateId, promptVariables, prompt } = ws.bot;
  const next: MockBotConfig = { ...publicBot(bot), promptTemplateId, promptVariables, prompt };
  const changed = JSON.stringify(next) !== JSON.stringify(ws.bot);
  ws.name = name;
  ws.bot = next;
  ws.revision += 1;
  ws.updated_at = nowIso();
  if (changed) ws.history.unshift({ id: `ver_${hex(24)}`, savedAt: ws.updated_at, bot: next });
  const b = c.db.bots.find((x) => x.tenant_id === c.tenant.id && x.id === c.botId);
  if (b) b.name = name;
  return workspaceOut(c);
});

route('GET', '/models', 'bot.read', (c) => {
  const current = workspaceOf(c).bot.model;
  return {
    models: c.db.models
      .filter((m) => m.status === 'active' || m.id === current)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        id: m.id,
        label: m.label,
        description: m.description,
        // By OpenRouter's output price.
        tier: m.output_price_per_mtok >= 10 ? 'premium' : m.output_price_per_mtok >= 1 ? 'standard' : 'economy',
        input_price_per_mtok: pricing(m).billed_input_price_per_mtok,
        output_price_per_mtok: pricing(m).billed_output_price_per_mtok,
        currency: 'USD',
        context_tokens: m.context_tokens,
        max_output_tokens: m.max_output_tokens,
        supports_tools: m.supports_tools,
        is_default: m.is_default,
        offered: m.status === 'active',
      })),
  };
});

/* Knowledge ---------------------------------------------------------- */

const docOut = ({ tenant_id: _t, bot_id: _b, content: _c, sha256: _s, ...d }: MockDoc) => d;
const botDocs = (c: Ctx) => c.db.documents.filter((d) => d.tenant_id === c.tenant.id && d.bot_id === c.botId);
const ACCEPT = ['.md', '.markdown', '.txt', '.text', '.csv', '.json', '.html', '.htm', '.pdf', '.docx'];

function findDoc(c: Ctx) {
  const d = botDocs(c).find((x) => x.id === c.params.id);
  if (!d) throw notFound('DOCUMENT_NOT_FOUND', 'Document');
  return d;
}

function bumpKb(c: Ctx) {
  const b = c.db.bots.find((x) => x.tenant_id === c.tenant.id && x.id === c.botId);
  if (b) b.kb_version += 1;
}

route('GET', '/knowledge/documents', 'knowledge.read', (c) => {
  const q = (c.query.get('q') ?? '').toLowerCase();
  const status = c.query.get('status');
  const limit = Math.min(100, Math.max(1, Number(c.query.get('limit') ?? 50)));
  const all = botDocs(c).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const matched = all.filter((d) => (!q || `${d.title} ${d.source_name ?? ''}`.toLowerCase().includes(q)) && (!status || d.status === status));
  const start = Number(c.query.get('cursor') ?? 0);
  const page = matched.slice(start, start + limit);
  const counts: Record<string, number> = {};
  for (const d of all) counts[d.status] = (counts[d.status] ?? 0) + 1;
  return {
    data: page.map(docOut),
    next_cursor: start + limit < matched.length ? String(start + limit) : undefined,
    total: matched.length,
    counts,
    max_documents: limitsOf(c.tenant).documents_per_bot || 10000,
    max_file_bytes: 25 * 1024 * 1024,
    accept: ACCEPT,
  };
});

function articleFields(b: any, partial: boolean) {
  const out: Partial<MockDoc> = {};
  if (!partial || b.title !== undefined) out.title = str(b.title, 'title', 1, 160);
  if (!partial || b.content !== undefined) out.content = str(b.content, 'content', 1, 50000);
  for (const k of ['source_url', 'knowledge_base_id', 'locale', 'product', 'version', 'source_name'] as const) {
    if (b[k] !== undefined) {
      if (k === 'source_url' && b[k] && !/^https?:\/\//.test(b[k])) throw invalid('source_url must be an http(s) link.');
      (out as any)[k] = b[k] || undefined;
    }
  }
  return out;
}

function indexText(d: MockDoc) {
  const bytes = new TextEncoder().encode(d.content).length;
  d.byte_size = d.source_type === 'manual' ? bytes : d.byte_size;
  d.chunk_count = Math.max(1, Math.ceil(bytes / 600));
  d.embedded_count = d.chunk_count;
  d.token_count = Math.round(bytes / 4);
  d.status = 'indexed';
  d.error = undefined;
  d.indexed_at = nowIso();
  d.updated_at = d.indexed_at;
}

route('POST', '/knowledge/documents', 'knowledge.write', (c) => {
  const f = articleFields(c.body, false);
  const dup = botDocs(c).find((d) => d.content.trim() === f.content!.trim());
  if (dup) throw err(409, 'DUPLICATE_DOCUMENT', `This content is already in "${dup.title}".`, { document_id: dup.id });
  requireLimit(c.tenant, 'documents_per_bot', botDocs(c).length);
  const now = nowIso();
  const d: MockDoc = {
    id: newId('doc'),
    tenant_id: c.tenant.id,
    bot_id: c.botId,
    source_type: 'manual',
    byte_size: 0,
    status: 'processing',
    chunk_count: 0,
    embedded_count: 0,
    token_count: 0,
    created_at: now,
    updated_at: now,
    ...(f as any),
  };
  indexText(d);
  c.db.documents.push(d);
  bumpKb(c);
  return created(docOut(d));
});

route('GET', '/knowledge/documents/:id', 'knowledge.read', (c) => {
  const d = findDoc(c);
  return { ...docOut(d), content: d.content };
});

route('PUT', '/knowledge/documents/:id', 'knowledge.write', (c) => {
  const d = findDoc(c);
  if (d.status === 'processing' || d.status === 'pending_upload') throw err(409, 'DOCUMENT_BUSY', 'This document is still being processed.');
  const f = articleFields(c.body, true);
  if (f.content !== undefined) {
    const dup = botDocs(c).find((x) => x.id !== d.id && x.content.trim() === f.content!.trim());
    if (dup) throw err(409, 'DUPLICATE_DOCUMENT', `This content is already in "${dup.title}".`, { document_id: dup.id });
  }
  Object.assign(d, f);
  indexText(d);
  bumpKb(c);
  return { ...docOut(d), content: d.content };
});

route('DELETE', '/knowledge/documents/:id', 'knowledge.write', (c) => {
  const d = findDoc(c);
  c.db.documents = c.db.documents.filter((x) => x !== d);
  bumpKb(c);
  return noContent();
});

route('POST', '/knowledge/documents/:id/process', 'knowledge.write', (c) => {
  const d = findDoc(c);
  if (d.status === 'pending_upload') {
    if (!pendingObjects.has(d.id)) {
      d.status = 'failed';
      d.error = 'The file was never uploaded.';
      return docOut(d);
    }
    d.status = 'processing';
    d.chunk_count = Math.max(2, Math.ceil(d.byte_size / 2400));
    d.embedded_count = 0;
  }
  if (d.status !== 'processing') return docOut(d);
  d.embedded_count = Math.min(d.chunk_count, d.embedded_count + Math.max(1, Math.ceil(d.chunk_count / 3)));
  if (d.embedded_count >= d.chunk_count) {
    const text = pendingObjects.get(d.id);
    if (text !== undefined) {
      d.content = text || `# ${d.title}\n\n(Extracted text of ${d.source_name}.)`;
      pendingObjects.delete(d.id);
    }
    d.status = 'indexed';
    d.indexed_at = nowIso();
    d.token_count = Math.round(d.byte_size / 4.5);
    bumpKb(c);
  }
  d.updated_at = nowIso();
  return docOut(d);
});

route('POST', '/knowledge/documents/:id/reindex', 'knowledge.write', (c) => {
  const d = findDoc(c);
  if (c.query.get('extract') === 'true' && d.source_type === 'manual') throw invalid('extract applies to uploaded files only.');
  d.status = 'processing';
  d.error = undefined;
  d.chunk_count = Math.max(1, d.chunk_count || Math.ceil(d.byte_size / 2400));
  d.embedded_count = c.query.get('force') === 'true' ? 0 : Math.floor(d.chunk_count / 2);
  d.updated_at = nowIso();
  return docOut(d);
});

/** Text of files "uploaded" to mock storage, keyed by document ID, until processed. */
export const pendingObjects = new Map<string, string>();

route('POST', '/knowledge/uploads', 'knowledge.write', (c) => {
  const filename = str(c.body.filename, 'filename', 1, 260)!;
  if (filename.includes('/')) throw invalid('filename must not contain slashes.');
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (!ACCEPT.includes(ext)) throw invalid(`Files must end in ${ACCEPT.join(', ')}.`);
  const size = Number(c.body.size);
  const textual = ['.md', '.markdown', '.txt', '.text', '.csv', '.json'].includes(ext);
  if (!size || size > (textual ? 5 : 25) * 1024 * 1024) throw invalid(`size must be at most ${textual ? 5 : 25} MB for ${ext} files.`);
  if (!/^[0-9a-f]{64}$/.test(c.body.sha256 ?? '')) throw invalid('sha256 must be 64 lowercase hex characters.');
  const existing = botDocs(c).find((d) => d.sha256 === c.body.sha256);
  if (existing && existing.status !== 'pending_upload') throw err(409, 'DUPLICATE_DOCUMENT', `This file is already in "${existing.title}".`, { document_id: existing.id });
  requireLimit(c.tenant, 'documents_per_bot', botDocs(c).length);
  const now = nowIso();
  const d: MockDoc =
    existing ??
    ({
      id: newId('doc'),
      tenant_id: c.tenant.id,
      bot_id: c.botId,
      title: c.body.title || filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
      source_type: 'file',
      source_name: filename,
      mime_type: ext === '.pdf' ? 'application/pdf' : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain',
      byte_size: size,
      status: 'pending_upload',
      chunk_count: 0,
      embedded_count: 0,
      token_count: 0,
      created_at: now,
      updated_at: now,
      content: '',
      sha256: c.body.sha256,
      ...articleFields({ ...c.body, title: undefined, content: undefined, filename: undefined, size: undefined, sha256: undefined }, true),
    } as MockDoc);
  if (!existing) c.db.documents.push(d);
  return created({
    document: docOut(d),
    url: `mock://r2/${d.id}`,
    method: 'PUT',
    headers: { 'Content-Type': d.mime_type ?? 'application/octet-stream' },
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
});

route('POST', '/knowledge/search', 'knowledge.read', (c) => {
  const query = str(c.body.query, 'query', 1, 4000)!;
  const topK = Math.min(20, Math.max(1, Number(c.body.top_k ?? 4)));
  const t0 = performance.now();
  const { scored, selected } = retrieve(c.db, c.tenant.id, c.botId, query, topK);
  const candidates = scored.slice(0, Math.max(12, topK * 3));
  const r = rng(hashString(query));
  const hits: SearchHit[] = candidates.map((x, i) => {
    const sel = selected.includes(x);
    return {
      id: x.s.id,
      document_id: x.s.doc.id,
      title: x.s.doc.title,
      heading: x.s.heading,
      position: x.s.position,
      content: x.s.content.slice(0, 600),
      keyword_rank: x.score > 0 ? i + 1 : null,
      vector_rank: Math.max(1, i + 1 + Math.round((r() - 0.5) * 4)),
      vector_score: +(0.35 + x.score * 0.5 + r() * 0.08).toFixed(3),
      fused_score: +(0.01 + x.score * 0.03).toFixed(4),
      rerank_score: +(x.score * 0.9 + r() * 0.1).toFixed(3),
      selected: sel,
    };
  });
  const best = selected[0]?.score ?? 0;
  const ms = (n: number) => Math.round(n + r() * n * 0.6);
  return {
    result: {
      query,
      confidence: best >= 0.6 ? 'high' : best > 0.2 ? 'low' : 'none',
      passages: selected.map((x) => ({ id: x.s.id, document_id: x.s.doc.id, title: x.s.doc.title, section: x.s.heading, url: x.s.doc.source_url, content: x.s.content })),
      sources: selected.map((x) => ({ document_id: x.s.doc.id, title: x.s.doc.title })),
      context_tokens: selected.reduce((n, x) => n + Math.round(x.s.content.length / 4), 0),
      candidates: candidates.length,
      fallback: best <= 0.2,
      degraded: [],
    },
    hits,
    trace: {
      query,
      rewrite: tokens(query).join(' '),
      rewrite_ms: ms(90),
      embed_ms: ms(40),
      dense_ms: ms(55),
      lexical_ms: ms(12),
      load_ms: ms(18),
      rerank_ms: ms(120),
      retrieval_ms: ms(260),
      total_ms: Math.round(performance.now() - t0 + ms(330)),
    },
  };
});

/* Tools -------------------------------------------------------------- */

const toolOut = (t: MockDb['tools'][number]) => {
  const { id: _i, tenant_id: _t, disabled: _d, calls: _c, errors: _e, ...rest } = t;
  return { ...rest, available: !t.disabled, unavailable_reason: t.disabled ? 'Turned off by a platform admin.' : undefined };
};
const tenantTools = (c: Ctx) => c.db.tools.filter((t) => t.tenant_id === c.tenant.id);

function toolInput(c: Ctx, b: any) {
  const name = str(b.name, 'name', 1, 64)!;
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) throw err(400, 'INVALID_TOOL', 'name must match ^[a-z][a-z0-9_]{0,63}$.');
  const description = str(b.description, 'description', 1, 1000)!;
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(b.method)) throw err(400, 'INVALID_TOOL', 'method must be GET, POST, PUT, PATCH or DELETE.');
  const url = str(b.url, 'url', 1, 2000)!;
  if (!url.startsWith('https://')) throw err(400, 'INVALID_TOOL', 'url must be an https:// URL.');
  const parameters = b.parameters ?? { type: 'object', properties: {} };
  if (parameters.type !== 'object') throw err(400, 'INVALID_TOOL', 'parameters must be a JSON Schema with type: "object".');
  for (const ph of url.slice(url.indexOf('/', 8)).match(/\{([a-z_][a-z0-9_]*)\}/gi) ?? []) {
    const key = ph.slice(1, -1);
    if (!parameters.properties?.[key] || !(parameters.required ?? []).includes(key)) {
      throw err(400, 'INVALID_TOOL', `The URL placeholder {${key}} needs a required string or integer parameter named ${key}.`);
    }
  }
  void c;
  return { name, description, method: b.method, url, parameters, read_only: Boolean(b.read_only) };
}

route('GET', '/tools', 'tools.read', (c) => ({
  data: tenantTools(c).sort((a, b) => a.name.localeCompare(b.name)).map(toolOut),
  database_configured: true,
}));

route('POST', '/tools', 'tools.write', (c) => {
  const i = toolInput(c, c.body);
  if (tenantTools(c).some((t) => t.name === i.name)) throw err(409, 'TOOL_EXISTS', `A tool named ${i.name} exists.`);
  const now = nowIso();
  const t = { id: newId('tool'), tenant_id: c.tenant.id, name: i.name, description: i.description, parameters: i.parameters, read_only: i.read_only, available: true, disabled: false, calls: 0, errors: 0, api: { method: i.method, url: i.url, created_at: now, updated_at: now } };
  c.db.tools.push(t);
  return created(toolOut(t));
});

function findTool(c: Ctx) {
  const t = tenantTools(c).find((x) => x.name === c.params.name);
  if (!t) throw notFound('TOOL_NOT_FOUND', 'Tool');
  return t;
}

route('GET', '/tools/:name', 'tools.read', (c) => toolOut(findTool(c)));

route('PUT', '/tools/:name', 'tools.write', (c) => {
  const t = findTool(c);
  const i = toolInput(c, c.body);
  if (i.name !== t.name && tenantTools(c).some((x) => x.name === i.name)) throw err(409, 'TOOL_EXISTS', `A tool named ${i.name} exists.`);
  Object.assign(t, { name: i.name, description: i.description, parameters: i.parameters, read_only: i.read_only });
  t.api = { ...t.api, method: i.method, url: i.url, updated_at: nowIso() };
  return toolOut(t);
});

route('DELETE', '/tools/:name', 'tools.write', (c) => {
  const t = findTool(c);
  c.db.tools = c.db.tools.filter((x) => x !== t);
  return noContent();
});

function runTool(t: MockDb['tools'][number], args: Record<string, unknown>): ToolRun {
  const r = rng(hashString(JSON.stringify(args) + t.name));
  const fail = r() < 0.12;
  t.calls += 1;
  if (fail) t.errors += 1;
  const output = fail
    ? 'HTTP 502 from upstream: Bad Gateway'
    : t.name === 'lookup_order'
      ? JSON.stringify({ order_number: args.order_number ?? 'A-10482', status: 'in_transit', carrier: 'UPS', eta: new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10), items: [{ sku: 'CI-SKILLET-12', name: '12" cast iron skillet', qty: 1 }] }, null, 2)
      : t.name === 'service_status'
        ? JSON.stringify({ status: 'operational', incidents: [] }, null, 2)
        : JSON.stringify({ ok: true, received: args }, null, 2);
  return { name: t.name, arguments: args, status: fail ? 'error' : 'ok', output, latency_ms: Math.round(120 + r() * 600) };
}

route('POST', '/tools/:name/test', 'tools.write', (c) => {
  const t = findTool(c);
  if (t.disabled) throw err(400, 'TOOL_UNAVAILABLE', 'This tool was turned off by a platform admin.');
  return runTool(t, c.body?.arguments ?? {});
});

/* Tickets ------------------------------------------------------------ */

const botTickets = (c: Ctx) => c.db.tickets.filter((t) => t.tenant_id === c.tenant.id && t.bot_id === c.botId);

route('GET', '/tickets', 'tickets.read', (c) => {
  const q = c.query;
  const all = botTickets(c).map((t) => ticketOut(c.db, t));
  const counts = {
    all: all.length,
    open: all.filter((t) => t.status === 'open').length,
    needs_reply: all.filter((t) => t.flags.needs_reply).length,
    escalated: all.filter((t) => t.escalated).length,
    mine: all.filter((t) => t.status === 'open' && t.assignee_user_id === c.user.id).length,
    overdue: all.filter((t) => t.flags.overdue).length,
    unassigned: all.filter((t) => t.status === 'open' && t.flags.unassigned).length,
  };
  const view = q.get('view') ?? 'all';
  const status = statusParam(q);
  const flag = q.get('flag') as keyof Ticket['flags'] | null;
  const assignee = q.get('assignee');
  const s = (q.get('q') ?? '').trim().toLowerCase();
  const filtered = all
    .filter((t) =>
      view === 'open' ? t.status === 'open'
      : view === 'needs_reply' ? t.flags.needs_reply
      : view === 'escalated' ? t.escalated
      : view === 'mine' ? t.status === 'open' && t.assignee_user_id === c.user.id
      : true,
    )
    .filter((t) => !flag || t.flags[flag])
    .filter((t) => !assignee || (assignee === 'me' ? t.assignee_user_id === c.user.id : assignee === 'none' ? !t.assignee_user_id : t.assignee_user_id === assignee))
    .filter((t) => !status || t.status === status)
    .filter((t) => !q.get('priority') || t.priority === q.get('priority'))
    .filter((t) => !q.get('channel') || (q.get('channel') === 'none' ? !t.channel_id : t.channel_id === q.get('channel')))
    .filter((t) => !q.get('channel_type') || t.channel_type === q.get('channel_type'))
    .filter((t) => !q.get('customer') || t.customer_id === q.get('customer'))
    .filter((t) => !s || t.subject.toLowerCase().includes(s) || t.id === s || t.conversation_id === s)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const limit = Math.min(100, Math.max(1, Number(q.get('limit') ?? 50)));
  const start = Number(q.get('cursor') ?? 0);
  return {
    data: filtered.slice(start, start + limit).map(({ tenant_id: _t, bot_id: _b, ...t }: any) => t),
    counts,
    next_cursor: start + limit < filtered.length ? String(start + limit) : undefined,
  };
});

route('POST', '/tickets', 'tickets.write', (c) => {
  const b = c.body ?? {};
  let conv = undefined as MockDb['conversations'][number] | undefined;
  if (b.conversation_id) {
    conv = c.db.conversations.find((x) => x.id === b.conversation_id && x.tenant_id === c.tenant.id && x.bot_id === c.botId);
    if (!conv) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation');
    const open = botTickets(c).find((t) => t.conversation_id === conv!.id && t.status === 'open');
    if (open) throw err(409, 'TICKET_EXISTS', `This conversation already has open ticket ${open.id}. Close it first.`);
  } else {
    str(b.subject, 'subject', 1, 200);
  }
  if (b.priority && !['low', 'normal', 'high', 'urgent'].includes(b.priority)) throw invalid('Unknown priority.');
  const channelId = b.channel_id ? channelOf(c, b.channel_id).id : conv?.channel_id;
  const now = nowIso();
  const lastCustomer = conv?.messages.filter((m) => m.author === 'customer').at(-1);
  const t: MockTicket = {
    id: newId('tkt'),
    tenant_id: c.tenant.id,
    bot_id: c.botId,
    conversation_id: conv?.id,
    channel: conv?.channel,
    channel_id: channelId,
    subject: b.subject || conv?.title || 'Untitled',
    status: 'open',
    priority: b.priority ?? 'normal',
    escalated: Boolean(b.escalated),
    escalated_at: b.escalated ? now : undefined,
    source: 'dashboard',
    handed_off: false,
    last_customer_at: lastCustomer?.created_at,
    reopen_count: 0,
    created_at: now,
    updated_at: now,
  };
  if (conv) conv.status = 'open';
  c.db.tickets.push(t);
  emitTicket(c, t, 'ticket.created');
  return created(ticketOut(c.db, t));
});

route('GET', '/tickets/:id', 'tickets.read', (c) => {
  const t = findTicket(c);
  const conv = c.db.conversations.find((x) => x.id === t.conversation_id);
  const messages = (conv?.messages ?? []).slice(-200);
  const usage = messages.reduce(
    (u, m) => (m.usage ? { input_tokens: u.input_tokens + m.usage.input_tokens, output_tokens: u.output_tokens + m.usage.output_tokens, total_tokens: u.total_tokens + m.usage.total_tokens, cost: u.cost + m.usage.cost, replies: u.replies + 1 } : u),
    { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost: 0, replies: 0 },
  );
  const { tenant_id: _t, bot_id: _b, ...out } = ticketOut(c.db, t) as any;
  return { ...out, messages, replies: c.db.replies[t.id] ?? [], usage };
});

route('PATCH', '/tickets/:id', 'tickets.write', (c) => {
  const t = findTicket(c);
  const b = c.body ?? {};
  if (b.escalated !== undefined && b.status === 'closed') throw invalid("escalated can't be combined with closed.");
  if (b.subject !== undefined) t.subject = str(b.subject, 'subject', 1, 200)!;
  if (b.priority !== undefined) {
    if (!['low', 'normal', 'high', 'urgent'].includes(b.priority)) throw invalid('Unknown priority.');
    t.priority = b.priority;
  }
  if (b.status !== undefined) applyStatus(t, b.status);
  if (b.channel_id !== undefined && b.channel_id !== t.channel_id) {
    t.channel_id = b.channel_id === '' ? undefined : channelOf(c, b.channel_id).id;
    t.channel_name = undefined;
    t.channel_type = undefined;
  }
  if (b.assignee_user_id !== undefined) {
    if (b.assignee_user_id === '') {
      t.assignee_user_id = undefined;
      t.assignee_name = undefined;
    } else {
      const m = memberOf(c.db, c.tenant.id, b.assignee_user_id);
      if (!m || m.role === 'viewer') throw err(400, 'INVALID_ASSIGNEE', 'Assignees need the tickets.write permission (agent or above).');
      t.assignee_user_id = m.user_id;
      t.assignee_name = userById(c.db, m.user_id)?.name;
    }
  }
  if (b.escalated !== undefined) {
    if (b.escalated && t.status !== 'open') applyStatus(t, 'open');
    t.escalated = Boolean(b.escalated);
    t.escalated_at = t.escalated ? nowIso() : t.escalated_at;
  }
  t.updated_at = nowIso();
  emitTicket(c, t, 'ticket.updated');
  const { tenant_id: _t, bot_id: _b, ...out } = ticketOut(c.db, t) as any;
  return out;
});

route('DELETE', '/tickets/:id', 'tickets.delete', (c) => {
  const t = findTicket(c);
  c.db.tickets = c.db.tickets.filter((x) => x !== t);
  delete c.db.replies[t.id];
  emit(t.tenant_id, t.bot_id, 'ticket.updated', { ticket: { id: t.id }, deleted: true });
  return noContent();
});

route('POST', '/tickets/:id/replies', 'tickets.write', (c) => {
  const t = findTicket(c);
  const kind = c.body.kind === 'note' ? 'note' : 'reply';
  const content = str(c.body.content, 'content', 1, 8000)!;
  const now = nowIso();
  const reply: TicketReply = { id: newId('rpl'), kind, author: c.user.name, content, created_at: now };
  if (kind === 'reply') {
    const conv = c.db.conversations.find((x) => x.id === t.conversation_id);
    if (conv) {
      const msg: TicketMessage = { id: newId('msg'), role: 'assistant', content, author: 'agent', agent: c.user.name, created_at: now };
      conv.messages.push(msg);
      conv.updated_at = now;
      conv.status = 'open';
      reply.message_id = msg.id;
      emit(t.tenant_id, t.bot_id, 'message.created', { conversation_id: conv.id, ticket_id: t.id, message: msg });
    }
    t.last_agent_at = now;
    t.first_response_at ??= now;
    t.handed_off = false;
  }
  if (c.body.status) applyStatus(t, c.body.status);
  t.updated_at = now;
  (c.db.replies[t.id] ??= []).push(reply);
  emitTicket(c, t, 'ticket.updated');
  const { tenant_id: _t, bot_id: _b, ...ticket } = ticketOut(c.db, t) as any;
  return created({ reply, ticket });
});

route('POST', '/tickets/:id/summary', 'tickets.write', (c) => {
  const t = findTicket(c);
  const conv = c.db.conversations.find((x) => x.id === t.conversation_id);
  if (!t.conversation_id || !conv) throw err(400, 'NO_CONVERSATION', "This ticket wasn't opened from a conversation, so there's nothing to summarize.");
  const max = limitsOf(c.tenant).replies_per_month;
  if (max > 0 && c.tenant.replies_this_month >= max && c.tenant.balance <= 0) {
    throw err(429, 'PLAN_LIMIT_REACHED', "This month's AI replies are used up.", { limit: 'replies_per_month' });
  }

  const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  const customer = conv.messages.filter((m) => m.author === 'customer');
  const answered = conv.messages.filter((m) => m.author !== 'customer' && m.content).at(-1);
  const notes = (c.db.replies[t.id] ?? []).filter((r) => r.kind === 'note');
  const needs = !!t.last_customer_at && (!t.last_agent_at || t.last_customer_at > t.last_agent_at);
  const lines = [
    `- Issue: ${customer[0] ? clip(customer[0].content) : t.subject}`,
    customer.length > 1 && `- Latest from the customer: ${clip(customer.at(-1)!.content)}`,
    answered && `- Already answered (${answered.author === 'agent' ? answered.agent ?? 'team' : 'assistant'}): ${clip(answered.content)}`,
    notes.length > 0 && `- Team notes: ${notes.length}, latest from ${notes.at(-1)!.author}: ${clip(notes.at(-1)!.content, 100)}`,
    `- Still open: ${needs ? 'the customer is waiting for a reply.' : t.status === 'closed' ? 'nothing; the ticket is closed.' : 'no reply is owed right now.'}`,
  ].filter(Boolean);

  t.summary = lines.join('\n');
  t.summary_at = nowIso();
  // Billed like an AI reply; updated_at stays, so the ticket keeps its place in lists.
  c.tenant.replies_this_month += 1;
  c.tenant.tokens_this_month += 600 + conv.messages.reduce((n, m) => n + Math.ceil(m.content.length / 4), 0) + Math.ceil(t.summary.length / 4);
  emitTicket(c, t, 'ticket.updated');
  const { tenant_id: _t, bot_id: _b, ...out } = ticketOut(c.db, t) as any;
  return out;
});

route('GET', '/handoffs', 'tickets.read', (c) => ({
  data: c.db.conversations
    .filter((x) => x.tenant_id === c.tenant.id && x.bot_id === c.botId && x.status === 'handoff')
    .filter((x) => !botTickets(c).some((t) => t.conversation_id === x.id && t.status === 'open'))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 50)
    .map((x) => ({ conversation_id: x.id, channel: x.channel, title: x.title, updated_at: x.updated_at })),
}));

route('GET', '/realtime', 'tickets.read', (c) => ({
  url: 'mock://realtime',
  publishable_key: 'mock',
  bot_topic: topicFor(c.tenant.id, c.botId),
  events: ['message.created', 'ticket.created', 'ticket.updated', 'conversation.updated'],
}));

/* Webhook ------------------------------------------------------------ */

const hookKey = (c: Ctx) => wsKey(c.tenant.id, c.botId);
const hookOut = (w: MockDb['webhooks'][string], withSecret = false) => {
  const { secret, ...rest } = w;
  return withSecret ? { ...rest, secret } : rest;
};

route('GET', '/webhook', 'integrations.read', (c) => {
  const w = c.db.webhooks[hookKey(c)];
  if (!w) throw notFound('WEBHOOK_NOT_FOUND', 'Webhook');
  return hookOut(w);
});

route('PUT', '/webhook', 'integrations.write', (c) => {
  const url = str(c.body.url, 'url', 1, 2000)!;
  if (!/^https:\/\/[^/@#\s]+(\/[^#\s]*)?$/.test(url)) throw invalid('url must be https://, with no user name, password or #fragment.');
  const now = nowIso();
  const existing = c.db.webhooks[hookKey(c)];
  const secret = existing?.secret ?? `whsec_${hex(40)}`;
  const w = {
    url,
    enabled: c.body.enabled ?? true,
    secret,
    secret_hint: `whsec_…${secret.slice(-4)}`,
    events: ['message.created', 'ticket.updated'],
    last_delivery: existing?.last_delivery,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  c.db.webhooks[hookKey(c)] = w;
  audit(c, 'webhook.updated', c.botId, { url, enabled: w.enabled });
  return hookOut(w, !existing);
});

route('DELETE', '/webhook', 'integrations.write', (c) => {
  if (!c.db.webhooks[hookKey(c)]) throw notFound('WEBHOOK_NOT_FOUND', 'Webhook');
  delete c.db.webhooks[hookKey(c)];
  audit(c, 'webhook.deleted', c.botId);
  return noContent();
});

route('POST', '/webhook/secret', 'integrations.write', (c) => {
  const w = c.db.webhooks[hookKey(c)];
  if (!w) throw notFound('WEBHOOK_NOT_FOUND', 'Webhook');
  w.secret = `whsec_${hex(40)}`;
  w.secret_hint = `whsec_…${w.secret.slice(-4)}`;
  w.updated_at = nowIso();
  audit(c, 'webhook.secret_rotated', c.botId);
  return hookOut(w, true);
});

route('POST', '/webhook/test', 'integrations.write', (c) => {
  const w = c.db.webhooks[hookKey(c)];
  if (!w) throw notFound('WEBHOOK_NOT_FOUND', 'Webhook');
  const ok = !w.url.includes('fail');
  w.last_delivery = ok
    ? { event: 'ping', ok: true, status: 200, at: nowIso() }
    : { event: 'ping', ok: false, status: 503, error: 'Receiver answered 503 Service Unavailable', at: nowIso() };
  return w.last_delivery;
});

/* Stats -------------------------------------------------------------- */

route('GET', '/usage/summary', 'usage.read', (c): UsageSummary => {
  const { from, to, days } = rangeOf(c.query);
  const by_day = days.map((d) => usageDay(c.tenant.id, c.botId, d));
  const sum = (k: keyof UsageDay) => by_day.reduce((n, d) => n + (d[k] as number), 0);
  const requests = sum('requests');
  const r = rng(hashString(`${c.tenant.id}${c.botId}${from}${to}`));
  const ws = c.db.workspaces.find((w) => w.tenant_id === c.tenant.id && w.bot_id === c.botId);
  const mainModel = ws?.bot.model || 'google/gemini-3.1-flash-lite';
  const split = [0.82, 0.12, 0.06];
  const models = [mainModel, 'openai/gpt-5-mini', 'anthropic/claude-haiku-4.5'].filter((m, i, a) => a.indexOf(m) === i);
  const tools = c.db.tools.filter((t) => t.tenant_id === c.tenant.id && (ws?.bot.tools ?? []).includes(t.name));
  const toolCalls = Math.round(requests * 0.18);
  return {
    from,
    to,
    requests,
    input_tokens: sum('input_tokens'),
    output_tokens: sum('output_tokens'),
    total_tokens: sum('total_tokens'),
    estimated_cost: +sum('estimated_cost').toFixed(4),
    avg_latency_ms: Math.round(1150 + r() * 400),
    by_day,
    by_model: models.map((m, i) => ({
      model: m,
      requests: Math.round(requests * (split[i] ?? 0.05)),
      total_tokens: Math.round(sum('total_tokens') * (split[i] ?? 0.05)),
      estimated_cost: +(sum('estimated_cost') * (split[i] ?? 0.05) * (i === 0 ? 1 : 3)).toFixed(4),
      avg_latency_ms: Math.round(900 + i * 500 + r() * 300),
    })),
    tool_calls: {
      total: toolCalls,
      errors: Math.round(toolCalls * 0.03),
      avg_latency_ms: Math.round(380 + r() * 120),
      by_tool: tools.map((t, i) => ({ name: t.name, calls: Math.round(toolCalls * (i === 0 ? 0.7 : 0.3)), errors: Math.round(toolCalls * 0.015), avg_latency_ms: Math.round(300 + r() * 300) })),
    },
    rag: {
      requests: Math.round(requests * 0.93),
      no_answer_rate: 0.04 + r() * 0.03,
      handoff_rate: 0.07 + r() * 0.03,
      clarification_rate: 0.05 + r() * 0.02,
      cache_hit_rate: 0.21 + r() * 0.08,
      rewrite_rate: 0.38 + r() * 0.1,
      degraded_rate: 0.004,
      avg_latency_ms: Math.round(1250 + r() * 250),
      avg_retrieval_ms: Math.round(240 + r() * 90),
    },
  };
});

route('GET', '/stats/support', 'usage.read', (c): SupportStats => {
  const { from, to, days } = rangeOf(c.query);
  const scope = c.query.get('scope') === 'business' ? 'business' : 'bot';
  const bots = scope === 'business' ? c.db.bots.filter((b) => b.tenant_id === c.tenant.id).map((b) => b.id) : [c.botId];
  const tickets = c.db.tickets.filter((t) => t.tenant_id === c.tenant.id && bots.includes(t.bot_id));
  const inRange = (iso?: string) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const created_ = tickets.filter((t) => inRange(t.created_at));
  const by_day = days.map((date) => {
    const conv = bots.reduce((n, b) => n + Math.round(usageDay(c.tenant.id, b, date).requests / 3.2), 0);
    const dayTickets = tickets.filter((t) => t.created_at.slice(0, 10) === date);
    return {
      date,
      conversations: conv,
      tickets_created: dayTickets.length + Math.round(conv * 0.04),
      tickets_closed: tickets.filter((t) => t.closed_at?.slice(0, 10) === date).length + Math.round(conv * 0.035),
      ticket_cost: +(dayTickets.length * 0.0011 + conv * 0.00004).toFixed(4),
    };
  });
  const total = by_day.reduce((n, d) => n + d.conversations, 0);
  const handedOff = Math.round(total * 0.071);
  const escalated = Math.round(total * 0.032);
  const ticketsCreated = by_day.reduce((n, d) => n + d.tickets_created, 0);
  const closed = by_day.reduce((n, d) => n + d.tickets_closed, 0);
  const open = tickets.map((t) => ticketOut(c.db, t)).filter((t) => t.status === 'open');
  const count = <K extends string>(xs: K[]) => xs.reduce((o, k) => ((o[k] = (o[k] ?? 0) + 1), o), {} as Partial<Record<K, number>>);
  const costTotal = by_day.reduce((n, d) => n + d.ticket_cost, 0) + total * 0.0009;
  const r = rng(hashString(`${from}${to}${scope}`));
  return {
    from,
    to,
    scope,
    conversations: { total, ai_only: total - handedOff - escalated, handed_off: handedOff, escalated, deflection_rate: total ? (total - handedOff - escalated) / total : 0 },
    tickets: { created: ticketsCreated, closed, from_customer: Math.round(ticketsCreated * 0.78), reopened: Math.round(ticketsCreated * 0.04), reopen_rate: 0.04 },
    backlog: {
      total: open.length,
      overdue: open.filter((t) => t.flags.overdue).length,
      unassigned: open.filter((t) => t.flags.unassigned).length,
      by_status: count(open.map((t) => t.status)),
      by_priority: count(open.map((t) => t.priority)),
    },
    first_response: { count: created_.length + 40, avg_seconds: 2400 + r() * 1200, median_seconds: 1500 + r() * 600, p90_seconds: 9000 + r() * 4000 },
    resolution: { count: closed, avg_seconds: 30000 + r() * 9000, median_seconds: 16000 + r() * 6000, p90_seconds: 90000 + r() * 30000 },
    cost: { total: +costTotal.toFixed(4), per_ticket: ticketsCreated ? costTotal / ticketsCreated / 6 : 0, per_conversation: total ? costTotal / total : 0, per_ai_resolved: total ? (costTotal * 0.7) / Math.max(1, total - handedOff - escalated) : 0 },
    by_day,
  };
});

/* Playground --------------------------------------------------------- */

const pgKey = (c: Ctx) => wsKey(c.tenant.id, c.botId);

/* Billing ------------------------------------------------------------ */

route('GET', '/billing', 'usage.read', (c) => billingOf(c.tenant));

route('GET', '/billing/ledger', 'usage.read', (c) => {
  const before = c.query.get('before');
  const start = before ? Number(before) : 0;
  const page = c.tenant.ledger.slice(start, start + 50);
  return { data: page, next_before: start + 50 < c.tenant.ledger.length ? String(start + 50) : undefined };
});

route('GET', '/billing/token-addons/quote', 'usage.read', (c) => {
  const { addon, millions } = addonMillions(c.tenant, c.query.get('millions'));
  return quoteTokens(addon, millions);
});

route('POST', '/billing/token-addons', 'billing.write', (c) => {
  const { addon, millions } = addonMillions(c.tenant, c.body?.millions);
  const q = quoteTokens(addon, millions);
  if (c.tenant.balance < q.price) throw err(402, 'INSUFFICIENT_BALANCE', `The balance is ${c.tenant.balance.toFixed(2)} USD; ${millions}M tokens cost ${q.price.toFixed(2)} USD.`);
  const a: BillingAddon = { id: newId('add'), tokens: q.tokens, price: q.price, month: thisMonth(), actor: c.user.email, created_at: nowIso() };
  c.tenant.addons.unshift(a);
  ledgerEntry(c.tenant, { amount: -q.price, kind: 'token_addon', note: `${millions}M extra tokens`, actor: c.user.email, addon_id: a.id });
  audit(c, 'billing.token_addon', c.tenant.id, { millions, price: q.price });
  return created({ addon: a, billing: billingOf(c.tenant) });
});

route('GET', '/playground/conversations/current', 'playground.run', (c) => ({ conversation: c.db.playground[pgKey(c)] ?? null }));

route('POST', '/playground/conversations', 'playground.run', (c) => {
  const conv = { id: newId('conv'), created_at: nowIso(), messages: [] as PlaygroundMessage[] };
  c.db.playground[pgKey(c)] = conv;
  return created(conv);
});

route('POST', '/playground/run', 'playground.run', (c): PlaygroundRunResult => {
  const b = c.body ?? {};
  if (!b.max_output_tokens || b.max_output_tokens < 1 || b.max_output_tokens > 32768) throw invalid('max_output_tokens is required (1–32768).');
  const ws = workspaceOf(c);
  if (b.tools_enabled && !(b.tools ?? []).length) throw invalid('tools is required with tools_enabled.');
  const modelId = b.model || c.db.models.find((m) => m.is_default)!.id;
  const model = c.db.models.find((m) => m.id === modelId);
  if (!model) throw err(400, 'MODEL_NOT_ALLOWED', `${modelId} isn't offered.`);
  if (b.tools_enabled && !model.supports_tools) throw err(400, 'MODEL_NOT_ALLOWED', `${model.label} can't call tools.`);

  let conv = b.conversation_id ? c.db.playground[pgKey(c)] : undefined;
  if (b.conversation_id && conv?.id !== b.conversation_id) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation');
  let message: string = b.message ?? '';
  if (b.resend) {
    if (!conv) throw invalid('resend needs conversation_id.');
    const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) throw invalid('Nothing to resend.');
    message = lastUser.content;
    const idx = conv.messages.indexOf(lastUser);
    conv.messages = conv.messages.slice(0, idx + 1);
  } else {
    str(message, 'message', 1, 4000);
  }

  const r = rng(hashString(message + modelId + (b.temperature ?? '')));
  const lower = message.toLowerCase();
  const tool_calls: ToolRun[] = [];
  const allowed = b.tools_enabled ? (b.tools as string[]) : [];
  const orderMatch = message.match(/\b[A-Z]-\d{4,6}\b/i);
  if (allowed.includes('lookup_order') && (orderMatch || /\border\b/.test(lower))) {
    const t = c.db.tools.find((x) => x.tenant_id === c.tenant.id && x.name === 'lookup_order');
    if (t) tool_calls.push(runTool(t, { order_number: orderMatch?.[0]?.toUpperCase() ?? 'A-10482' }));
  }
  if (allowed.includes('service_status') && /(down|outage|status|slow)/.test(lower)) {
    const t = c.db.tools.find((x) => x.tenant_id === c.tenant.id && x.name === 'service_status');
    if (t) tool_calls.push(runTool(t, {}));
  }

  const rag = b.rag_enabled !== false;
  const { selected } = rag ? retrieve(c.db, c.tenant.id, c.botId, message, b.rag_top_k ?? 4) : { selected: [] };
  const sources: Source[] | null = rag ? selected.map((x) => ({ document_id: x.s.doc.id, title: x.s.doc.title, section: x.s.heading, url: x.s.doc.source_url, score: +(0.5 + x.score / 2).toFixed(2) })) : null;
  const tone = String(ws.bot.promptVariables?.tone ?? '');
  const warm = /warm|friendly/i.test(tone);

  let status: PlaygroundRunResult['status'] = 'answered';
  let output: string;
  const toolOk = tool_calls.find((t) => t.status === 'ok' && t.name === 'lookup_order');
  if (/\b(human|person|agent|someone real|manager)\b/.test(lower)) {
    status = 'handoff';
    output = `Of course — I've let the team know and someone will pick this up here shortly. Is there anything I can help with in the meantime?`;
  } else if (toolOk) {
    const o = JSON.parse(toolOk.output);
    output = `${warm ? 'Thanks for checking in! ' : ''}Order ${o.order_number} is on its way with ${o.carrier} and should arrive by ${o.eta}. It contains: ${o.items.map((i: any) => `${i.qty}× ${i.name}`).join(', ')}.`;
  } else if (tool_calls.some((t) => t.status === 'error')) {
    output = "I tried to look that up, but our order system didn't respond. Could you try again in a minute, or would you like me to bring in the team?";
  } else if (selected.length && selected[0]!.score >= 0.25) {
    const s = selected[0]!.s;
    const sentences = s.content.replace(/^- /gm, '').split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2).join(' ');
    output = `${warm ? 'Happy to help! ' : ''}${sentences}${selected.length > 1 ? ` You can find more in "${selected[1]!.s.doc.title}".` : ''}`;
  } else if (message.trim().split(/\s+/).length < 3) {
    status = 'clarification_required';
    output = `Could you tell me a bit more about what you need help with? For example an order number, or the product you're asking about.`;
  } else {
    status = 'no_answer';
    output = `I don't have that in my notes yet, so I don't want to guess. Would you like me to bring in someone from the team?`;
  }
  if (b.max_output_tokens < 40) output = output.split(' ').slice(0, Math.max(3, b.max_output_tokens)).join(' ') + '…';

  const usage = { input_tokens: 1400 + Math.floor(r() * 900) + selected.length * 220, output_tokens: Math.ceil(output.length / 4), total_tokens: 0, cost: 0 };
  usage.total_tokens = usage.input_tokens + usage.output_tokens;
  const billed = pricing(model);
  usage.cost = +((usage.input_tokens * billed.billed_input_price_per_mtok + usage.output_tokens * billed.billed_output_price_per_mtok) / 1e6).toFixed(6);
  const latency = Math.round(700 + r() * 900 + tool_calls.length * 350);
  const now = nowIso();
  const result: PlaygroundRunResult = {
    output,
    model: model.id,
    latency_ms: latency,
    finish_reason: b.max_output_tokens < 40 ? 'length' : 'stop',
    usage,
    tool_calls,
    status,
    sources,
    context_tokens: selected.reduce((n, x) => n + Math.round(x.s.content.length / 4), 0),
  };
  if (b.debug) {
    result.debug = {
      retrieval: { query: message, rewrite: tokens(message).join(' '), selected: selected.map((x) => ({ title: x.s.doc.title, section: x.s.heading, score: +x.score.toFixed(2) })) },
      temperature: b.temperature ?? null,
    };
  }

  if (conv) {
    const user: PlaygroundMessage = { id: newId('msg'), role: 'user', content: message, created_at: now };
    const reply: PlaygroundMessage = { id: newId('msg'), role: 'assistant', content: output, model: model.id, usage, status, sources, tool_calls, latency_ms: latency, created_at: now };
    if (!b.resend) conv.messages.push(user);
    conv.messages.push(reply);
    conv.updated_at = now;
    result.conversation_id = conv.id;
    result.user_message = user;
    result.reply = reply;
  }
  return result;
});

/* Platform ----------------------------------------------------------- */

route('GET', '/platform/overview', 'platform', ({ db }) => {
  const month = new Date().toISOString().slice(0, 7);
  const days = rangeOf(new URLSearchParams()).days;
  const by_day = days.map((date) => {
    const all = db.bots.map((b) => usageDay(b.tenant_id, b.id, date));
    return {
      date,
      requests: all.reduce((n, d) => n + d.requests, 0),
      input_tokens: all.reduce((n, d) => n + d.input_tokens, 0),
      output_tokens: all.reduce((n, d) => n + d.output_tokens, 0),
      total_tokens: all.reduce((n, d) => n + d.total_tokens, 0),
      estimated_cost: +all.reduce((n, d) => n + d.estimated_cost, 0).toFixed(4),
    };
  });
  const thisMonth = by_day.filter((d) => d.date.startsWith(month));
  const unresolved = db.tickets.map((t) => ticketOut(db, t)).filter((t) => t.status === 'open');
  return {
    businesses: db.tenants.filter((t) => !t.deleted_at).length,
    suspended_businesses: db.tenants.filter((t) => !t.deleted_at && t.status === 'suspended').length,
    deleted_businesses: db.tenants.filter((t) => t.deleted_at).length,
    users: db.users.length,
    platform_admins: db.users.filter((u) => u.platform_admin).length,
    bots: db.bots.length,
    conversations_this_month: Math.round(thisMonth.reduce((n, d) => n + d.requests, 0) / 3.2),
    open_tickets: unresolved.length,
    needs_reply: unresolved.filter((t) => t.flags.needs_reply).length,
    replies_this_month: db.tenants.reduce((n, t) => n + t.replies_this_month, 0),
    cost_this_month: +thisMonth.reduce((n, d) => n + d.estimated_cost, 0).toFixed(2),
    billed_this_month: +thisMonth.reduce((n, d) => n + d.estimated_cost * MOCK_MARKUP, 0).toFixed(2),
    by_day,
  };
});

route('GET', '/platform/tenants', 'platform', ({ db }) => ({
  data: [...db.tenants]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((t) => {
      const owner = db.memberships.find((m) => m.tenant_id === t.id && m.role === 'owner');
      return { ...businessOf(db, t), owner_email: owner ? userById(db, owner.user_id)?.email : '', first_bot: db.bots.find((b) => b.tenant_id === t.id)?.id ?? 'support' };
    }),
}));

/** A live business; deleted ones can't be changed until they are restored. */
function liveTenant(db: MockDb, id: string) {
  const t = db.tenants.find((x) => x.id === id && !x.deleted_at);
  if (!t) throw notFound('TENANT_NOT_FOUND', 'Business');
  return t;
}

route('PATCH', '/platform/tenants/:id', 'platform', (c) => {
  const t = liveTenant(c.db, c.params.id!);
  const b = c.body ?? {};
  if (b.plan !== undefined) {
    if (!PLANS.some((p) => p.id === b.plan)) throw invalid('Unknown plan.');
    audit({ ...c, tenant: t }, 'plan.changed', t.id, { from: t.plan, to: b.plan });
    t.plan = b.plan;
  }
  if (b.status !== undefined) {
    if (!['active', 'suspended'].includes(b.status)) throw invalid('status must be active or suspended.');
    audit({ ...c, tenant: t }, b.status === 'suspended' ? 'business.suspended' : 'business.reactivated', t.id);
    t.status = b.status;
  }
  if (b.limits !== undefined) {
    const out: Partial<Limits> = {};
    for (const [k, v] of Object.entries(b.limits)) {
      if (!['bots', 'documents_per_bot', 'members', 'replies_per_month', 'tokens_per_month'].includes(k)) throw invalid(`Unknown limit ${k}.`);
      const max = k === 'tokens_per_month' ? 100_000_000_000 : 10_000_000;
      if (typeof v !== 'number' || v < 0 || v > max) throw invalid(`${k} must be 0–${max.toLocaleString('en-US')}.`);
      (out as any)[k] = v;
    }
    t.limit_overrides = out;
    audit({ ...c, tenant: t }, 'limits.changed', t.id, out);
  }
  return businessOf(c.db, t);
});

route('GET', '/platform/tenants/:id/detail', 'platform', ({ db, params }) => {
  const t = liveTenant(db, params.id!);
  const month = new Date().toISOString().slice(0, 7);
  const monthDays = rangeOf(new URLSearchParams()).days.filter((d) => d.startsWith(month));
  return {
    members: db.memberships
      .filter((m) => m.tenant_id === t.id)
      .map((m) => {
        const u = userById(db, m.user_id)!;
        return { user_id: u.id, email: u.email, name: u.name, role: m.role, created_at: m.joined_at };
      }),
    bots: db.bots
      .filter((b) => b.tenant_id === t.id)
      .map((b) => {
        const ws = db.workspaces.find((w) => w.tenant_id === t.id && w.bot_id === b.id);
        const usage = monthDays.map((d) => usageDay(t.id, b.id, d));
        return {
          id: b.id,
          name: b.name,
          model: ws?.bot.model || db.models.find((m) => m.is_default)!.id,
          prompt_template_id: ws?.bot.promptTemplateId ?? '',
          own_prompt: Boolean(ws?.bot.prompt),
          saved: (ws?.revision ?? 0) > 0,
          documents: db.documents.filter((d) => d.tenant_id === t.id && d.bot_id === b.id).length,
          replies_this_month: usage.reduce((n, d) => n + d.requests, 0),
          cost_this_month: +usage.reduce((n, d) => n + d.estimated_cost, 0).toFixed(4),
          billed_this_month: +usage.reduce((n, d) => n + d.estimated_cost * MOCK_MARKUP, 0).toFixed(4),
        };
      }),
    open_tickets: db.tickets.filter((x) => x.tenant_id === t.id && x.status === 'open').length,
    balance: t.balance,
    audit: db.audit.filter((a) => a.tenant_id === t.id).slice(0, 20).map(({ id, actor, action, target, created_at }) => ({ id, actor, action, target, created_at })),
  };
});

route('POST', '/platform/tenants/:id/balance', 'platform', (c) => {
  const t = liveTenant(c.db, c.params.id!);
  const amount = c.body?.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000) throw invalid('amount must be a non-zero number, up to 1,000,000 either way.');
  const note = str(c.body?.note, 'note', 1, 200)!;
  if (t.balance + amount < 0) throw invalid(`A debit can't take the balance below zero; it is ${t.balance.toFixed(2)} USD.`);
  const entry = ledgerEntry(t, { amount: round(amount, 6), kind: amount > 0 ? 'credit' : 'debit', note, actor: c.user.email });
  audit({ ...c, tenant: t }, amount > 0 ? 'billing.credit' : 'billing.debit', t.id, { amount, note });
  return { entry, balance: t.balance };
});

/* Deleting and restoring ---------------------------------------------- */

const deletionOut = (d: MockDb['deletions'][number]) => ({ ...d, restorable: d.state === 'deleted' && new Date(d.restore_until).getTime() > Date.now() });

function deleteTenant(c: Ctx, t: MockTenant, reason: string, request?: DeletionRequest) {
  protect(t);
  if (t.deleted_at) throw err(409, 'TENANT_DELETED', 'This business is already deleted.');
  const now = nowIso();
  const owner = c.db.memberships.find((m) => m.tenant_id === t.id && m.role === 'owner');
  // Deleting approves a pending request too.
  const req = request ?? pendingRequest(c.db, t.id);
  if (req) Object.assign(req, { status: 'approved', reviewed_by: c.user.id, reviewed_at: now });
  t.deleted_at = now;
  const d: MockDb['deletions'][number] = {
    id: newId('del'),
    tenant_id: t.id,
    tenant_name: t.name,
    owner_email: owner ? (userById(c.db, owner.user_id)?.email ?? '') : '',
    reason: reason || req?.reason || '',
    ...(req ? { request_id: req.id } : {}),
    deleted_by: c.user.id,
    deleted_by_email: c.user.email,
    deleted_at: now,
    restore_until: new Date(Date.now() + RESTORE_DAYS * DAY).toISOString(),
    state: 'deleted',
  };
  c.db.deletions.unshift(d);
  audit({ ...c, tenant: t }, 'business.deleted', t.id, d.reason ? { reason: d.reason } : null);
  return deletionOut(d);
}

route('DELETE', '/platform/tenants/:id', 'platform', (c) => {
  const t = c.db.tenants.find((x) => x.id === c.params.id);
  if (!t) throw notFound('TENANT_NOT_FOUND', 'Business');
  return deleteTenant(c, t, reasonOf(c.body?.reason, 'reason'));
});

route('POST', '/platform/tenants/:id/restore', 'platform', (c) => {
  const t = c.db.tenants.find((x) => x.id === c.params.id && x.deleted_at);
  const d = c.db.deletions.find((x) => x.tenant_id === c.params.id && x.state === 'deleted');
  if (!t || !d) throw notFound('TENANT_NOT_FOUND', 'Deleted business');
  if (!deletionOut(d).restorable) throw err(410, 'RESTORE_EXPIRED', 'Deleted more than 30 days ago.');
  delete t.deleted_at;
  Object.assign(d, { state: 'restored', restored_at: nowIso(), restored_by: c.user.id });
  audit({ ...c, tenant: t }, 'business.restored', t.id);
  return businessOf(c.db, t);
});

route('GET', '/platform/deleted-tenants', 'platform', ({ db }) => ({
  data: [...db.deletions].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at)).map(deletionOut),
}));

route('GET', '/platform/deletion-requests', 'platform', ({ db, query }) => {
  const status = query.get('status') || 'pending';
  if (!['pending', 'approved', 'rejected', 'cancelled', 'all'].includes(status)) throw invalid('status must be pending, approved, rejected, cancelled or all.');
  return { data: db.deletionRequests.filter((r) => status === 'all' || r.status === status).sort((a, b) => b.created_at.localeCompare(a.created_at)) };
});

function pendingById(c: Ctx) {
  const r = c.db.deletionRequests.find((x) => x.id === c.params.id && x.status === 'pending');
  if (!r) throw notFound('DELETION_REQUEST_NOT_FOUND', 'Deletion request');
  return r;
}

route('POST', '/platform/deletion-requests/:id/approve', 'platform', (c) => {
  const r = pendingById(c);
  const t = c.db.tenants.find((x) => x.id === r.tenant_id);
  if (!t) throw notFound('TENANT_NOT_FOUND', 'Business');
  const note = reasonOf(c.body?.note, 'note');
  if (note) r.review_note = note;
  return deleteTenant(c, t, r.reason, r);
});

route('POST', '/platform/deletion-requests/:id/reject', 'platform', (c) => {
  const r = pendingById(c);
  const note = reasonOf(c.body?.note, 'note');
  Object.assign(r, { status: 'rejected', reviewed_by: c.user.id, reviewed_at: nowIso(), ...(note ? { review_note: note } : {}) });
  const t = c.db.tenants.find((x) => x.id === r.tenant_id);
  if (t) audit({ ...c, tenant: t }, 'business.deletion_rejected', t.id, note ? { note } : null);
  return r;
});

route('GET', '/platform/users', 'platform', ({ db, query }) => {
  const q = (query.get('q') ?? '').toLowerCase();
  return {
    data: db.users
      .filter((u) => !q || `${u.email} ${u.name}`.toLowerCase().includes(q))
      .sort((a, b) => (b.last_seen_at ?? '').localeCompare(a.last_seen_at ?? ''))
      .slice(0, 100)
      .map((u) => ({
        ...u,
        memberships: db.memberships.filter((m) => m.user_id === u.id && !db.tenants.find((t) => t.id === m.tenant_id)?.deleted_at).map((m) => ({ tenant_id: m.tenant_id, tenant_name: db.tenants.find((t) => t.id === m.tenant_id)?.name ?? m.tenant_id, role: m.role })),
      })),
  };
});

route('PATCH', '/platform/users/:id', 'platform', (c) => {
  const u = userById(c.db, c.params.id!);
  if (!u) throw notFound('USER_NOT_FOUND', 'User');
  if (u.id === c.user.id && c.body.platform_admin === false) throw err(409, 'OWN_ACCESS', "Admins can't revoke their own access.");
  u.platform_admin = Boolean(c.body.platform_admin);
  audit(c, u.platform_admin ? 'platform_admin.granted' : 'platform_admin.revoked', u.id, { email: u.email }, '_platform');
  return { id: u.id, platform_admin: u.platform_admin };
});

route('GET', '/platform/tickets', 'platform', ({ db, query }) => {
  const view = query.get('view') ?? 'all';
  const status = statusParam(query);
  const list = db.tickets
    .map((t) => ({ raw: t, t: ticketOut(db, t) }))
    .filter(({ raw }) => !query.get('tenant') || raw.tenant_id === query.get('tenant'))
    .filter(({ t }) => (view === 'open' ? t.status === 'open' : view === 'needs_reply' ? t.flags.needs_reply : view === 'escalated' ? t.escalated : true))
    .filter(({ t }) => !status || t.status === status)
    .filter(({ t }) => !query.get('priority') || t.priority === query.get('priority'))
    .filter(({ t }) => !query.get('channel_type') || t.channel_type === query.get('channel_type'))
    .sort((a, b) => b.t.updated_at.localeCompare(a.t.updated_at));
  const before = query.get('before');
  const start = before ? Number(before) : 0;
  const page = list.slice(start, start + 100);
  return {
    data: page.map(({ raw, t }) => ({
      id: t.id,
      tenant_id: raw.tenant_id,
      tenant_name: db.tenants.find((x) => x.id === raw.tenant_id)?.name ?? raw.tenant_id,
      bot_id: raw.bot_id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      source: t.source,
      channel_id: t.channel_id,
      channel_name: t.channel_name,
      channel_type: t.channel_type,
      escalated: t.escalated,
      needs_reply: t.needs_reply,
      handed_off: t.handed_off,
      created_at: t.created_at,
      updated_at: t.updated_at,
    })),
    next_before: start + 100 < list.length ? String(start + 100) : undefined,
  };
});

route('GET', '/platform/customers', 'platform', ({ db, query }) => {
  const s = (query.get('q') ?? '').trim().toLowerCase().slice(0, 100);
  const list = db.customers
    .filter((x) => !db.tenants.find((t) => t.id === x.tenant_id)?.deleted_at)
    .filter((x) => !query.get('tenant') || x.tenant_id === query.get('tenant'))
    .filter((x) => !s || [x.name, ...x.contacts.map((k) => k.value)].some((f) => f.toLowerCase().startsWith(s) || f.toLowerCase().split(/\s+/).some((w) => w.startsWith(s))))
    .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at));
  const start = Number(query.get('cursor') ?? 0);
  return {
    data: list.slice(start, start + 50).map((x) => ({ ...customerOut(db, x), tenant_name: db.tenants.find((t) => t.id === x.tenant_id)?.name ?? x.tenant_id })),
    next_cursor: start + 50 < list.length ? String(start + 50) : undefined,
  };
});

route('GET', '/platform/tools', 'platform', ({ db, query }) => ({
  data: db.tools
    .filter((t) => !query.get('tenant') || t.tenant_id === query.get('tenant'))
    .map((t) => ({
      id: t.id,
      tenant_id: t.tenant_id,
      tenant_name: db.tenants.find((x) => x.id === t.tenant_id)?.name ?? t.tenant_id,
      name: t.name,
      method: t.api.method,
      url: t.api.url,
      read_only: t.read_only,
      disabled: t.disabled,
      calls: t.calls,
      errors: t.errors,
      avg_latency_ms: 300 + (hashString(t.id) % 400),
      updated_at: t.api.updated_at,
    })),
}));

route('PATCH', '/platform/tools/:id', 'platform', (c) => {
  const t = c.db.tools.find((x) => x.id === c.params.id);
  if (!t) throw notFound('TOOL_NOT_FOUND', 'Tool');
  t.disabled = Boolean(c.body.disabled);
  audit({ ...c, tenant: c.db.tenants.find((x) => x.id === t.tenant_id)! }, t.disabled ? 'tool.disabled' : 'tool.enabled', t.name);
  return { id: t.id, disabled: t.disabled };
});

route('GET', '/platform/usage', 'platform', ({ db, query }) => {
  const { from, to, days } = rangeOf(query);
  const group = (query.get('group') ?? 'tenant') as 'tenant' | 'model' | 'day';
  const rows = new Map<string, { label: string; days: UsageDay[] }>();
  for (const b of db.bots) {
    const ws = db.workspaces.find((w) => w.tenant_id === b.tenant_id && w.bot_id === b.id);
    const model = ws?.bot.model || db.models.find((m) => m.is_default)!.id;
    for (const date of days) {
      const u = usageDay(b.tenant_id, b.id, date);
      const key = group === 'tenant' ? b.tenant_id : group === 'model' ? model : date;
      const label = group === 'tenant' ? (db.tenants.find((t) => t.id === b.tenant_id)?.name ?? key) : group === 'model' ? (db.models.find((m) => m.id === model)?.label ?? key) : date;
      if (!rows.has(key)) rows.set(key, { label, days: [] });
      rows.get(key)!.days.push(u);
    }
  }
  const data = [...rows.entries()].map(([key, { label, days: ds }]) => {
    const s = (k: keyof UsageDay) => ds.reduce((n, d) => n + (d[k] as number), 0);
    return {
      key,
      label,
      requests: s('requests'),
      input_tokens: s('input_tokens'),
      output_tokens: s('output_tokens'),
      cached_tokens: Math.round(s('input_tokens') * 0.22),
      total_tokens: s('total_tokens'),
      estimated_cost: +s('estimated_cost').toFixed(4),
      billed_cost: +(s('estimated_cost') * MOCK_MARKUP).toFixed(4),
      avg_latency_ms: 1100 + (hashString(key) % 500),
    };
  });
  data.sort((a, b) => (group === 'day' ? a.key.localeCompare(b.key) : b.estimated_cost - a.estimated_cost));
  return { from, to, group, data };
});

const modelBots = (db: MockDb, id: string) => db.workspaces.filter((w) => (w.bot.model || db.models.find((m) => m.is_default)?.id) === id).length;

const modelOut = (db: MockDb, m: MockModel) => ({ ...m, ...pricing(m), bots: modelBots(db, m.id) });

route('GET', '/platform/models', 'platform', ({ db }) => ({
  models: [...db.models].sort((a, b) => a.sort_order - b.sort_order).map((m) => modelOut(db, m)),
}));

/**
 * Stands in for https://openrouter.ai/api/v1/model/{id}. The mock can't call
 * OpenRouter synchronously, so it makes up stable prices from the ID.
 */
const OPENROUTER_LIST: Record<string, { label: string; input_price_per_mtok: number; output_price_per_mtok: number }> = {
  'google/gemini-3.1-flash-lite': { label: 'Gemini 3.1 Flash Lite', input_price_per_mtok: 0.1, output_price_per_mtok: 0.4 },
  'openai/gpt-5-mini': { label: 'GPT-5 mini', input_price_per_mtok: 0.25, output_price_per_mtok: 2 },
  'openai/gpt-4o': { label: 'GPT-4o', input_price_per_mtok: 2.5, output_price_per_mtok: 10 },
  'anthropic/claude-haiku-4.5': { label: 'Claude Haiku 4.5', input_price_per_mtok: 1, output_price_per_mtok: 5 },
  'anthropic/claude-sonnet-4.5': { label: 'Claude Sonnet 4.5', input_price_per_mtok: 3, output_price_per_mtok: 15 },
  'meta-llama/llama-4-maverick': { label: 'Llama 4 Maverick', input_price_per_mtok: 0.15, output_price_per_mtok: 0.6 },
  'deepseek/deepseek-v3.2': { label: 'DeepSeek V3.2', input_price_per_mtok: 0.27, output_price_per_mtok: 1.1 },
};

function openRouterModel(id: string) {
  if (/does-not-exist|unknown/i.test(id)) throw invalid(`OpenRouter has no model ${id}.`);
  const h = hashString(id);
  const input = [0.05, 0.1, 0.15, 0.25, 0.5, 1, 2.5, 3][h % 8]!;
  const listed = OPENROUTER_LIST[id] ?? {
    label: id.split('/').pop()!.replace(/[-_]/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()).slice(0, 80),
    input_price_per_mtok: input,
    output_price_per_mtok: round(input * [4, 5, 8][h % 3]!, 4),
  };
  return {
    ...listed,
    context_tokens: [128_000, 200_000, 1_000_000][h % 3]!,
    max_output_tokens: [8192, 16384, 32768][h % 3]!,
    supports_tools: h % 5 !== 0,
  };
}

function modelFields(b: any, existing?: MockModel) {
  const m = { ...(existing ?? {}), ...b } as MockModel;
  if (!existing && !/^[a-z0-9-]+\/[a-z0-9._:-]+$/i.test(m.id ?? '')) throw invalid('id must be an OpenRouter model ID such as vendor/model.');
  str(m.label, 'label', 1, 80);
  if ((m.description ?? '').length > 300) throw invalid('description is at most 300 characters.');
  for (const k of ['input_price_per_mtok', 'output_price_per_mtok'] as const) if (m[k] !== undefined && (m[k] < 0 || m[k] > 10000)) throw invalid(`${k} must be 0–10,000.`);
  for (const k of ['fee_percent', 'commission_percent'] as const) {
    const v = m[k];
    if (v != null && (typeof v !== 'number' || v < 0 || v > 1000)) throw invalid(`${k} must be 0–1,000, or null.`);
  }
  if (m.status && !['active', 'hidden', 'retired'].includes(m.status)) throw invalid('status must be active, hidden or retired.');
  if (m.is_default && (m.status ?? 'active') !== 'active') throw invalid('The default model must be active.');
  return m;
}

route('POST', '/platform/models', 'platform', ({ db, body }) => {
  if (db.models.some((m) => m.id === body.id)) throw invalid('A model with that id exists.');
  const now = nowIso();
  // Without both prices, read the model from OpenRouter and fill in what wasn't sent.
  const fromOpenRouter = body.input_price_per_mtok === undefined || body.output_price_per_mtok === undefined;
  const listed = fromOpenRouter && /^[a-z0-9-]+\/[a-z0-9._:-]+$/i.test(body.id ?? '') ? openRouterModel(body.id) : undefined;
  const m = modelFields({
    description: '',
    input_price_per_mtok: 0,
    output_price_per_mtok: 0,
    context_tokens: 0,
    max_output_tokens: 0,
    supports_tools: true,
    supports_prompt_cache: false,
    status: 'active',
    is_default: false,
    sort_order: 0,
    fee_percent: null,
    commission_percent: null,
    ...listed,
    ...body,
    ...(listed ? { input_price_per_mtok: listed.input_price_per_mtok, output_price_per_mtok: listed.output_price_per_mtok } : {}),
    pricing_synced_at: listed ? now : '',
    created_at: now,
    updated_at: now,
  });
  if (m.is_default) db.models.forEach((x) => (x.is_default = false));
  db.models.push(m);
  return created(modelOut(db, m));
});

function refreshPricing(m: MockModel) {
  const { input_price_per_mtok, output_price_per_mtok } = openRouterModel(m.id);
  const now = nowIso();
  Object.assign(m, { input_price_per_mtok, output_price_per_mtok, pricing_synced_at: now, updated_at: now });
}

route('POST', '/platform/models/refresh-pricing', 'platform', ({ db }) => {
  const models: ReturnType<typeof modelOut>[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const m of db.models.filter((x) => x.status !== 'retired')) {
    try {
      refreshPricing(m);
      models.push(modelOut(db, m));
    } catch (e) {
      failed.push({ id: m.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { models, failed };
});

route('POST', '/platform/models/:id/refresh-pricing', 'platform', ({ db, params }) => {
  const m = db.models.find((x) => x.id === params.id);
  if (!m) throw notFound('MODEL_NOT_FOUND', 'Model');
  refreshPricing(m);
  return modelOut(db, m);
});

route('PATCH', '/platform/models/:id', 'platform', ({ db, params, body }) => {
  const existing = db.models.find((m) => m.id === params.id);
  if (!existing) throw notFound('MODEL_NOT_FOUND', 'Model');
  const m = modelFields(body, existing);
  if (m.is_default && !existing.is_default) db.models.forEach((x) => (x.is_default = false));
  Object.assign(existing, m, { updated_at: nowIso() });
  if (existing.status === 'retired') {
    const def = db.models.find((x) => x.is_default)!;
    db.workspaces.forEach((w) => w.bot.model === existing.id && (w.bot.model = def.id));
  }
  return modelOut(db, existing);
});

const templateBots = (db: MockDb, id: string) => db.workspaces.filter((w) => w.bot.promptTemplateId === id).length;

route('GET', '/platform/prompt-templates', 'platform', ({ db }) => ({
  templates: db.templates.map((t) => ({ ...t, bots: templateBots(db, t.id) })),
  own_prompt_bots: db.workspaces.filter((w) => !w.bot.promptTemplateId && w.bot.prompt).length,
}));

function templateFields(b: any, existing?: MockDb['templates'][number]) {
  const t = { ...(existing ?? {}), ...b } as MockDb['templates'][number];
  str(t.name, 'name', 1, 80);
  str(t.body, 'body', 1, 20000);
  const vars = t.variables ?? [];
  if (vars.length > 20) throw invalid('At most 20 variables.');
  for (const v of vars) {
    if (!/^[a-z][a-z0-9_]*$/.test(v.key)) throw invalid(`Variable key "${v.key}" must be lowercase words with underscores.`);
    if (['business_name', 'assistant_name'].includes(v.key)) throw invalid(`${v.key} is built in; don't declare it.`);
    if (!v.label || v.label.length > 80) throw invalid(`Variable "${v.key}" needs a label of 1–80 characters.`);
    if (!(v.max_length >= 1 && v.max_length <= 2000)) throw invalid(`Variable "${v.key}" max_length must be 1–2000.`);
  }
  const declared = new Set([...vars.map((v) => v.key), 'business_name', 'assistant_name']);
  for (const m of t.body.matchAll(/\{\{[#/]?([a-z][a-z0-9_]*)\}\}/g)) {
    if (!declared.has(m[1]!)) throw invalid(`{{${m[1]}}} isn't a declared variable.`);
  }
  const opens = [...t.body.matchAll(/\{\{#([a-z0-9_]+)\}\}/g)].map((m) => m[1]);
  const closes = [...t.body.matchAll(/\{\{\/([a-z0-9_]+)\}\}/g)].map((m) => m[1]);
  if (opens.length !== closes.length || opens.some((k, i) => closes[i] !== k)) throw invalid('Every {{#key}} section must be closed by {{/key}}, without nesting.');
  if (t.is_default && ((t.status ?? 'active') !== 'active' || (t.business_types ?? []).length)) throw invalid('The default template must be active and offered to every type.');
  return t;
}

route('POST', '/platform/prompt-templates', 'platform', ({ db, body }) => {
  const now = nowIso();
  const t = templateFields({ description: '', variables: [], business_types: [], status: 'active', is_default: false, ...body, id: newId('tpl'), version: 1, created_at: now, updated_at: now });
  if (t.is_default) db.templates.forEach((x) => (x.is_default = false));
  db.templates.push(t);
  return created({ ...t, bots: 0 });
});

route('PATCH', '/platform/prompt-templates/:id', 'platform', ({ db, params, body }) => {
  const existing = db.templates.find((t) => t.id === params.id);
  if (!existing) throw notFound('TEMPLATE_NOT_FOUND', 'Template');
  const t = templateFields(body, existing);
  if (t.is_default && !existing.is_default) db.templates.forEach((x) => (x.is_default = false));
  const bumped = body.body !== undefined || body.variables !== undefined;
  Object.assign(existing, t, { updated_at: nowIso(), version: existing.version + (bumped ? 1 : 0) });
  return { ...existing, bots: templateBots(db, existing.id) };
});

/* Channel catalog and channels ----------------------------------------- */

const CHANNEL_TYPE_ID_RE = /^[a-z][a-z0-9_-]{1,31}$/;

const channelTypeOut = (db: MockDb, t: MockDb['channelTypes'][number]): PlatformChannelType => ({ ...t, channels: db.channels.filter((x) => x.type === t.id).length });

function applyChannelType(t: Partial<MockDb['channelTypes'][number]>, b: any) {
  if (b.label !== undefined) t.label = str(b.label, 'label', 1, 80)!;
  if (b.description !== undefined) t.description = str(b.description, 'description', 0, 300)!;
  if (b.icon !== undefined) t.icon = str(b.icon, 'icon', 0, 200)!;
  if (b.status !== undefined) {
    if (!['active', 'hidden'].includes(b.status)) throw invalid('status must be active or hidden.');
    t.status = b.status;
  }
  if (b.sort_order !== undefined) {
    if (!Number.isInteger(b.sort_order) || Math.abs(b.sort_order) > 10_000) throw invalid('sort_order must be a whole number from -10000 to 10000.');
    t.sort_order = b.sort_order;
  }
}

route('GET', '/platform/channel-types', 'platform', ({ db }) => ({
  data: [...db.channelTypes].sort((a, b) => a.sort_order - b.sort_order).map((t) => channelTypeOut(db, t)),
}));

route('POST', '/platform/channel-types', 'platform', ({ db, body }) => {
  const b = body ?? {};
  if (typeof b.id !== 'string' || !CHANNEL_TYPE_ID_RE.test(b.id)) throw invalid('id must be 2–32 lowercase letters, digits, - or _, starting with a letter.');
  if (b.label === undefined) throw invalid('label is required.');
  if (db.channelTypes.some((t) => t.id === b.id)) throw err(409, 'CHANNEL_TYPE_EXISTS', `Channel type ${b.id} exists.`);
  const now = nowIso();
  const t = { id: b.id, label: '', description: '', icon: '', status: 'active', sort_order: 0, created_at: now, updated_at: now } as MockDb['channelTypes'][number];
  applyChannelType(t, b);
  db.channelTypes.push(t);
  return created(channelTypeOut(db, t));
});

route('PATCH', '/platform/channel-types/:id', 'platform', ({ db, params, body }) => {
  const t = db.channelTypes.find((x) => x.id === params.id);
  if (!t) throw notFound('CHANNEL_TYPE_NOT_FOUND', 'Channel type');
  if (body?.id !== undefined && body.id !== t.id) throw invalid("id can't change.");
  applyChannelType(t, body ?? {});
  t.updated_at = nowIso();
  return channelTypeOut(db, t);
});

route('GET', '/platform/channels', 'platform', ({ db, query }) => {
  const status = query.get('status');
  if (status && !['active', 'disabled'].includes(status)) throw invalid('status must be active or disabled.');
  return {
    data: db.channels
      .filter((x) => !db.tenants.find((t) => t.id === x.tenant_id)?.deleted_at)
      .filter((x) => !query.get('tenant') || x.tenant_id === query.get('tenant'))
      .filter((x) => !query.get('type') || x.type === query.get('type'))
      .map((x) => ({ ...channelOut(db, x), tenant_name: db.tenants.find((t) => t.id === x.tenant_id)?.name ?? x.tenant_id }))
      .filter((x) => !status || (status === 'active' ? x.active : !x.active))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 500),
  };
});

route('PATCH', '/platform/channels/:id', 'platform', (c) => {
  const ch = c.db.channels.find((x) => x.id === c.params.id);
  if (!ch) throw notFound('CHANNEL_NOT_FOUND', 'Channel');
  if (typeof c.body?.disabled !== 'boolean') throw invalid('disabled must be true or false.');
  ch.disabled_by_platform = c.body.disabled;
  ch.updated_at = nowIso();
  audit({ ...c, tenant: c.db.tenants.find((x) => x.id === ch.tenant_id)! }, ch.disabled_by_platform ? 'channel.disabled' : 'channel.enabled', ch.id, { name: ch.name, by: 'platform' });
  return { ...channelOut(c.db, ch), tenant_name: c.db.tenants.find((t) => t.id === ch.tenant_id)?.name ?? ch.tenant_id };
});

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
}

export function dispatch(db: MockDb, req: MockRequest): { status: number; body: unknown } {
  const match = routes
    .map((r) => ({ r, m: r.method === req.method ? req.path.match(r.re) : null }))
    .find((x) => x.m);
  if (!match) {
    const exists = routes.some((r) => r.re.test(req.path));
    throw exists ? err(405, 'METHOD_NOT_ALLOWED', `${req.method} isn't supported here.`) : err(404, 'NOT_FOUND', 'No such route.');
  }
  const { r, m } = match;
  const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m![i + 1]!)]));

  const auth = req.headers.get('Authorization');
  const user = auth ? userById(db, db.currentUserId) : undefined;
  if (r.access !== 'public' && !user) throw err(401, 'UNAUTHORIZED', 'Sign in again.');

  const ctx = { db, user: user!, params, query: req.query, body: (req.body ?? {}) as any } as Ctx;

  if (r.access === 'platform' && !user!.platform_admin) throw err(403, 'FORBIDDEN', 'Platform admins only.');

  if (r.access !== 'public' && r.access !== 'account' && r.access !== 'platform') {
    const tenantId = req.headers.get('X-Truplexy-Tenant');
    const botId = req.headers.get('X-Truplexy-Bot');
    if (!tenantId || !botId) throw err(400, 'SCOPE_REQUIRED', 'Send X-Truplexy-Tenant and X-Truplexy-Bot.');
    if (!ID_RE.test(tenantId) || !ID_RE.test(botId)) throw err(400, 'INVALID_SCOPE', 'Malformed scope ID.');
    // Nobody reaches a deleted business, platform admins included.
    const tenant = db.tenants.find((t) => t.id === tenantId && !t.deleted_at);
    const membership = tenant ? memberOf(db, tenant.id, user!.id) : undefined;
    if (!tenant || (!membership && !user!.platform_admin)) throw err(404, 'TENANT_NOT_FOUND', 'Business not found.');
    if (tenant.status === 'suspended' && !user!.platform_admin) throw err(403, 'TENANT_SUSPENDED', 'This business is suspended.');
    if (!db.bots.some((b) => b.tenant_id === tenant.id && b.id === botId)) throw err(404, 'BOT_NOT_FOUND', 'Bot not found.');
    ctx.tenant = tenant;
    ctx.botId = botId;
    ctx.role = membership?.role ?? null;
    if (!permsFor(ctx.role, user!.platform_admin).has(r.access)) {
      throw err(403, 'FORBIDDEN', `Your role (${ctx.role ?? 'none'}) lacks ${r.access}.`);
    }
  }

  const out = r.fn(ctx) as any;
  if (req.method !== 'GET') saveDb(db);
  if (out && typeof out === 'object' && '__status' in out) return { status: out.__status, body: out.body };
  return { status: 200, body: out };
}

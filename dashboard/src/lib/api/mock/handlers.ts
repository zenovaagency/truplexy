/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ApiKey,
  DeletionRequest,
  Billing,
  BillingAddon,
  BillingInterval,
  BotConfig,
  Business,
  BusinessTypeId,
  Channel,
  ChannelWidget,
  Widget,
  WidgetSettings,
  CheckoutPlan,
  Customer,
  LedgerEntry,
  Limits,
  Permission,
  PerformanceStats,
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
  Tool,
  ToolRun,
  UsageDay,
  UsageSummary,
} from '@/lib/api/types';
import { quoteTokens } from '@/lib/billing';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '@/lib/permissions';
import { emit, topicFor } from './bus';
import { hex, newId, nowIso, saveDb, wsKey, type MockBotConfig, type MockChannel, type MockCustomer, type MockDb, type MockDoc, type MockModel, type MockSuggestion, type MockTenant, type MockTicket, type MockUser } from './db';
import { BUSINESS_TYPES, PLANS, hashString, rng } from './fixtures';
import { buildPerformance, performanceMode } from './performance';
import { PRESETS, PROPERTY_ENTITIES, PropertyError, applyValues, changeDefinition, matchesFilters, newDefinition, visibleValues, type MockProperty } from './properties';
import { readCsv, sampleDrafts, type MockImport, type MockProduct } from './products';
import { isLink, parsePrice } from '@/lib/products';
import { WIDGET_DEFAULTS, widgetErrors } from '@/lib/widget';
import { QUERY_PRESETS, type MockQuery, type MockQueryType } from './queries';
import type { CustomerQuery, QueryType } from '@/lib/api/types';

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
const DEFAULT_QUERY_STATUSES: MockQueryType['statuses'] = [
  { key: 'new', label: 'New', category: 'open' },
  { key: 'in_progress', label: 'In progress', category: 'open' },
  { key: 'waiting_customer', label: 'Waiting on customer', category: 'pending' },
  { key: 'resolved', label: 'Resolved', category: 'done' },
  { key: 'rejected', label: 'Rejected', category: 'done' },
];
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

/** Web search by plan: plans don't list it, so the mock decides (Free has none). */
const WEB_SEARCHES: Record<string, number> = { starter: 500, pro: 3000 };

function limitsOf(t: MockTenant): Limits {
  const plan = PLANS.find((p) => p.id === t.plan) ?? PLANS[0]!;
  return { ...plan.limits, web_search: t.plan !== 'free', web_searches_per_month: WEB_SEARCHES[t.plan] ?? 0, image_input: t.plan !== 'free', ...t.limit_overrides };
}

const MAX_AUTO_CLOSE = 2160;

/** 0–2160 hours, or null where `nullable`. */
function autoCloseHours(v: unknown, field: string, nullable: boolean): number | null {
  if (v === null && nullable) return null;
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > MAX_AUTO_CLOSE) throw invalid(`${field} must be 0–${MAX_AUTO_CLOSE}${nullable ? ' or null' : ''}.`);
  return v as number;
}

/** The inactivity time a channel's tickets close after: its own, else its type's, else the business's. */
function effectiveAutoClose(db: MockDb, tenant: MockTenant, ch?: MockChannel): number {
  if (ch && ch.auto_close_hours !== undefined && ch.auto_close_hours !== null) return ch.auto_close_hours;
  const type = ch && db.channelTypes.find((t) => t.id === ch.type);
  if (type && type.auto_close_hours !== undefined && type.auto_close_hours !== null) return type.auto_close_hours;
  return tenant.auto_close_hours ?? 0;
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
    auto_close_hours: t.auto_close_hours ?? 0,
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

function requireLimit(t: MockTenant, key: Exclude<keyof Limits, 'web_search' | 'image_input'>, used: number) {
  const max = limitsOf(t)[key] ?? 0;
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
  // Closes after the inactivity time, unless kept open or waiting on the team.
  const closeAfter = effectiveAutoClose(db, tenant, ch);
  const waitingOnTeam = (t.escalated || t.handed_off) && needs;
  const lastActivity = Math.max(...[t.updated_at, t.last_customer_at, t.last_agent_at].filter(Boolean).map((d) => new Date(d!).getTime()));
  const autoCloseAt = !done && !t.keep_open && !waitingOnTeam && closeAfter > 0 ? new Date(lastActivity + closeAfter * 3_600_000).toISOString() : undefined;
  return {
    ...t,
    keep_open: t.keep_open ?? false,
    auto_close_at: autoCloseAt,
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

/** The notice the real API adds to a conversation that changes hands: a line the customer and the team both see. */
function addNotice(c: Ctx, t: MockTicket, kind: 'joined' | 'handed_back') {
  const conv = c.db.conversations.find((x) => x.id === t.conversation_id);
  if (!conv) return;
  const name = c.user.name;
  const content = kind === 'joined' ? `${name} has joined and will reply here.` : `${name} has handed the conversation back to the assistant.`;
  const now = nowIso();
  conv.messages.push({ id: newId('msg'), role: 'assistant', content, author: 'system', agent: name, created_at: now });
  conv.updated_at = now;
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
    webSearch: { enabled: false, mode: 'fallback' as const, maxResults: 3, depth: 'basic' as const, topic: 'general' as const, timeRange: '' as const, includeDomains: [], excludeDomains: [] },
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
  if (b.auto_close_hours !== undefined) c.tenant.auto_close_hours = autoCloseHours(b.auto_close_hours, 'auto_close_hours', false)!;
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
    auto_close_hours: ch.auto_close_hours ?? null,
    effective_auto_close_hours: effectiveAutoClose(db, db.tenants.find((t) => t.id === ch.tenant_id)!, ch),
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
    const type = offeredType(c.db, b.type);
    if (!type) throw err(400, 'CHANNEL_TYPE_NOT_ALLOWED', `Channel type ${b.type} isn't offered.`);
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
  if (b.auto_close_hours !== undefined) ch.auto_close_hours = autoCloseHours(b.auto_close_hours, 'auto_close_hours', true);
}

route('GET', '/channel-types', 'channels.read', (c) => {
  const used = new Set(botChannels(c).map((x) => x.type));
  return {
    data: c.db.channelTypes
      .filter((t) => t.status === 'active' || t.status === 'upcoming' || used.has(t.id))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => ({ id: t.id, label: t.label, description: t.description, icon: t.icon, offered: t.status === 'active', upcoming: t.status === 'upcoming' })),
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
  audit(c, 'channel.create', ch.id, { name: ch.name, type: ch.type });
  return created(channelOut(c.db, ch));
});

/**
 * The store a connect names, as the API accepts it: your-store,
 * your-store.myshopify.com or https://admin.shopify.com/store/your-store.
 */
function shopifyStore(v: unknown) {
  const raw = (str(v, 'account', 1, 200) ?? '').trim().toLowerCase();
  const admin = /^https:\/\/admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)\/?$/.exec(raw);
  const handle = admin ? admin[1]! : raw.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\.myshopify\.com$/, '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) throw invalid("Set account to your store's address, such as your-store.myshopify.com.");
  return handle;
}

/** The store a WooCommerce connect names: its https address, as the API accepts it. */
function wooSite(v: unknown) {
  const raw = (str(v, 'account', 1, 200) ?? '').trim().toLowerCase().replace(/\/+$/, '');
  const host = raw.replace(/^https:\/\//, '');
  if (/^http:\/\//.test(raw) || !/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.[a-z]{2,}(\/[a-z0-9._~-]+){0,4}$/.test(host)) {
    throw invalid("Set account to your store's https address, such as https://shop.example.com.");
  }
  return host;
}

/**
 * Connects a WooCommerce store. The real API sends the person to the store's own approval page
 * and finishes on its callback; the demo skips the store and answers the return_to page with the
 * store already connected (or with the demo error named by the address's first label).
 */
function connectWooCommerce(c: Ctx, b: any) {
  if (b.account === undefined) throw invalid('account is required.');
  const host = wooSite(b.account);
  let back: URL;
  try {
    back = new URL(str(b.return_to, 'return_to', 1, 2000)!);
  } catch {
    throw invalid('return_to must be a dashboard page.');
  }
  if (back.origin !== window.location.origin) throw invalid('return_to must be a dashboard page.');
  const site = `https://${host}`;
  audit(c, 'channel.connect_started', site, { name: site, type: 'woocommerce' });

  back.searchParams.set('type', 'woocommerce');
  const demoError = DEMO_CONNECT_ERRORS[host.split('.')[0]!];
  const elsewhere = c.db.channels.some((x) => x.type === 'woocommerce' && x.external_id === site && x.tenant_id !== c.tenant.id);
  if (demoError || elsewhere) {
    back.searchParams.set('connect_error', demoError ?? 'store_connected_elsewhere');
    return { url: back.toString() };
  }

  const now = nowIso();
  let ch = botChannels(c).find((x) => x.type === 'woocommerce' && x.external_id === site);
  if (ch) Object.assign(ch, { enabled: true, updated_at: now });
  else {
    const store = host.split('.')[0]!.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
    const taken = new Set(botChannels(c).map((x) => x.name.toLowerCase()));
    let name = store;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${store} ${n}`;
    ch = { id: newId('chn'), tenant_id: c.tenant.id, bot_id: c.botId, type: 'woocommerce', name, description: '', external_id: site, enabled: true, disabled_by_platform: false, created_at: now, updated_at: now };
    c.db.channels.push(ch);
  }
  audit(c, 'channel.connect', ch.id, { name: ch.name, type: 'woocommerce', site });
  back.searchParams.set('connected', 'woocommerce');
  back.searchParams.set('channel_id', ch.id);
  return { url: back.toString() };
}

/** Demo stores that come back from "Shopify" with each connect_error, to try the flow by hand. */
const DEMO_CONNECT_ERRORS: Record<string, string> = {
  denied: 'denied',
  expired: 'expired',
  invalid: 'invalid',
  elsewhere: 'store_connected_elsewhere',
  'scopes-missing': 'scopes_missing',
  failed: 'failed',
};

/**
 * Starts Shopify's install. The real API answers Shopify's install page and
 * finishes on its own callback; the demo skips Shopify and answers the
 * return_to page with the store already connected (or with the demo error).
 */
route('POST', '/channels/connect', 'channels.write', (c) => {
  const b = c.body ?? {};
  if (b.type === undefined) throw invalid('type is required.');
  if (b.type !== 'shopify' && b.type !== 'woocommerce') {
    if (c.db.channelTypes.some((t) => t.id === b.type)) throw err(400, 'CHANNEL_CONNECT_UNSUPPORTED', `${b.type} channels are added with POST /channels.`);
    throw invalid('type must be shopify or woocommerce.');
  }
  const type = offeredType(c.db, b.type);
  if (!type) throw err(400, 'CHANNEL_TYPE_NOT_ALLOWED', `${b.type === 'shopify' ? 'Shopify' : 'WooCommerce'} isn't offered for this bot.`);
  if (b.type === 'woocommerce') return connectWooCommerce(c, b);
  if (b.account === undefined) throw invalid('account is required.');
  const handle = shopifyStore(b.account);
  let back: URL;
  try {
    back = new URL(str(b.return_to, 'return_to', 1, 2000)!);
  } catch {
    throw invalid('return_to must be a dashboard page.');
  }
  if (back.origin !== window.location.origin) throw invalid('return_to must be a dashboard page.');
  const shop = `${handle}.myshopify.com`;
  audit(c, 'channel.connect_started', shop, { name: shop, type: 'shopify' });

  back.searchParams.set('type', 'shopify');
  const demoError = DEMO_CONNECT_ERRORS[handle];
  const elsewhere = c.db.channels.some((x) => x.type === 'shopify' && x.external_id === shop && x.tenant_id !== c.tenant.id);
  if (demoError || elsewhere) {
    back.searchParams.set('connect_error', demoError ?? 'store_connected_elsewhere');
    return { url: back.toString() };
  }

  const now = nowIso();
  // Connecting a store the bot already has turns its channel back on.
  let ch = botChannels(c).find((x) => x.type === 'shopify' && x.external_id === shop);
  if (ch) Object.assign(ch, { enabled: true, updated_at: now });
  else {
    const store = handle.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
    const taken = new Set(botChannels(c).map((x) => x.name.toLowerCase()));
    let name = store;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${store} ${n}`;
    ch = { id: newId('chn'), tenant_id: c.tenant.id, bot_id: c.botId, type: 'shopify', name, description: '', external_id: shop, enabled: true, disabled_by_platform: false, created_at: now, updated_at: now };
    c.db.channels.push(ch);
  }
  audit(c, 'channel.connect', ch.id, { name: ch.name, type: 'shopify', shop });
  back.searchParams.set('connected', 'shopify');
  back.searchParams.set('channel_id', ch.id);
  return { url: back.toString() };
});

route('GET', '/channels/:id', 'channels.read', (c) => channelOut(c.db, channelOf(c, c.params.id)));

route('PATCH', '/channels/:id', 'channels.write', (c) => {
  const ch = channelOf(c, c.params.id);
  applyChannel(c, ch, c.body ?? {}, ch);
  ch.updated_at = nowIso();
  audit(c, 'channel.update', ch.id, { name: ch.name });
  return channelOut(c.db, ch);
});

/* A Shopify store's chat window: shown or hidden. The demo has no storefront, so a store "sees" it a few seconds after the window is first read. */
const WIDGET_SEEN_AFTER_MS = 8_000;

function channelWidgetOut(c: Ctx, ch: MockChannel): ChannelWidget {
  if (ch.type !== 'shopify') throw err(409, 'WIDGET_NOT_SUPPORTED', 'Only Shopify channels have a store to show the chat window on.');
  c.db.channelWidgets ??= {};
  const saved = (c.db.channelWidgets[ch.id] ??= { enabled: true, saved_at: Date.now() });
  const seen = Date.now() - saved.saved_at >= WIDGET_SEEN_AFTER_MS ? new Date(saved.saved_at + WIDGET_SEEN_AFTER_MS).toISOString() : '';
  return {
    channel_id: ch.id,
    enabled: saved.enabled,
    first_seen_at: seen,
    last_seen_at: seen,
    shop: ch.external_id,
    activation_url: `https://${ch.external_id}/admin/themes/current/editor?context=apps&activateAppId=demo-app/chat-embed`,
  };
}

route('GET', '/channels/:id/widget', 'channels.read', (c) => channelWidgetOut(c, channelOf(c, c.params.id)));

route('PUT', '/channels/:id/widget', 'channels.write', (c) => {
  const ch = channelOf(c, c.params.id);
  channelWidgetOut(c, ch);
  const b = c.body ?? {};
  if (typeof b.enabled !== 'boolean' || Object.keys(b).some((k) => k !== 'enabled')) throw invalid('Send {"enabled": true}.');
  c.db.channelWidgets![ch.id]!.enabled = b.enabled;
  audit(c, 'channel.widget_update', ch.id, { name: ch.name });
  return channelWidgetOut(c, ch);
});

/* The bot's chat widget: one look for every place the chat is shown. */
const widgetKey = (c: Ctx) => `${c.tenant.id}/${c.botId}`;

function widgetOut(c: Ctx): Widget {
  const saved = c.db.botWidgets?.[widgetKey(c)];
  return { settings: { ...(saved?.settings ?? WIDGET_DEFAULTS) }, defaults: { ...WIDGET_DEFAULTS }, picture_url: saved?.picture_url ?? '' };
}

function saveWidget(c: Ctx, change: Partial<{ settings: WidgetSettings; picture_url: string }>) {
  c.db.botWidgets ??= {};
  const key = widgetKey(c);
  const current = c.db.botWidgets[key] ?? { settings: { ...WIDGET_DEFAULTS }, picture_url: '' };
  c.db.botWidgets[key] = { settings: change.settings ?? current.settings, picture_url: change.picture_url ?? current.picture_url };
}

route('GET', '/widget', 'bot.read', (c) => widgetOut(c));

route('PUT', '/widget', 'bot.write', (c) => {
  const s = (c.body ?? {}).settings;
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw invalid('Send settings as an object.');
  const unknown = Object.keys(s).find((k) => !Object.keys(WIDGET_DEFAULTS).includes(k));
  if (unknown) throw invalid(`Unknown setting ${unknown}.`);
  const next: WidgetSettings = { ...WIDGET_DEFAULTS, ...s };
  for (const k of ['heading', 'subtitle', 'greeting', 'placeholder', 'accent'] as const) if (typeof next[k] !== 'string') throw invalid(`${k} must be text.`);
  if (!['light', 'dark', 'auto'].includes(next.theme)) throw invalid('Set theme to light, dark or auto.');
  if (!['right', 'left'].includes(next.position)) throw invalid('Set position to right or left.');
  if (!['ask', 'off'].includes(next.details)) throw invalid('Set details to ask or off.');
  const problem = Object.values(widgetErrors(next))[0];
  if (problem) throw invalid(problem);
  saveWidget(c, { settings: { ...next, accent: next.accent.trim().toLowerCase() } });
  audit(c, 'bot.widget_update', c.botId);
  return widgetOut(c);
});

route('PUT', '/widget/picture', 'bot.write', (c) => {
  const url = pictureOf(c);
  saveWidget(c, { picture_url: url });
  audit(c, 'bot.widget_picture_updated', c.botId);
  return { picture_url: url };
});

route('DELETE', '/widget/picture', 'bot.write', (c) => {
  saveWidget(c, { picture_url: '' });
  audit(c, 'bot.widget_picture_removed', c.botId);
  return { picture_url: null };
});

route('DELETE', '/channels/:id', 'channels.write', (c) => {
  const ch = channelOf(c, c.params.id);
  const keys = c.db.apiKeys.filter((k) => k.channel_id === ch.id && k.status === 'active').length;
  if (keys) throw err(409, 'CHANNEL_IN_USE', `${keys} active chat API key${keys === 1 ? ' is' : 's are'} bound to this channel. Revoke them first.`);
  // Its tickets keep its name and type.
  const label = c.db.channelTypes.find((t) => t.id === ch.type)?.label;
  for (const t of c.db.tickets) if (t.channel_id === ch.id) Object.assign(t, { channel_name: ch.name, channel_type: ch.type });
  c.db.channels = c.db.channels.filter((x) => x !== ch);
  audit(c, 'channel.delete', ch.id, { name: ch.name, type: label ?? ch.type });
  return noContent();
});

/* Customers ------------------------------------------------------------ */

/** A customer as a member of the business sees it: sensitive values only for those who can edit customers. */
function customerView(c: Ctx, cu: MockCustomer): Customer {
  const sensitive = permsFor(c.role, c.user.platform_admin).has('customers.write');
  const { properties, masked_properties } = visibleValues(definitionsOf(c, 'customer'), cu.properties, sensitive);
  return { ...customerOut(c.db, cu), properties, ...(masked_properties.length && { masked_properties }) };
}

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
  if (b.properties !== undefined || !existing) {
    cu.properties = checked(() => applyValues(definitionsOf(c, 'customer'), existing?.properties ?? {}, b.properties, !existing));
  }
  if (b.avatar_url !== undefined) {
    const link = String(b.avatar_url ?? '').trim();
    if (link && !/^https:\/\/[^\s/@]+\//.test(link)) throw invalid('Set avatar_url to an https link to a PNG, JPEG or WebP picture, or to "" to remove the picture.');
    // The API copies the picture; the demo shows the link itself.
    cu.avatar_url = link || undefined;
    cu.avatar_source = link ? 'url' : undefined;
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
  const defs = definitionsOf(c, 'customer');
  const sensitive = permsFor(c.role, c.user.platform_admin).has('customers.write');
  const filtered = botCustomers(c)
    .filter((x) => !s || [x.name, ...x.contacts.map((k) => k.value)].some((f) => f.toLowerCase().startsWith(s) || f.toLowerCase().split(/\s+/).some((w) => w.startsWith(s))))
    .filter((x) => checked(() => matchesFilters(defs, x.properties, c.query, sensitive)))
    .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at));
  const limit = Math.min(200, Math.max(1, Number(c.query.get('limit') ?? 50)));
  const start = Number(c.query.get('cursor') ?? 0);
  return {
    data: filtered.slice(start, start + limit).map((x) => customerView(c, x)),
    next_cursor: start + limit < filtered.length ? String(start + limit) : undefined,
  };
});

route('POST', '/customers', 'customers.write', (c) => {
  const now = nowIso();
  const cu: MockCustomer = { id: newId('cus'), tenant_id: c.tenant.id, bot_id: c.botId, name: '', contacts: [], metadata: {}, properties: {}, first_seen_at: now, last_seen_at: now, created_at: now, updated_at: now };
  applyCustomer(c, cu, c.body ?? {});
  c.db.customers.push(cu);
  return created(customerView(c, cu));
});

route('GET', '/customers/:id', 'customers.read', (c) => {
  const cu = customerOf(c, c.params.id);
  const latest = <T extends { updated_at: string }>(rows: T[]) => rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 10);
  return {
    ...customerView(c, cu),
    recent_conversations: latest(c.db.conversations.filter((x) => x.customer_id === cu.id)).map((x) => ({ id: x.id, created_at: x.created_at, updated_at: x.updated_at })),
    recent_tickets: latest(botTickets(c).filter((t) => t.customer_id === cu.id)).map((t) => ({ id: t.id, subject: t.subject, status: t.status, created_at: t.created_at, updated_at: t.updated_at })),
  };
});

route('PATCH', '/customers/:id', 'customers.write', (c) => {
  const cu = customerOf(c, c.params.id);
  const b = c.body ?? {};
  if (!['name', 'contacts', 'metadata', 'properties', 'avatar_url'].some((k) => b[k] !== undefined)) throw invalid('Send at least one field to change.');
  const patch: Partial<MockCustomer> = {};
  applyCustomer(c, patch, b, cu);
  Object.assign(cu, patch, { updated_at: nowIso() });
  return customerView(c, cu);
});

route('PUT', '/customers/:id/avatar', 'customers.write', (c) => {
  const cu = customerOf(c, c.params.id);
  Object.assign(cu, { avatar_url: pictureOf(c), avatar_source: 'upload' as const });
  return { avatar_url: cu.avatar_url };
});

route('DELETE', '/customers/:id/avatar', 'customers.write', (c) => {
  const cu = customerOf(c, c.params.id);
  delete cu.avatar_url;
  delete cu.avatar_source;
  return { avatar_url: null };
});

route('DELETE', '/customers/:id', 'customers.write', (c) => {
  const cu = customerOf(c, c.params.id);
  // Their conversations and tickets keep the customer_id.
  c.db.customers = c.db.customers.filter((x) => x !== cu);
  return noContent();
});

/* Custom properties -------------------------------------------------- */

const botProperties = (c: Ctx) =>
  (c.db.properties ??= []).filter((d) => d.tenant_id === c.tenant.id && d.bot_id === c.botId).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));

/** A record's property definitions, for checking and showing its values. */
export const definitionsOf = (c: Ctx, entity: MockProperty['entity'], scopeId?: string) =>
  botProperties(c).filter((d) => d.entity === entity && (scopeId === undefined || (d.scope_id ?? '') === scopeId));

const propertyOut = ({ tenant_id: _t, bot_id: _b, ...d }: MockProperty) => d;

/** Runs a property check, turning its refusal into 400 INVALID_REQUEST. */
export function checked<T>(run: () => T): T {
  try {
    return run();
  } catch (e) {
    if (e instanceof PropertyError) throw invalid(e.message);
    throw e;
  }
}

function propertyOf(c: Ctx, id: unknown) {
  const d = botProperties(c).find((x) => x.id === id);
  if (!d) throw notFound('PROPERTY_NOT_FOUND', 'Property');
  return d;
}

route('GET', '/properties', 'properties.read', (c) => {
  const entity = c.query.get('entity') as MockProperty['entity'];
  if (!PROPERTY_ENTITIES.includes(entity)) throw invalid(`Set entity to one of ${PROPERTY_ENTITIES.join(', ')}.`);
  const scope = c.query.get('scope_id') || undefined;
  return { data: definitionsOf(c, entity, entity === 'query' ? scope : '').map(propertyOut) };
});

route('GET', '/properties/presets', 'properties.read', (c) => {
  const entity = c.query.get('entity');
  const type = c.query.get('business_type');
  if (!PROPERTY_ENTITIES.includes(entity as MockProperty['entity'])) throw invalid(`Set entity to one of ${PROPERTY_ENTITIES.join(', ')}.`);
  return { data: PRESETS.filter((p) => p.entity === entity && (!type || !p.business_types.length || p.business_types.includes(type))) };
});

route('POST', '/properties', 'properties.write', (c) => {
  const b = c.body ?? {};
  if (b.entity === 'query' && !queryTypesOf(c).some((t) => t.id === b.scope_id)) throw invalid('scope_id names no query type of this bot.');
  const def = checked(() => newDefinition(b, definitionsOf(c, b.entity)));
  if (definitionsOf(c, def.entity, def.scope_id ?? '').some((d) => d.key === def.key)) throw err(409, 'PROPERTY_EXISTS', 'Another property of this entity already has this key.');
  const now = nowIso();
  const d: MockProperty = { ...def, id: newId('prp'), tenant_id: c.tenant.id, bot_id: c.botId, created_at: now, updated_at: now };
  c.db.properties.push(d);
  return created(propertyOut(d));
});

route('PATCH', '/properties/:id', 'properties.write', (c) => {
  const d = propertyOf(c, c.params.id);
  const b = c.body ?? {};
  if (!['entity', 'scope_id', 'key', 'label', 'description', 'type', 'options', 'required', 'sensitive', 'sort_order'].some((k) => b[k] !== undefined)) throw invalid('Send at least one field to change.');
  const next = { ...d };
  checked(() => changeDefinition(next, b));
  Object.assign(d, next, { updated_at: nowIso() });
  return propertyOut(d);
});

route('DELETE', '/properties/:id', 'properties.write', (c) => {
  const d = propertyOf(c, c.params.id);
  c.db.properties = c.db.properties.filter((x) => x !== d);
  // Its values go with it, in every record of the bot.
  for (const cu of botCustomers(c)) delete cu.properties?.[d.key];
  for (const p of botProducts(c)) delete p.properties[d.key];
  for (const q of botQueries(c)) if (q.type_id === d.scope_id) delete q.properties[d.key];
  return noContent();
});

/* Products ----------------------------------------------------------- */

const botProducts = (c: Ctx) => (c.db.products ??= []).filter((p) => p.tenant_id === c.tenant.id && p.bot_id === c.botId);

function productView(c: Ctx, p: MockProduct) {
  const sensitive = permsFor(c.role, c.user.platform_admin).has('products.write');
  const { properties, masked_properties } = visibleValues(definitionsOf(c, 'product'), p.properties, sensitive);
  return { ...p, properties, ...(masked_properties.length && { masked_properties }) };
}

function productOf(c: Ctx, id: unknown) {
  const p = botProducts(c).find((x) => x.id === id);
  if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Product');
  return p;
}

/** Validates POST and PATCH /products fields onto p, like the API. */
function applyProduct(c: Ctx, p: MockProduct, b: any, creating: boolean) {
  if (b.name !== undefined) p.name = String(b.name).replace(/\s+/g, ' ').trim();
  if (b.sku !== undefined) p.sku = String(b.sku).trim();
  if (b.description !== undefined) p.description = String(b.description).trim();
  if (b.price !== undefined) {
    const price = b.price === null ? null : parsePrice(String(b.price));
    if (price === undefined) throw invalid('Set price to an amount such as "19.90" (up to 12 digits and 4 decimals), or null.');
    p.price = price;
  }
  if (b.currency !== undefined) p.currency = String(b.currency).trim().toUpperCase();
  if (b.stock !== undefined) {
    if (b.stock !== null && (!Number.isInteger(b.stock) || b.stock < 0)) throw invalid('Set stock to a whole number from 0, or null when it isn\'t tracked.');
    p.stock = b.stock;
  }
  if (b.url !== undefined) p.url = String(b.url).trim();
  if (b.image_url !== undefined) p.image_url = String(b.image_url).trim();
  if (b.status !== undefined) p.status = b.status;
  if (!p.name || p.name.length > 200) throw invalid('Give the product a name of 1–200 characters.');
  if (p.sku.length > 64) throw invalid('Keep the SKU to 64 characters on one line.');
  if (p.currency && !/^[A-Z]{3}$/.test(p.currency)) throw invalid('Set currency to a three-letter ISO 4217 code such as USD or EUR.');
  if (!['active', 'draft', 'archived'].includes(p.status)) throw invalid('Set status to active, draft or archived.');
  if (!isLink(p.url)) throw invalid('Set url to an http or https link.');
  if (!isLink(p.image_url)) throw invalid('Set image_url to an http or https link.');
  if (b.properties !== undefined || creating) p.properties = checked(() => applyValues(definitionsOf(c, 'product'), p.properties, b.properties, creating));
  if (p.sku && botProducts(c).some((x) => x !== p && x.sku === p.sku)) throw err(409, 'PRODUCT_EXISTS', 'Another product of this bot already has this SKU.');
}

route('GET', '/products', 'products.read', (c) => {
  const s = (c.query.get('q') ?? '').trim().toLowerCase().slice(0, 100);
  const status = c.query.get('status');
  const defs = definitionsOf(c, 'product');
  const sensitive = permsFor(c.role, c.user.platform_admin).has('products.write');
  const filtered = botProducts(c)
    .filter((p) => !s || [p.name, p.sku, p.description].some((f) => f.toLowerCase().includes(s)))
    .filter((p) => !status || p.status === status)
    .filter((p) => checked(() => matchesFilters(defs, p.properties, c.query, sensitive)))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const limit = Math.min(200, Math.max(1, Number(c.query.get('limit') ?? 50)));
  const start = Number(c.query.get('cursor') ?? 0);
  return { data: filtered.slice(start, start + limit).map((p) => productView(c, p)), next_cursor: start + limit < filtered.length ? String(start + limit) : undefined };
});

route('POST', '/products', 'products.write', (c) => {
  const now = nowIso();
  const p: MockProduct = { id: newId('prd'), tenant_id: c.tenant.id, bot_id: c.botId, name: '', sku: '', description: '', price: null, currency: '', stock: null, url: '', image_url: '',
    status: 'active', source: 'manual', properties: {}, created_at: now, updated_at: now };
  applyProduct(c, p, c.body ?? {}, true);
  c.db.products.push(p);
  return created(productView(c, p));
});

route('GET', '/products/imports', 'products.read', (c) => ({
  data: (c.db.productImports ??= [])
    .filter((i) => i.tenant_id === c.tenant.id && i.bot_id === c.botId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20)
    .map(({ items: _items, tenant_id: _t, bot_id: _b, ...i }) => i),
}));

function importOf(c: Ctx, id: unknown) {
  const i = (c.db.productImports ??= []).find((x) => x.id === id && x.tenant_id === c.tenant.id && x.bot_id === c.botId);
  if (!i) throw notFound('IMPORT_NOT_FOUND', 'Import');
  return i;
}

function importOut(c: Ctx, i: MockImport) {
  const { tenant_id: _t, bot_id: _b, ...out } = i;
  const skus = new Set(botProducts(c).map((p) => p.sku).filter(Boolean));
  return { ...out, items: i.status === 'ready' ? i.items.map((d) => ({ ...d, exists: Boolean(d.sku) && skus.has(d.sku) })) : [] };
}

function readyImport(c: Ctx, i: MockImport, items: MockImport['items'] | string, method: MockImport['method'], truncated = false) {
  Object.assign(i, { updated_at: nowIso(), method });
  if (typeof items === 'string' || !items.length) Object.assign(i, { status: 'failed', error: typeof items === 'string' ? items : 'No products were found.' });
  else Object.assign(i, { status: 'ready', items, item_count: items.length, truncated, error: undefined });
  return importOut(c, i);
}

route('POST', '/products/imports', 'products.write', (c) => {
  const b = c.body ?? {};
  const now = nowIso();
  const base = { id: newId('imp'), tenant_id: c.tenant.id, bot_id: c.botId, items: [], item_count: 0, truncated: false, created: 0, updated: 0, skipped: 0, created_at: now, updated_at: now };
  if (b.source === 'file') {
    const name = str(b.filename, 'filename', 1, 260)!;
    if (!/\.(csv|tsv|json|txt|md|pdf|docx|html?)$/i.test(name)) throw invalid("This file type isn't read. Use .csv, .tsv, .json, .txt, .md, .pdf, .docx, .html; export a spreadsheet as CSV.");
    const i: MockImport = { ...base, source: 'file', name, status: 'uploading' };
    c.db.productImports.push(i);
    return created({ import: importOut(c, i), url: `mock://r2/${i.id}`, method: 'PUT', headers: { 'Content-Type': 'text/csv' }, expires_at: new Date(Date.now() + 1_800_000).toISOString() });
  }
  if (b.source === 'url') {
    const link = String(b.url ?? '').trim();
    if (!/^https:\/\/[^\s/]+\.[^\s]+/.test(link) || /localhost|127\.0\.0\.1|169\.254\./.test(link)) throw invalid("Send the page's full https:// link.");
    const i: MockImport = { ...base, source: 'url', name: link, status: 'processing' };
    c.db.productImports.push(i);
    // A link with "fail" in it shows a page that couldn't be read.
    if (/fail/i.test(link)) return created(readyImport(c, i, 'The page answered 404 Not Found.', undefined));
    return created(readyImport(c, i, sampleDrafts(link, definitionsOf(c, 'product')), /ai/i.test(link) ? 'ai' : 'json_ld'));
  }
  throw invalid('Send {"source": "file", ...} or {"source": "url", ...}.');
});

route('GET', '/products/imports/:id', 'products.read', (c) => importOut(c, importOf(c, c.params.id)));

route('POST', '/products/imports/:id/process', 'products.write', (c) => {
  const i = importOf(c, c.params.id);
  if (i.source !== 'file' || !['uploading', 'failed'].includes(i.status)) throw err(409, 'IMPORT_STATE', "The import can't do this now.");
  const text = pendingObjects.get(i.id);
  if (text === undefined) return readyImport(c, i, "The file hasn't been uploaded yet. Upload it, then try again.", undefined);
  const defs = definitionsOf(c, 'product');
  if (/\.(csv|tsv)$/i.test(i.name)) {
    const read = readCsv(text, defs);
    return typeof read === 'string' ? readyImport(c, i, read, 'csv') : readyImport(c, i, read.items, 'csv', read.truncated);
  }
  return readyImport(c, i, sampleDrafts(i.name, defs), /\.json$/i.test(i.name) ? 'json' : 'ai');
});

route('POST', '/products/imports/:id/commit', 'products.write', (c) => {
  const i = importOf(c, c.params.id);
  if (i.status !== 'ready') throw err(409, 'IMPORT_STATE', "The import can't do this now.");
  const b = c.body ?? {};
  const indexes: number[] = b.indexes?.length ? b.indexes : i.items.map((_, n) => n);
  const errors: { index: number; message: string }[] = [];
  let made = 0;
  let changed = 0;
  let skipped = 0;
  for (const n of indexes) {
    const d = i.items[n];
    if (!d) throw invalid(`indexes names drafts by their place in items, each once: ${n} isn't one.`);
    const fields = { name: d.name, sku: d.sku, description: d.description, price: d.price, currency: d.currency, stock: d.stock, url: d.url, image_url: d.image_url, properties: d.properties, ...b.edits?.[n] };
    const same = fields.sku ? botProducts(c).find((p) => p.sku === fields.sku) : undefined;
    if (same && b.on_duplicate !== 'update') {
      skipped++;
      continue;
    }
    const now = nowIso();
    const p: MockProduct = same ?? { id: newId('prd'), tenant_id: c.tenant.id, bot_id: c.botId, name: '', sku: '', description: '', price: null, currency: '', stock: null, url: '', image_url: '',
      status: 'active', source: i.source === 'url' ? 'web' : i.method === 'csv' || i.method === 'json' ? 'csv' : 'document', properties: {}, created_at: now, updated_at: now };
    try {
      applyProduct(c, p, { ...fields, properties: undefined }, false);
      p.properties = checked(() => applyValues(definitionsOf(c, 'product'), same?.properties ?? {}, fields.properties, false));
    } catch (e) {
      errors.push({ index: n, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    p.updated_at = now;
    if (same) changed++;
    else c.db.products.push(p), made++;
  }
  Object.assign(i, { status: 'committed', committed_at: nowIso(), created: made, updated: changed, skipped, items: [] });
  return { import: importOut(c, i), errors };
});

route('DELETE', '/products/imports/:id', 'products.write', (c) => {
  const i = importOf(c, c.params.id);
  c.db.productImports = c.db.productImports.filter((x) => x !== i);
  return noContent();
});

route('GET', '/products/:id', 'products.read', (c) => productView(c, productOf(c, c.params.id)));

route('PATCH', '/products/:id', 'products.write', (c) => {
  const p = productOf(c, c.params.id);
  const next = { ...p, properties: { ...p.properties } };
  applyProduct(c, next, c.body ?? {}, false);
  Object.assign(p, next, { updated_at: nowIso() });
  return productView(c, p);
});

route('DELETE', '/products/:id', 'products.write', (c) => {
  const p = productOf(c, c.params.id);
  c.db.products = c.db.products.filter((x) => x !== p);
  return noContent();
});

/* Queries ------------------------------------------------------------ */

const queryTypesOf = (c: Ctx) => (c.db.queryTypes ??= []).filter((t) => t.tenant_id === c.tenant.id && t.bot_id === c.botId).sort((a, b) => a.sort_order - b.sort_order);
const botQueries = (c: Ctx) => (c.db.queries ??= []).filter((q) => q.tenant_id === c.tenant.id && q.bot_id === c.botId && !q.deleted);
const seesAll = (c: Ctx) => c.user.platform_admin || c.role === 'owner' || c.role === 'admin';
const seesType = (c: Ctx, t: MockQueryType) => seesAll(c) || !t.visible_roles.length || t.visible_roles.includes(c.role as never);

function queryTypeOut(c: Ctx, t: MockQueryType): QueryType {
  const { tenant_id: _t, bot_id: _b, ...out } = t;
  return { ...out, open: botQueries(c).filter((q) => q.type_id === t.id && q.status_category !== 'done').length };
}

function queryTypeOf(c: Ctx, id: unknown, mustSee = true) {
  const t = queryTypesOf(c).find((x) => x.id === id);
  if (!t || (mustSee && !seesType(c, t))) throw notFound('QUERY_TYPE_NOT_FOUND', 'Query type');
  return t;
}

function queryOut(c: Ctx, q: MockQuery): CustomerQuery {
  const t = queryTypeOf(c, q.type_id, false);
  const status = t.statuses.find((s) => s.key === q.status);
  const customer = c.db.customers.find((x) => x.id === q.customer_id);
  const assignee = q.assignee_user_id ? userById(c.db, q.assignee_user_id) : undefined;
  const sensitive = permsFor(c.role, c.user.platform_admin).has('queries.write');
  const { properties, masked_properties } = visibleValues(definitionsOf(c, 'query', t.id), q.properties, sensitive);
  const { tenant_id: _t, bot_id: _b, deleted: _d, events: _e, ...out } = q;
  return {
    ...out,
    reference: `Q-${q.number}`,
    type_name: t.name,
    status_label: status?.label ?? q.status,
    customer_name: customer?.name,
    assignee_name: assignee ? assignee.name || assignee.email : undefined,
    properties,
    ...(masked_properties.length && { masked_properties }),
  };
}

function queryOf(c: Ctx, id: unknown) {
  const q = botQueries(c).find((x) => x.id === id);
  if (!q || !seesType(c, queryTypeOf(c, q.type_id, false))) throw notFound('QUERY_NOT_FOUND', 'Query');
  return q;
}

function checkType(b: any, t: Partial<MockQueryType>) {
  if (b.name !== undefined) t.name = String(b.name).trim();
  if (b.description !== undefined) t.description = String(b.description).trim();
  if (b.statuses !== undefined) t.statuses = b.statuses;
  if (b.default_status !== undefined) t.default_status = b.default_status;
  if (b.visible_roles !== undefined) t.visible_roles = b.visible_roles;
  if (b.bot_enabled !== undefined) t.bot_enabled = b.bot_enabled === true;
  if (b.archived !== undefined) t.archived = b.archived === true;
  if (!t.name) throw invalid('Give the query type a name of 1–60 characters.');
  const s = t.statuses ?? [];
  if (s.length < 2 || s.length > 12) throw invalid('Give a query type 2–12 statuses.');
  if (!s.some((x) => x.category === 'open') || !s.some((x) => x.category === 'done')) throw invalid('A query type needs at least one open status and one done status.');
  if (new Set(s.map((x) => x.key)).size !== s.length || s.some((x) => !/^[a-z][a-z0-9_]{0,39}$/.test(x.key))) throw invalid('Give each status a unique key of lowercase letters, digits or underscores.');
  const def = s.find((x) => x.key === t.default_status);
  if (!def || def.category === 'done') throw invalid("Set default_status to one of the type's statuses that isn't done.");
}

route('GET', '/query-types', 'queries.read', (c) => ({
  data: queryTypesOf(c)
    .filter((t) => seesType(c, t) && (c.query.get('archived') === 'true' || !t.archived))
    .map((t) => queryTypeOut(c, t)),
}));

route('GET', '/query-types/presets', 'queries.read', (c) => {
  const type = c.query.get('business_type');
  return { data: QUERY_PRESETS.filter((p) => !type || !p.business_types.length || p.business_types.includes(type)) };
});

route('POST', '/query-types', 'queries.manage', (c) => {
  const b = c.body ?? {};
  const key = String(b.key ?? '').trim();
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) throw invalid('Set key to 1–40 lowercase letters, digits or underscores, starting with a letter, such as order_issue.');
  if (queryTypesOf(c).some((t) => t.key === key)) throw err(409, 'QUERY_TYPE_EXISTS', 'Another query type of this bot already has this key.');
  const now = nowIso();
  const t: MockQueryType = {
    id: newId('qtp'), tenant_id: c.tenant.id, bot_id: c.botId, key, name: '', description: '', statuses: DEFAULT_QUERY_STATUSES, default_status: 'new', visible_roles: [],
    bot_enabled: false, sort_order: queryTypesOf(c).length, archived: false, created_at: now, updated_at: now,
  };
  checkType(b, t);
  c.db.queryTypes.push(t);
  return created(queryTypeOut(c, t));
});

route('PATCH', '/query-types/:id', 'queries.manage', (c) => {
  const t = queryTypeOf(c, c.params.id);
  const b = c.body ?? {};
  if (b.key !== undefined && b.key !== t.key) throw invalid("A query type's key can't change.");
  const next = { ...t };
  checkType(b, next);
  const used = botQueries(c).find((q) => q.type_id === t.id && !next.statuses.some((s) => s.key === q.status));
  if (used) throw invalid(`Queries are ${used.status}. Move them to another status before removing it.`);
  for (const q of botQueries(c).filter((x) => x.type_id === t.id)) q.status_category = next.statuses.find((s) => s.key === q.status)!.category;
  Object.assign(t, next, { updated_at: nowIso() });
  return queryTypeOut(c, t);
});

route('DELETE', '/query-types/:id', 'queries.manage', (c) => {
  const t = queryTypeOf(c, c.params.id);
  if (botQueries(c).some((q) => q.type_id === t.id)) throw err(409, 'QUERY_TYPE_IN_USE', 'This query type has queries. Archive it instead, so it takes no new ones.');
  c.db.queryTypes = c.db.queryTypes.filter((x) => x !== t);
  c.db.properties = c.db.properties.filter((d) => !(d.entity === 'query' && d.scope_id === t.id));
  return noContent();
});

route('GET', '/queries', 'queries.read', (c) => {
  const p = c.query;
  const text = (p.get('q') ?? '').trim().toLowerCase();
  const ref = /^#?q?-?(\d+)$/i.exec(text)?.[1];
  const category = p.get('category');
  const assignee = p.get('assignee');
  const type = p.get('type');
  const defs = type ? definitionsOf(c, 'query', type) : [];
  const sensitive = permsFor(c.role, c.user.platform_admin).has('queries.write');
  const rows = botQueries(c)
    .filter((q) => seesType(c, queryTypeOf(c, q.type_id, false)))
    .filter((q) => !type || q.type_id === type)
    .filter((q) => !p.get('status') || q.status === p.get('status'))
    .filter((q) => !category || (category === 'active' ? q.status_category !== 'done' : q.status_category === category))
    .filter((q) => !p.get('customer') || q.customer_id === p.get('customer'))
    .filter((q) => !p.get('conversation') || q.conversation_id === p.get('conversation'))
    .filter((q) => !assignee || (assignee === 'none' ? !q.assignee_user_id : q.assignee_user_id === (assignee === 'me' ? c.user.id : assignee)))
    .filter((q) => !text || (ref ? q.number === Number(ref) : [q.subject, c.db.customers.find((x) => x.id === q.customer_id)?.name ?? ''].some((s) => s.toLowerCase().includes(text))))
    .filter((q) => !type || checked(() => matchesFilters(defs, q.properties, p, sensitive)))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const limit = Math.min(200, Math.max(1, Number(p.get('limit') ?? 50)));
  const start = Number(p.get('cursor') ?? 0);
  return { data: rows.slice(start, start + limit).map((q) => queryOut(c, q)), next_cursor: start + limit < rows.length ? String(start + limit) : undefined };
});

function queryEvent(c: Ctx, q: MockQuery, kind: MockQuery['events'][number]['kind'], extra: Partial<MockQuery['events'][number]> = {}) {
  q.events.push({ id: newId('qev'), kind, actor_type: 'member', actor_id: c.user.id, actor_name: c.user.name, created_at: nowIso(), ...extra });
}

route('POST', '/queries', 'queries.write', (c) => {
  const b = c.body ?? {};
  const t = queryTypeOf(c, b.type_id);
  if (t.archived) throw invalid(`${t.name} is archived, so it takes no new queries.`);
  const status = t.statuses.find((s) => s.key === (b.status ?? t.default_status));
  if (!status) throw invalid(`${t.name} has no status "${b.status}".`);
  const now = nowIso();
  const conversation = b.conversation_id ? c.db.conversations.find((x) => x.id === b.conversation_id && x.tenant_id === c.tenant.id) : undefined;
  if (b.conversation_id && !conversation) throw invalid('conversation_id names no conversation of this bot.');
  const customer = b.customer_id || conversation?.customer_id;
  if (b.customer_id && !botCustomers(c).some((x) => x.id === b.customer_id)) throw invalid('customer_id names no customer of this bot.');
  const q: MockQuery = {
    id: newId('qry'), tenant_id: c.tenant.id, bot_id: c.botId, number: botQueries(c).reduce((m, x) => Math.max(m, x.number), 1000) + 1, type_id: t.id,
    subject: String(b.subject ?? '').trim(), status: status.key, status_category: status.category, customer_id: customer || undefined, conversation_id: b.conversation_id || undefined,
    ticket_id: b.ticket_id || undefined, assignee_user_id: b.assignee_user_id || undefined, source: 'dashboard',
    properties: checked(() => applyValues(definitionsOf(c, 'query', t.id), {}, b.properties, true)), events: [], created_at: now, updated_at: now,
    ...(status.category === 'done' && { closed_at: now }),
  };
  queryEvent(c, q, 'created', { to: q.status, note: b.note });
  c.db.queries.push(q);
  return created(queryOut(c, q));
});

route('GET', '/queries/:id', 'queries.read', (c) => queryOut(c, queryOf(c, c.params.id)));

route('PATCH', '/queries/:id', 'queries.write', (c) => {
  const q = queryOf(c, c.params.id);
  const t = queryTypeOf(c, q.type_id, false);
  const b = c.body ?? {};
  if (!Object.keys(b).length) throw invalid('Send at least one field to change.');
  if (b.subject !== undefined) q.subject = String(b.subject).trim();
  if (b.status !== undefined && b.status !== q.status) {
    const s = t.statuses.find((x) => x.key === b.status);
    if (!s) throw invalid(`${t.name} has no status "${b.status}".`);
    queryEvent(c, q, 'status', { from: q.status, to: s.key });
    Object.assign(q, { status: s.key, status_category: s.category, closed_at: s.category === 'done' ? (q.closed_at ?? nowIso()) : undefined });
  }
  if (b.assignee_user_id !== undefined && b.assignee_user_id !== (q.assignee_user_id ?? '')) {
    queryEvent(c, q, 'assigned', { from: q.assignee_user_id, to: b.assignee_user_id });
    q.assignee_user_id = b.assignee_user_id || undefined;
  }
  if (b.properties !== undefined) {
    const before = JSON.stringify(q.properties);
    q.properties = checked(() => applyValues(definitionsOf(c, 'query', t.id), q.properties, b.properties, false));
    if (JSON.stringify(q.properties) !== before) queryEvent(c, q, 'fields', { to: Object.keys(b.properties).join(',') });
  }
  if (b.note !== undefined) {
    if (!String(b.note).trim()) throw invalid('Write a note, or leave note out.');
    queryEvent(c, q, 'note', { note: String(b.note).trim() });
  }
  q.updated_at = nowIso();
  return queryOut(c, q);
});

route('DELETE', '/queries/:id', 'queries.delete', (c) => {
  queryOf(c, c.params.id).deleted = true;
  return noContent();
});

route('GET', '/queries/:id/events', 'queries.read', (c) => ({ data: queryOf(c, c.params.id).events }));

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
    modelSelection: 'platform' as const,
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
  if (bot.maxTokens !== undefined && (bot.maxTokens < 1 || bot.maxTokens > 32768)) throw invalid('maxTokens must be 1–32768.');
  if ((bot.tools ?? []).length > 20) throw invalid('At most 20 tools.');
  if (bot.webSearch !== undefined) {
    const w = bot.webSearch;
    if (!w || typeof w !== 'object') throw invalid('webSearch must be an object.');
    if (w.mode !== undefined && !['fallback', 'always'].includes(w.mode)) throw invalid('webSearch.mode must be fallback or always.');
    if (w.maxResults !== undefined && (!Number.isInteger(w.maxResults) || w.maxResults < 1 || w.maxResults > 8)) throw invalid('webSearch.maxResults must be 1–8.');
    if (w.depth !== undefined && !['basic', 'advanced'].includes(w.depth)) throw invalid('webSearch.depth must be basic or advanced.');
    if (w.topic !== undefined && !['general', 'news'].includes(w.topic)) throw invalid('webSearch.topic must be general or news.');
    if (w.timeRange !== undefined && !['day', 'week', 'month', 'year', ''].includes(w.timeRange)) throw invalid('webSearch.timeRange is not valid.');
    for (const k of ['includeDomains', 'excludeDomains'] as const) {
      const list = w[k] ?? [];
      if (!Array.isArray(list) || list.length > 50 || list.some((d: unknown) => typeof d !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))) throw invalid(`webSearch.${k} must be up to 50 hostnames.`);
    }
    const turningOn = w.enabled && !ws.bot.webSearch?.enabled;
    if (turningOn && bot.ragEnabled === false) throw invalid('webSearch needs ragEnabled.');
    if (turningOn && limitsOf(c.tenant).web_search === false) throw err(403, 'PLAN_LIMIT_REACHED', `The ${c.tenant.plan} plan doesn't include web search.`, { limit: 'web_search' });
  }
  // Prompt fields in the request are ignored: the bot keeps its business type's prompt.
  const { promptTemplateId, promptVariables, prompt } = ws.bot;
  const next: MockBotConfig = { ...publicBot(bot), promptTemplateId, promptVariables, prompt };
  if (!c.user.platform_admin) {
    // The platform decides these: a business's save keeps what was saved and drops what it sent, without an error.
    const kept = ws.bot;
    next.model = kept.model;
    next.temperature = kept.temperature;
    next.maxTokens = kept.maxTokens;
    next.topK = kept.topK;
    next.routing = kept.routing;
    if (next.knowledge || kept.knowledge) {
      const { policy, learnFromTickets } = next.knowledge ?? {};
      next.knowledge = { ...kept.knowledge, ...(policy !== undefined && { policy }), ...(learnFromTickets !== undefined && { learnFromTickets }) };
    }
  }
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

// The platform chooses every reply's model, so a business has no catalog to pick from.
route('GET', '/models', 'bot.read', () => ({ selection: 'platform' as const, models: [] }));

/* Knowledge ---------------------------------------------------------- */

const docOut = ({ tenant_id: _t, bot_id: _b, content: _c, sha256: _s, replacement, ...d }: MockDoc) =>
  replacement ? { ...d, replace_pending: true } : d;
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
  const name = (c.query.get('source_name') ?? '').trim().toLowerCase();
  const status = c.query.get('status');
  const limit = Math.min(100, Math.max(1, Number(c.query.get('limit') ?? 50)));
  const all = botDocs(c).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const matched = all.filter(
    (d) =>
      (!q || `${d.title} ${d.source_name ?? ''}`.toLowerCase().includes(q)) &&
      (!name || (d.source_type === 'file' && d.source_name?.toLowerCase() === name)) &&
      (!status || d.status === status),
  );
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
  d.byte_size = d.source_type !== 'file' ? bytes : d.byte_size;
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
  pendingObjects.delete(d.id);
  pendingObjects.delete(`${d.id}:replacement`);
  bumpKb(c);
  return noContent();
});

route('POST', '/knowledge/documents/:id/process', 'knowledge.write', (c) => {
  const d = findDoc(c);
  // A new version that has arrived is read first; until then the current one stays.
  const next = d.replacement;
  if (next && pendingObjects.has(`${d.id}:replacement`)) {
    const text = pendingObjects.get(`${d.id}:replacement`)!;
    pendingObjects.delete(`${d.id}:replacement`);
    d.replacement = undefined;
    if (/\.json$/i.test(next.filename) && text && !isJson(text)) {
      throw invalid(`${next.filename} couldn't replace the current file: the JSON could not be read. The current version is still in use.`);
    }
    // A title taken from the old file name follows the new file.
    if (d.title === titleOf(d.source_name ?? '')) d.title = titleOf(next.filename);
    Object.assign(d, fileFields(next.filename, next.size), { sha256: next.sha256, error: undefined });
    d.content = text || `# ${d.title}\n\n(Extracted text of ${d.source_name}.)`;
    d.status = 'processing';
    d.chunk_count = Math.max(2, Math.ceil(d.byte_size / 2400));
    // Unchanged passages keep their embeddings.
    d.embedded_count = Math.floor(d.chunk_count / 2);
  }
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

const titleOf = (filename: string) => filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');

const isJson = (text: string) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

function fileFields(filename: string, size: number) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return {
    source_name: filename,
    mime_type: ext === '.pdf' ? 'application/pdf' : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain',
    byte_size: size,
  };
}

/** Checks the file an upload or replacement describes. */
function uploadFile(b: any) {
  const filename = str(b.filename, 'filename', 1, 260)!;
  if (filename.includes('/')) throw invalid('filename must not contain slashes.');
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (!ACCEPT.includes(ext)) throw invalid(`Files must end in ${ACCEPT.join(', ')}.`);
  const size = Number(b.size);
  const textual = ['.md', '.markdown', '.txt', '.text', '.csv', '.json'].includes(ext);
  if (!size || size > (textual ? 5 : 25) * 1024 * 1024) throw invalid(`size must be at most ${textual ? 5 : 25} MB for ${ext} files.`);
  if (!/^[0-9a-f]{64}$/.test(b.sha256 ?? '')) throw invalid('sha256 must be 64 lowercase hex characters.');
  return { filename, size, sha256: b.sha256 as string };
}

const uploadOut = (d: MockDoc, key: string, replaced?: boolean) => ({
  document: docOut(d),
  url: `mock://r2/${key}`,
  method: 'PUT',
  headers: { 'Content-Type': d.mime_type ?? 'application/octet-stream' },
  expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  ...(replaced ? { replaced } : {}),
});

/** Stages a new version of d's file, or takes it straight away when the current one never arrived. */
function replaceFile(c: Ctx, d: MockDoc, file: ReturnType<typeof uploadFile>) {
  if (d.source_type !== 'file') throw invalid('Only uploaded files can be replaced. Edit the article’s text instead.');
  if (file.sha256 === d.sha256 && d.status !== 'pending_upload' && d.status !== 'failed') {
    throw err(409, 'DUPLICATE_DOCUMENT', `This file is already in "${d.title}".`, { document_id: d.id });
  }
  const other = botDocs(c).find((x) => x.id !== d.id && x.sha256 === file.sha256 && x.status !== 'failed');
  if (other) throw err(409, 'DUPLICATE_DOCUMENT', `This file is already in "${other.title}".`, { document_id: other.id });
  if (d.status === 'pending_upload') {
    if (d.title === titleOf(d.source_name ?? '')) d.title = titleOf(file.filename);
    Object.assign(d, fileFields(file.filename, file.size), { sha256: file.sha256, error: undefined, updated_at: nowIso() });
    return created(uploadOut(d, d.id, true));
  }
  d.replacement = file;
  return created({ ...uploadOut(d, `${d.id}:replacement`, true), headers: { 'Content-Type': fileFields(file.filename, file.size).mime_type } });
}

route('POST', '/knowledge/documents/:id/replace', 'knowledge.write', (c) => {
  const file = uploadFile(c.body);
  return replaceFile(c, findDoc(c), file);
});

route('POST', '/knowledge/uploads', 'knowledge.write', (c) => {
  const { filename, size, sha256 } = uploadFile(c.body);
  if (c.body.replace_existing) {
    const same = botDocs(c)
      .filter((d) => d.source_type === 'file' && d.source_name?.toLowerCase() === filename.toLowerCase())
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (same) return replaceFile(c, same, { filename, size, sha256 });
  }
  const existing = botDocs(c).find((d) => d.sha256 === sha256);
  if (existing && existing.status !== 'pending_upload') throw err(409, 'DUPLICATE_DOCUMENT', `This file is already in "${existing.title}".`, { document_id: existing.id });
  requireLimit(c.tenant, 'documents_per_bot', botDocs(c).length);
  const now = nowIso();
  const d: MockDoc =
    existing ??
    ({
      id: newId('doc'),
      tenant_id: c.tenant.id,
      bot_id: c.botId,
      title: c.body.title || titleOf(filename),
      source_type: 'file',
      ...fileFields(filename, size),
      status: 'pending_upload',
      chunk_count: 0,
      embedded_count: 0,
      token_count: 0,
      created_at: now,
      updated_at: now,
      content: '',
      sha256,
      ...articleFields({ ...c.body, title: undefined, content: undefined, filename: undefined, size: undefined, sha256: undefined }, true),
    } as MockDoc);
  if (!existing) c.db.documents.push(d);
  return created(uploadOut(d, d.id));
});

/* Suggestions learned from closed tickets (v2) ------------------------ */

/**
 * A closed ticket a person answered becomes a suggestion when its bot learns from tickets. The real API
 * has a model write it a few minutes later; here it is the team's last answer, at once.
 */
function learnFrom(c: Ctx, t: MockTicket) {
  const ws = c.db.workspaces.find((w) => w.tenant_id === t.tenant_id && w.bot_id === t.bot_id);
  const existing = c.db.suggestions.find((s) => s.ticket_id === t.id);
  if (!ws?.bot.knowledge?.learnFromTickets || (existing && existing.status !== 'ready') || coveredBy(c, t)) return;
  draftFrom(c, t);
}

/** Writes a ticket's draft from its customer's question and the team's last answer, replacing one not yet added. */
function draftFrom(c: Ctx, t: MockTicket) {
  const conv = c.db.conversations.find((x) => x.id === t.conversation_id);
  const answer = conv?.messages.filter((m) => m.author === 'agent' && m.content.trim()).at(-1);
  if (!conv || !answer) return undefined;
  const question = conv.messages.find((m) => m.author === 'customer')?.content ?? t.subject;
  const existing = c.db.suggestions.find((s) => s.ticket_id === t.id);
  const now = nowIso();
  const draft = { status: 'ready' as const, title: t.subject.slice(0, 160), content: `**${question.trim()}**\n\n${answer.content.trim()}`, closed_at: t.closed_at, updated_at: now };
  if (existing) return Object.assign(existing, draft);
  const s: MockSuggestion = { id: newId('sug'), tenant_id: t.tenant_id, bot_id: t.bot_id, ticket_id: t.id, conversation_id: conv.id, created_at: now, ...draft };
  c.db.suggestions.push(s);
  return s;
}

const COMMON_WORDS = new Set(['your', 'with', 'from', 'have', 'does', 'what', 'when', 'about', 'there', 'this', 'that', 'order', 'need', 'help', 'want', 'still', 'after']);
/** Four-letter stems of a text's longer words, so "ship" and "shipping" meet. */
const stems = (text: string) =>
  new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !COMMON_WORDS.has(w)).map((w) => w.slice(0, 4)));

/**
 * The article or waiting draft that already covers a ticket. The real API has the model compare the
 * ticket with the closest articles and drafts; here a title sharing a word with the subject does.
 */
function coveredBy(c: Ctx, t: MockTicket) {
  const words = stems(t.subject);
  const shares = (title: string) => [...stems(title)].some((w) => words.has(w));
  const doc = c.db.documents.find((d) => d.tenant_id === t.tenant_id && d.bot_id === t.bot_id && d.status === 'indexed' && shares(d.title));
  if (doc) return { title: doc.title, extra: { document_id: doc.id } };
  const draft = c.db.suggestions.find((s) => s.tenant_id === t.tenant_id && s.bot_id === t.bot_id && s.status === 'ready' && s.ticket_id !== t.id && shares(s.title));
  if (draft) return { title: draft.title, extra: { suggestion_id: draft.id } };
  return undefined;
}

// A person trains the bot from one ticket, whether or not it learns on its own or the ticket is closed.
route('POST', '/tickets/:id/learn', 'knowledge.write', (c) => {
  const t = findTicket(c);
  if (!t.conversation_id) throw err(400, 'NO_CONVERSATION', 'This ticket has no conversation to learn from.');
  if (c.db.suggestions.some((s) => s.ticket_id === t.id && s.status === 'accepted')) throw err(409, 'SUGGESTION_HANDLED', "This ticket's answer is already in the knowledge base.");
  const conv = c.db.conversations.find((x) => x.id === t.conversation_id);
  if (!conv?.messages.some((m) => m.author === 'agent' && m.content.trim())) throw err(400, 'NOT_ANSWERED', "Reply to the customer first. The bot learns from your team's answers.");
  const cover = coveredBy(c, t);
  if (cover) {
    const what = 'suggestion_id' in cover.extra ? `the draft “${cover.title}”, waiting for review` : `“${cover.title}”`;
    throw err(409, 'ALREADY_COVERED', `Already covered by ${what}. Nothing new to add.`, cover.extra);
  }
  return suggestionOut(c, draftFrom(c, t)!);
});

const suggestionOut = (c: Ctx, { tenant_id: _t, bot_id: _b, ...s }: MockSuggestion) => ({
  ...s,
  ticket_subject: c.db.tickets.find((t) => t.id === s.ticket_id)?.subject ?? '',
});

function findSuggestion(c: Ctx) {
  const s = c.db.suggestions.find((x) => x.id === c.params.id && x.tenant_id === c.tenant.id && x.bot_id === c.botId);
  if (!s) throw err(404, 'SUGGESTION_NOT_FOUND', 'No knowledge suggestion has this ID. Refresh the list.');
  if (s.status !== 'ready') throw err(409, 'SUGGESTION_HANDLED', 'Someone already added or dismissed this suggestion. Refresh the list.');
  return s;
}

route('GET', '/knowledge/suggestions', 'knowledge.read', (c) => ({
  data: c.db.suggestions
    .filter((s) => s.tenant_id === c.tenant.id && s.bot_id === c.botId && s.status === 'ready')
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
    .map((s) => suggestionOut(c, s)),
}));

route('POST', '/knowledge/suggestions/:id/accept', 'knowledge.write', (c) => {
  const s = findSuggestion(c);
  const title = c.body?.title?.trim() ? str(c.body.title.trim(), 'title', 1, 160)! : s.title;
  const content = c.body?.content?.trim() ? str(c.body.content, 'content', 1, 50000)! : s.content;
  const dup = botDocs(c).find((d) => d.content.trim() === content.trim());
  if (dup) throw err(409, 'DUPLICATE_DOCUMENT', `This is already in your knowledge base as “${dup.title}”.`, { document_id: dup.id });
  requireLimit(c.tenant, 'documents_per_bot', botDocs(c).length);
  const now = nowIso();
  const d: MockDoc = {
    id: newId('doc'),
    tenant_id: c.tenant.id,
    bot_id: c.botId,
    title,
    content,
    source_type: 'ticket',
    source_name: s.ticket_id,
    byte_size: 0,
    status: 'processing',
    chunk_count: 0,
    embedded_count: 0,
    token_count: 0,
    created_at: now,
    updated_at: now,
  };
  indexText(d);
  c.db.documents.push(d);
  bumpKb(c);
  Object.assign(s, { status: 'accepted', title, content, document_id: d.id, updated_at: now });
  return created({ suggestion: suggestionOut(c, s), document: docOut(d) });
});

route('POST', '/knowledge/suggestions/:id/dismiss', 'knowledge.write', (c) => {
  const s = findSuggestion(c);
  Object.assign(s, { status: 'dismissed', updated_at: nowIso() });
  return noContent();
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

/** The store tools: listed for every bot, available while it has an active channel of their platform. */
const BUILT_IN_TOOLS: Pick<Tool, 'name' | 'description' | 'parameters'>[] = [
  {
    name: 'shopify_order_status',
    description: "Look up a Shopify order's payment and fulfillment status, items, total and tracking. Needs the order number and the email the order was placed with.",
    parameters: {
      type: 'object',
      properties: { order_number: { type: 'string', description: 'The order number, e.g. 1001 or #1001' }, email: { type: 'string', description: 'The email the order was placed with' } },
      required: ['order_number', 'email'],
      additionalProperties: false,
    },
  },
  {
    name: 'shopify_product_search',
    description: "Search the store's active products: up to five, with price, stock and link.",
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'What the customer is looking for' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'woocommerce_order_status',
    description: "Look up a WooCommerce order's status, items, total and tracking. Needs the order number and the email the order was placed with.",
    parameters: {
      type: 'object',
      properties: { order_number: { type: 'string', description: 'The order number, e.g. 1001 or #1001' }, email: { type: 'string', description: 'The email the order was placed with' } },
      required: ['order_number', 'email'],
      additionalProperties: false,
    },
  },
  {
    name: 'woocommerce_product_search',
    description: "Search the store's published products: up to five, with price, stock and link.",
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'What the customer is looking for' } }, required: ['query'], additionalProperties: false },
  },
];

/** The platform a built-in tool belongs to: its name's prefix, which is also its channel type. */
const toolPlatform = (name: string) => (name.startsWith('woocommerce_') ? 'woocommerce' : 'shopify');

function builtInTools(c: Ctx): Tool[] {
  const has = (type: string) => botChannels(c).some((x) => x.type === type && x.enabled && !x.disabled_by_platform);
  return BUILT_IN_TOOLS.map((t) => {
    const platform = toolPlatform(t.name);
    const store = has(platform);
    return {
      ...t,
      read_only: true,
      built_in: true,
      available: store,
      unavailable_reason: store ? undefined : `Connect a ${platform === 'woocommerce' ? 'WooCommerce' : 'Shopify'} store to this bot.`,
      api: { method: 'GET', url: '', created_at: '', updated_at: '' },
    };
  });
}

function runBuiltIn(name: string, args: Record<string, unknown>): ToolRun {
  const started = 140 + Math.round(Math.random() * 300);
  if (name === 'woocommerce_order_status') {
    const n = String(args.order_number ?? '').replace(/^#/, '');
    // The demo store has one order: #1001, placed by maya.fernandez@example.com.
    const output =
      n === '1001' && String(args.email ?? '').trim().toLowerCase() === 'maya.fernandez@example.com'
        ? JSON.stringify({ order: '#1001', status: 'completed', total: '84.00 USD', items: [{ title: '12" cast iron skillet', quantity: 1 }], tracking: [{ company: 'UPS', number: '1Z999AA10123456784' }] }, null, 2)
        : 'No order matches that number and email address. Ask the customer to check both.';
    return { name, arguments: args, status: 'ok', output, latency_ms: started };
  }
  if (name === 'shopify_order_status') {
    const n = String(args.order_number ?? '').replace(/^#/, '');
    // The demo store has one order: #1001, placed by maya.fernandez@example.com.
    const output =
      n === '1001' && String(args.email ?? '').trim().toLowerCase() === 'maya.fernandez@example.com'
        ? JSON.stringify({ order: '#1001', financial_status: 'paid', fulfillment_status: 'fulfilled', total: '84.00 USD', items: [{ name: '12" cast iron skillet', quantity: 1 }], tracking: [{ company: 'UPS', number: '1Z999AA10123456784' }] }, null, 2)
        : 'No order matches that order number and email.';
    return { name, arguments: args, status: 'ok', output, latency_ms: started };
  }
  const q = String(args.query ?? '').toLowerCase();
  const base = name === 'woocommerce_product_search' ? 'https://demo-store.example.com/product' : 'https://demo-store.myshopify.com/products';
  const products = [
    { title: '12" cast iron skillet', price: '84.00 USD', in_stock: true, url: `${base}/skillet-12` },
    { title: 'Enamel dutch oven', price: '129.00 USD', in_stock: false, url: `${base}/dutch-oven` },
  ].filter((p) => !q || p.title.toLowerCase().split(/\W+/).some((w) => w && q.includes(w)));
  return { name, arguments: args, status: 'ok', output: JSON.stringify({ products }, null, 2), latency_ms: started };
}

const isBuiltIn = (name: unknown) => BUILT_IN_TOOLS.some((t) => t.name === name);

function toolInput(c: Ctx, b: any) {
  const name = str(b.name, 'name', 1, 64)!;
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) throw err(400, 'INVALID_TOOL', 'name must match ^[a-z][a-z0-9_]{0,63}$.');
  if (name.startsWith('shopify_') || name.startsWith('woocommerce_')) throw err(400, 'INVALID_TOOL', `Names starting with ${name.startsWith('shopify_') ? 'shopify_' : 'woocommerce_'} are kept for built-in tools.`);
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
  data: [...builtInTools(c), ...tenantTools(c).sort((a, b) => a.name.localeCompare(b.name)).map(toolOut)],
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

route('GET', '/tools/:name', 'tools.read', (c) => builtInTools(c).find((t) => t.name === c.params.name) ?? toolOut(findTool(c)));

route('PUT', '/tools/:name', 'tools.write', (c) => {
  if (isBuiltIn(c.params.name)) throw err(400, 'INVALID_TOOL', "Built-in tools can't be changed.");
  const t = findTool(c);
  const i = toolInput(c, c.body);
  if (i.name !== t.name && tenantTools(c).some((x) => x.name === i.name)) throw err(409, 'TOOL_EXISTS', `A tool named ${i.name} exists.`);
  Object.assign(t, { name: i.name, description: i.description, parameters: i.parameters, read_only: i.read_only });
  t.api = { ...t.api, method: i.method, url: i.url, updated_at: nowIso() };
  return toolOut(t);
});

route('DELETE', '/tools/:name', 'tools.write', (c) => {
  if (isBuiltIn(c.params.name)) throw err(400, 'INVALID_TOOL', "Built-in tools can't be deleted.");
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
  const built = builtInTools(c).find((t) => t.name === c.params.name);
  if (built) {
    if (!built.available) throw err(400, 'TOOL_UNAVAILABLE', built.unavailable_reason!);
    return runBuiltIn(built.name, c.body?.arguments ?? {});
  }
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
  if (b.keep_open !== undefined && typeof b.keep_open !== 'boolean') throw invalid('keep_open must be true or false.');
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
    keep_open: Boolean(b.keep_open),
    created_at: now,
    updated_at: now,
  };
  if (conv) conv.status = 'open';
  c.db.tickets.push(t);
  if (t.escalated) addNotice(c, t, 'joined');
  emitTicket(c, t, 'ticket.created');
  return created(ticketOut(c.db, t));
});

route('GET', '/tickets/:id', 'tickets.read', (c) => {
  const t = findTicket(c);
  const conv = c.db.conversations.find((x) => x.id === t.conversation_id);
  const mode = imageMode();
  const firstCustomer = (conv?.messages ?? []).find((m) => m.author === 'customer');
  const messages = (conv?.messages ?? []).slice(-200).map((m) => {
    const withPicture = (mode === 'on' || mode === 'on-expired') && m === firstCustomer && !(m as any).attachments?.length;
    const picture = [{ id: `att_${t.id.replace(/\W/g, '').padEnd(32, '0').slice(0, 32)}`, content_type: 'image/jpeg', width: 640, height: 480, size: 48_000, thumb: SAMPLE_PICTURE }];
    return withSignedPictures(withPicture ? ({ ...m, attachments: picture } as any) : m);
  });
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
  const wasEscalated = t.escalated;
  if (b.subject !== undefined) t.subject = str(b.subject, 'subject', 1, 200)!;
  if (b.priority !== undefined) {
    if (!['low', 'normal', 'high', 'urgent'].includes(b.priority)) throw invalid('Unknown priority.');
    t.priority = b.priority;
  }
  if (b.status !== undefined) applyStatus(t, b.status);
  if (t.status === 'closed') learnFrom(c, t);
  if (b.keep_open !== undefined) {
    if (typeof b.keep_open !== 'boolean') throw invalid('keep_open must be true or false.');
    t.keep_open = b.keep_open;
  }
  if (t.status === 'open') t.auto_closed_at = undefined;
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
  // Said once, when the conversation really changes hands (closing hands it back too).
  if (!wasEscalated && t.escalated) addNotice(c, t, 'joined');
  else if (wasEscalated && !t.escalated) addNotice(c, t, 'handed_back');
  t.updated_at = nowIso();
  emitTicket(c, t, 'ticket.updated');
  const { tenant_id: _t, bot_id: _b, ...out } = ticketOut(c.db, t) as any;
  return out;
});

route('DELETE', '/tickets/:id', 'tickets.delete', (c) => {
  const t = findTicket(c);
  c.db.tickets = c.db.tickets.filter((x) => x !== t);
  delete c.db.replies[t.id];
  c.db.suggestions = c.db.suggestions.filter((s) => s.ticket_id !== t.id);
  emit(t.tenant_id, t.bot_id, 'ticket.updated', { ticket: { id: t.id }, deleted: true });
  return noContent();
});

route('POST', '/tickets/:id/replies', 'tickets.write', (c) => {
  const t = findTicket(c);
  const kind = c.body.kind === 'note' ? 'note' : 'reply';
  const content = str(c.body.content, 'content', 1, 8000)!;
  const now = nowIso();
  // A reply needs the conversation taken over first, so the person and the assistant don't answer side by side.
  if (kind === 'reply' && t.conversation_id && t.status === 'open' && !t.escalated) {
    throw err(409, 'TAKE_OVER_REQUIRED', "The assistant is still answering this conversation. Take it over (PATCH escalated: true) before replying; internal notes don't need it.");
  }
  const wasEscalated = t.escalated;
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
  if (t.status === 'closed') learnFrom(c, t);
  // Closing with a reply hands the conversation back after the reply.
  if (wasEscalated && !t.escalated) addNotice(c, t, 'handed_back');
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
    web_searches: (() => {
      if (!ws?.bot.webSearch?.enabled) return { searches: 0, with_results: 0, errors: 0, skipped: 0, avg_latency_ms: 0 };
      const searches = Math.round(requests * (ws.bot.webSearch.mode === 'always' ? 0.9 : 0.06));
      return {
        searches,
        with_results: Math.round(searches * 0.86),
        errors: Math.round(searches * 0.01),
        skipped: limitsOf(c.tenant).web_search ? 0 : searches,
        avg_latency_ms: Math.round(820 + r() * 260),
      };
    })(),
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
    const dayR = rng(hashString(`${date}${scope}`));
    return {
      date,
      conversations: conv,
      tickets_created: dayTickets.length + Math.round(conv * 0.04),
      tickets_closed: tickets.filter((t) => t.closed_at?.slice(0, 10) === date).length + Math.round(conv * 0.035),
      ticket_cost: +(dayTickets.length * 0.0011 + conv * 0.00004).toFixed(4),
      ai_replies: Math.round(conv * (2.4 + dayR() * 0.4)),
      ai_reply_seconds: conv ? +(2.4 + dayR() * 1.4).toFixed(1) : 0,
    };
  });
  const total = by_day.reduce((n, d) => n + d.conversations, 0);
  const aiReplies = by_day.reduce((n, d) => n + d.ai_replies, 0);
  const avgReply = aiReplies ? by_day.reduce((n, d) => n + d.ai_reply_seconds * d.ai_replies, 0) / aiReplies : 0;
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
    ai_replies: { total: aiReplies, per_conversation: total ? aiReplies / total : 0 },
    ai_reply_time: { count: aiReplies, avg_seconds: +avgReply.toFixed(1), median_seconds: +(avgReply * 0.85).toFixed(1), p90_seconds: +(avgReply * 1.9).toFixed(1) },
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

/* Plan subscription (Paddle). The mock skips the overlay: starting checkout begins the trial at once. */

const isCheckoutPlan = (v: unknown): v is CheckoutPlan => v === 'starter' || v === 'pro';
const isBillingInterval = (v: unknown): v is BillingInterval => v === 'monthly' || v === 'yearly';
const TRIAL_MS = 7 * 24 * 3600 * 1000;

// Like the API with the trial guard enforcing: a business that has had a subscription gets no second trial.
route('GET', '/billing/subscription', 'usage.read', (c) => ({ subscription: c.tenant.subscription ?? null, trial_eligible: !c.tenant.subscription }));

route('POST', '/billing/checkout', 'billing.write', (c) => {
  const { plan, interval } = c.body ?? {};
  if (!isCheckoutPlan(plan) || !isBillingInterval(interval)) throw invalid('plan must be starter or pro, interval monthly or yearly.');
  if (c.tenant.subscription && c.tenant.subscription.status !== 'canceled') throw err(409, 'SUBSCRIPTION_EXISTS', 'This business already has a subscription. Change it from Plan & usage.');
  const trialEnd = new Date(Date.now() + TRIAL_MS).toISOString();
  c.tenant.subscription = { status: 'trialing', plan, interval, trial_ends_at: trialEnd, current_period_end: trialEnd, cancel_at: null };
  c.tenant.plan = plan;
  audit(c, 'billing.subscription_started', c.tenant.id, { plan, interval });
  return { transaction_id: newId('txn') };
});

route('POST', '/billing/subscription/change', 'billing.write', (c) => {
  const { plan, interval } = c.body ?? {};
  const sub = c.tenant.subscription;
  if (!sub || sub.status === 'canceled') throw err(404, 'NO_SUBSCRIPTION', 'This business has no subscription to change.');
  if (!isCheckoutPlan(plan) || !isBillingInterval(interval)) throw invalid('plan must be starter or pro, interval monthly or yearly.');
  sub.plan = plan;
  sub.interval = interval;
  c.tenant.plan = plan;
  audit(c, 'billing.subscription_changed', c.tenant.id, { plan, interval });
  return { subscription: sub };
});

route('POST', '/billing/portal', 'billing.write', () => ({ url: 'https://sandbox-customer-portal.paddle.com/' }));

/* Image input (planned) --------------------------------------------- */

/**
 * The mock serves image input only when asked to, so by default it behaves like
 * the API today: the config route and the registration route are 404 and
 * `attachments` is an unknown field. Pick a mode in the console with
 * `localStorage.setItem('truplexy.mock.imageInput', 'on')`, or build with
 * VITE_MOCK_IMAGE_INPUT:
 *
 * - `off`        the API predates the feature (default)
 * - `on`         enabled, with the contract's limits
 * - `plan`       enabled: false, reason "plan"
 * - `no_vision`  enabled: false, reason "no_vision_model"
 * - `on-expired` like `on`, but the first link handed out for each picture is already dead
 *
 * One-shot failures, to see each error: `localStorage.setItem('truplexy.mock.imageFail', code)` with
 * not_found, not_uploaded, invalid, too_large or unsupported; the next send that carries pictures
 * fails that way. `localStorage.setItem('truplexy.mock.imageFlaky', '1')` drops the first PUT of each file.
 */
export type MockImageMode = 'off' | 'on' | 'plan' | 'no_vision' | 'on-expired';
const IMAGE_MODES: readonly string[] = ['off', 'on', 'plan', 'no_vision', 'on-expired'];

export function imageMode(): MockImageMode {
  try {
    const v = localStorage.getItem('truplexy.mock.imageInput');
    if (v && IMAGE_MODES.includes(v)) return v as MockImageMode;
  } catch {
    /* no storage */
  }
  const v = String(import.meta.env.VITE_MOCK_IMAGE_INPUT ?? '');
  return IMAGE_MODES.includes(v) ? (v as MockImageMode) : 'off';
}

const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_MAX_PER_MESSAGE = 3;
const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const HOUR = 3_600_000;

export interface MockRegisteredImage {
  tenant: string;
  bot: string;
  content_type: string;
  at: number;
  /** Set once the PUT lands: what the server would have read from the file. */
  uploaded?: { thumb: string; width: number; height: number; size: number };
}

/** Pictures registered and not yet sent. In memory only: a reload forgets them, like a registration that expired. */
export const pendingImages = new Map<string, MockRegisteredImage>();

function imageConfig(m: MockImageMode) {
  return {
    enabled: m === 'on' || m === 'on-expired',
    ...(m === 'plan' && { reason: 'plan' }),
    ...(m === 'no_vision' && { reason: 'no_vision_model' }),
    max_bytes: IMAGE_MAX_BYTES,
    max_per_message: IMAGE_MAX_PER_MESSAGE,
    content_types: PICTURE_TYPES,
  };
}

/** What a plan without pictures, or a server without a vision model, answers on every picture call. */
function requireImageInput(m: MockImageMode) {
  if (m === 'off') throw err(404, 'NOT_FOUND', 'No such route.');
  if (m === 'plan') throw err(403, 'PLAN_LIMIT_REACHED', "This business's plan doesn't include picture input.", { limit: 'image_input' });
  if (m === 'no_vision') throw err(400, 'FEATURE_UNAVAILABLE', 'No active model can read pictures.');
}

route('GET', '/playground/attachments/config', 'playground.run', () => {
  const m = imageMode();
  if (m === 'off') throw err(404, 'NOT_FOUND', 'No such route.');
  return imageConfig(m);
});

route('POST', '/playground/attachments', 'playground.run', (c) => {
  const m = imageMode();
  requireImageInput(m);
  const b = c.body ?? {};
  const allowed = ['filename', 'content_type', 'size', 'sha256'];
  const extra = Object.keys(b).find((k) => !allowed.includes(k));
  if (extra) throw invalid(`Unknown field: ${extra}.`);
  const filename = str(b.filename, 'filename', 1, 260)!;
  if (filename.includes('/') || filename.includes('\\')) throw invalid('filename must not contain slashes.');
  if (!/\.(jpe?g|png|webp)$/i.test(filename)) throw invalid('filename must end in .jpg, .jpeg, .png or .webp.');
  if (!PICTURE_TYPES.includes(b.content_type)) throw err(400, 'UNSUPPORTED_IMAGE_TYPE', 'Use a JPEG, PNG or WebP picture.');
  if (!Number.isInteger(b.size) || b.size < 1) throw invalid('size must be a whole number of bytes, at least 1.');
  if (b.size > IMAGE_MAX_BYTES) throw err(413, 'IMAGE_TOO_LARGE', 'Pictures can be at most 20 MB.');
  if (!/^[0-9a-f]{64}$/.test(b.sha256 ?? '')) throw invalid('sha256 must be 64 lowercase hex characters.');
  const id = newId('att');
  pendingImages.set(id, { tenant: c.tenant.id, bot: c.botId, content_type: b.content_type, at: Date.now() });
  return created({
    attachment: { id, status: 'pending', filename, content_type: b.content_type, size: b.size },
    url: `mock://r2/${id}`,
    method: 'PUT',
    headers: { 'Content-Type': b.content_type },
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
});

interface MockStoredPicture {
  id: string;
  content_type: 'image/jpeg';
  width: number;
  height: number;
  size: number;
  /** The mock's stand-in for the stored file; turned into a signed `url` when read. */
  thumb: string;
}

/** The one-shot failure asked for in the console, if any. */
function takeImageFailure(): string | null {
  try {
    const v = localStorage.getItem('truplexy.mock.imageFail');
    if (v) localStorage.removeItem('truplexy.mock.imageFail');
    return v;
  } catch {
    return null;
  }
}

/** Validates the pictures of a message the way the server does when it arrives, then uses them up. */
function takePictures(c: Ctx, ids: unknown): MockStoredPicture[] {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > IMAGE_MAX_PER_MESSAGE || new Set(ids).size !== ids.length) {
    throw invalid(`attachments must be 1–${IMAGE_MAX_PER_MESSAGE} distinct attachment IDs.`);
  }
  if (ids.some((id) => typeof id !== 'string' || !/^att_[0-9a-f]{32}$/.test(id))) throw invalid('attachments must be attachment IDs (att_…).');
  const rows = (ids as string[]).map((id) => ({ id, reg: pendingImages.get(id) }));
  const fail = takeImageFailure();
  if (fail === 'not_found') {
    for (const row of rows) {
      pendingImages.delete(row.id);
      row.reg = undefined;
    }
  }
  for (const { id, reg } of rows) {
    if (!reg || reg.tenant !== c.tenant.id || reg.bot !== c.botId || Date.now() - reg.at > HOUR) {
      pendingImages.delete(id);
      throw err(404, 'ATTACHMENT_NOT_FOUND', 'That attachment does not exist, was already sent, or expired. Register it again.');
    }
  }
  if (fail === 'not_uploaded' || rows.some(({ reg }) => !reg!.uploaded)) throw err(409, 'ATTACHMENT_NOT_UPLOADED', 'A picture has not finished uploading. Finish the upload, then send again.');
  // The picture itself is read here, so a bad file fails now, before anything is stored. The failed attachment can't be reused.
  const burn = () => pendingImages.delete(rows[0]!.id);
  if (fail === 'unsupported') {
    burn();
    throw err(400, 'UNSUPPORTED_IMAGE_TYPE', 'The file is not a JPEG, PNG or WebP picture.');
  }
  if (fail === 'too_large') {
    burn();
    throw err(413, 'IMAGE_TOO_LARGE', 'The picture can not be shrunk under 1 MiB without ruining it.');
  }
  if (fail === 'invalid') {
    burn();
    throw err(400, 'INVALID_IMAGE', 'The file can not be read as a picture.');
  }
  for (const { id, reg } of rows) {
    const u = reg!.uploaded!;
    if (!u.width || !u.height) {
      pendingImages.delete(id);
      throw err(400, 'INVALID_IMAGE', 'The file can not be read as a picture.');
    }
    if (Math.min(u.width, u.height) < 8 || Math.max(u.width, u.height) > 16_384) {
      pendingImages.delete(id);
      throw err(400, 'INVALID_IMAGE', 'The picture must be 8–16,384 pixels on each side.');
    }
  }
  return rows.map(({ id, reg }) => {
    pendingImages.delete(id);
    const u = reg!.uploaded!;
    const k = Math.min(1, 1280 / Math.max(u.width, u.height));
    return { id, content_type: 'image/jpeg', width: Math.round(u.width * k), height: Math.round(u.height * k), size: Math.min(u.size, 1024 * 1024), thumb: u.thumb };
  });
}

/** Links already handed out once, for `on-expired`. */
const linked = new Set<string>();

/** Turns a stored message into what the API returns: pictures with a signed link, or none at all while the feature is off. */
function withSignedPictures<T extends { attachments?: any[] }>(m: T): T {
  const mode = imageMode();
  const { attachments, ...rest } = m as any;
  if (!attachments?.length || mode === 'off') return rest;
  return {
    ...rest,
    attachments: attachments.map(({ thumb, ...a }: MockStoredPicture) => {
      const dead = mode === 'on-expired' && !linked.has(a.id);
      linked.add(a.id);
      return { ...a, url: dead ? 'data:image/webp;base64,' : thumb, url_expires_at: new Date(Date.now() + (dead ? -60_000 : HOUR)).toISOString() };
    }),
  };
}

/** A stand-in picture for ticket conversations, so the ticket view has something to show while image input is on. */
const SAMPLE_PICTURE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect width="640" height="480" fill="url(#g)"/><text x="320" y="250" font-family="sans-serif" font-size="34" fill="#fff" text-anchor="middle">Sample picture</text></svg>',
  );

route('GET', '/playground/conversations/current', 'playground.run', (c) => {
  const conv = c.db.playground[pgKey(c)];
  return { conversation: conv ? { ...conv, messages: conv.messages.map(withSignedPictures) } : null };
});

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
  // `model` is ignored; `temperature` and `rag_top_k` are honoured only for platform admins.
  const temperature: number | undefined = c.user.platform_admin ? b.temperature : undefined;
  const topK: number = c.user.platform_admin && b.rag_top_k ? b.rag_top_k : 4;

  if (b.attachments !== undefined) {
    const m = imageMode();
    if (m === 'off') throw invalid('Unknown field: attachments.');
    requireImageInput(m);
    if (b.resend) throw invalid('attachments is not allowed with resend.');
  }
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
    str(message, 'message', b.attachments === undefined ? 1 : 0, 4000);
  }
  // A picture error happens before anything is stored or any tokens are spent.
  const pictures = b.attachments === undefined ? [] : takePictures(c, b.attachments);

  const lower = message.toLowerCase();
  // Routing: fast for small talk and requests for a person, advanced for multi-part questions, balanced otherwise.
  const thanks = /^\s*(thanks?|thank you|thx|ty|ok(ay|ei)?|cool|great|perfect|got it|all done|no worries|my bad|okei my bad)[\s\S]{0,30}$|^[\s\p{Extended_Pictographic}]+$/iu.test(message);
  const tier = thanks || /(human|person|agent|someone real|manager)/.test(lower) || message.trim().split(/\s+/).length < 3 ? 'fast' : (message.match(/\?/g) ?? []).length > 1 || /(compare|versus|vs\.?|difference between)/.test(lower) ? 'advanced' : 'balanced';
  const model =
    c.db.models.filter((m) => m.status === 'active' && m.routing_tier === tier).sort((a, b) => a.sort_order - b.sort_order)[0] ?? c.db.models.find((m) => m.is_default)!;
  const r = rng(hashString(message + model.id + (temperature ?? '')));
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
  const { selected } = rag && !thanks ? retrieve(c.db, c.tenant.id, c.botId, message, topK) : { selected: [] };
  let sources: Source[] | null = rag && !thanks ? selected.map((x) => ({ document_id: x.s.doc.id, title: x.s.doc.title, section: x.s.heading, url: x.s.doc.source_url, score: +(0.5 + x.score / 2).toFixed(2) })) : null;
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
  if (pictures.length) {
    const seen = pictures.map((p) => `${p.width}×${p.height}`).join(', ');
    status = 'answered';
    output = message.trim()
      ? `I looked at your ${pictures.length > 1 ? `${pictures.length} pictures` : 'picture'} (${seen}). ${output}`
      : `Thanks for the ${pictures.length > 1 ? 'pictures' : 'picture'} (${seen}). What would you like to know about ${pictures.length > 1 ? 'them' : 'it'}?`;
  }
  if (b.max_output_tokens < 40) output = output.split(' ').slice(0, Math.max(3, b.max_output_tokens)).join(' ') + '…';

  const usage = { input_tokens: 1400 + Math.floor(r() * 900) + selected.length * 220 + pictures.length * 760, output_tokens: Math.ceil(output.length / 4), total_tokens: 0, cost: 0 };
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
      temperature: temperature ?? null,
    };
  }

  if (conv) {
    const user: PlaygroundMessage = { id: newId('msg'), role: 'user', content: message, ...(pictures.length && { attachments: pictures as any }), created_at: now };
    const reply: PlaygroundMessage = { id: newId('msg'), role: 'assistant', content: output, model: model.id, usage, status, sources, tool_calls, latency_ms: latency, created_at: now };
    if (!b.resend) conv.messages.push(user);
    conv.messages.push(reply);
    conv.updated_at = now;
    result.conversation_id = conv.id;
    result.user_message = withSignedPictures(user);
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
      if (k === 'web_search') {
        if (typeof v !== 'boolean') throw invalid('web_search must be true or false.');
        out.web_search = v;
        continue;
      }
      if (k === 'image_input') {
        if (typeof v !== 'boolean') throw invalid('image_input must be true or false.');
        out.image_input = v;
        continue;
      }
      if (!['bots', 'documents_per_bot', 'members', 'replies_per_month', 'tokens_per_month', 'web_searches_per_month'].includes(k)) throw invalid(`Unknown limit ${k}.`);
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

/* Accounts ------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const userStatus = (u: MockUser) => u.status ?? 'active';

function userOut(db: MockDb, u: MockUser) {
  const { avatar_url: _a, ...rest } = u;
  return {
    ...rest,
    status: userStatus(u),
    memberships: db.memberships
      .filter((m) => m.user_id === u.id && !db.tenants.find((t) => t.id === m.tenant_id)?.deleted_at)
      .map((m) => ({ tenant_id: m.tenant_id, tenant_name: db.tenants.find((t) => t.id === m.tenant_id)?.name ?? m.tenant_id, role: m.role })),
  };
}

function platformUser(c: Ctx) {
  const u = userById(c.db, c.params.id!);
  if (!u) throw notFound('USER_NOT_FOUND', 'User');
  return u;
}

const activeAdmins = (db: MockDb) => db.users.filter((u) => u.platform_admin && userStatus(u) === 'active');

/** Businesses the person is the only owner of: they block deleting them. */
const soleOwnerOf = (db: MockDb, userId: string) =>
  db.memberships
    .filter((m) => m.user_id === userId && m.role === 'owner')
    .filter((m) => db.memberships.filter((x) => x.tenant_id === m.tenant_id && x.role === 'owner').length === 1)
    .map((m) => db.tenants.find((t) => t.id === m.tenant_id))
    .filter((t): t is MockTenant => Boolean(t && !t.deleted_at))
    .map((t) => ({ id: t.id, name: t.name }));

route('GET', '/platform/users', 'platform', ({ db, query }) => {
  const q = (query.get('q') ?? '').toLowerCase();
  const status = query.get('status');
  const admin = query.get('platform_admin');
  const limit = Math.min(100, Math.max(1, Number(query.get('limit') ?? 100)));
  const start = Number(query.get('cursor') ?? 0);
  const list = db.users
    .filter((u) => (status === 'all' ? true : status ? userStatus(u) === status : userStatus(u) !== 'deleted'))
    .filter((u) => admin === null || u.platform_admin === (admin === 'true'))
    .filter((u) => !q || `${u.email} ${u.name}`.toLowerCase().includes(q))
    .sort((a, b) => (b.last_seen_at ?? '').localeCompare(a.last_seen_at ?? ''));
  return {
    data: list.slice(start, start + limit).map((u) => userOut(db, u)),
    next_cursor: start + limit < list.length ? String(start + limit) : undefined,
  };
});

route('POST', '/platform/users', 'platform', (c) => {
  const b = c.body ?? {};
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw invalid('email must be an email address.');
  if (c.db.users.some((u) => u.email.toLowerCase() === email)) throw err(409, 'EMAIL_TAKEN', 'Another account has this email address.');
  const name = b.name === undefined ? '' : str(b.name, 'name', 0, 80)!;
  const memberships: { tenant_id: string; role: Role }[] = b.memberships ?? [];
  if (!Array.isArray(memberships) || memberships.length > 20) throw invalid('memberships holds up to 20 businesses.');
  for (const m of memberships) {
    if (!['owner', 'admin', 'editor', 'agent', 'viewer'].includes(m.role)) throw invalid(`Unknown role ${m.role}.`);
    if (!c.db.tenants.some((t) => t.id === m.tenant_id && !t.deleted_at)) throw notFound('TENANT_NOT_FOUND', 'Business');
  }
  if (new Set(memberships.map((m) => m.tenant_id)).size !== memberships.length) throw invalid('Each business once.');
  const now = nowIso();
  const u: MockUser = { id: newId('usr'), email, name, platform_admin: Boolean(b.platform_admin), created_at: now, status: 'active' };
  c.db.users.push(u);
  for (const m of memberships) {
    c.db.memberships.push({ tenant_id: m.tenant_id, user_id: u.id, role: m.role, joined_at: now });
    const t = c.db.tenants.find((x) => x.id === m.tenant_id)!;
    audit({ ...c, tenant: t }, 'member.added', u.id, { email, role: m.role });
  }
  audit(c, 'user.created', u.id, { email }, '_platform');
  return created(userOut(c.db, u));
});

route('GET', '/platform/users/:id', 'platform', (c) => {
  const u = platformUser(c);
  const activity = c.db.audit
    .filter((e) => e.actor === u.id)
    .slice(0, 50)
    .map((e) => ({ id: e.id, tenant_id: e.tenant_id, actor: e.actor, action: e.action, target: e.target, created_at: e.created_at }));
  return { ...userOut(c.db, u), activity };
});

route('PATCH', '/platform/users/:id', 'platform', (c) => {
  const u = platformUser(c);
  const b = c.body ?? {};
  if (userStatus(u) === 'deleted') throw notFound('USER_NOT_FOUND', 'User');
  const self = u.id === c.user.id;
  if (self && (b.platform_admin === false || b.disabled === true)) throw err(409, 'OWN_ACCESS', "Nobody can disable or remove platform admin from their own account.");
  if (b.name !== undefined) u.name = str(b.name, 'name', 0, 80)!;
  if (b.email !== undefined) {
    const email = String(b.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw invalid('email must be an email address.');
    if (c.db.users.some((x) => x !== u && x.email.toLowerCase() === email)) throw err(409, 'EMAIL_TAKEN', 'Another account has this email address.');
    u.email = email;
  }
  const losesAdmin = (b.platform_admin === false || b.disabled === true) && u.platform_admin && userStatus(u) === 'active';
  if (losesAdmin && activeAdmins(c.db).length <= 1) throw err(409, 'LAST_PLATFORM_ADMIN', 'The platform keeps one active platform admin.');
  if (b.platform_admin !== undefined && Boolean(b.platform_admin) !== u.platform_admin) {
    u.platform_admin = Boolean(b.platform_admin);
    audit(c, u.platform_admin ? 'platform_admin.granted' : 'platform_admin.revoked', u.id, { email: u.email }, '_platform');
  }
  if (b.disabled !== undefined && Boolean(b.disabled) !== (userStatus(u) === 'disabled')) {
    u.status = b.disabled ? 'disabled' : 'active';
    u.disabled_at = b.disabled ? nowIso() : undefined;
    audit(c, b.disabled ? 'user.disabled' : 'user.enabled', u.id, { email: u.email }, '_platform');
  }
  if (b.name !== undefined || b.email !== undefined) audit(c, 'user.updated', u.id, { email: u.email }, '_platform');
  return userOut(c.db, u);
});

route('DELETE', '/platform/users/:id', 'platform', (c) => {
  const u = platformUser(c);
  if (userStatus(u) === 'deleted') throw notFound('USER_NOT_FOUND', 'User');
  if (u.id === c.user.id) throw err(409, 'OWN_ACCESS', "You can't delete your own account.");
  if (u.platform_admin && userStatus(u) === 'active' && activeAdmins(c.db).length <= 1) throw err(409, 'LAST_PLATFORM_ADMIN', 'The platform keeps one active platform admin.');
  const sole = soleOwnerOf(c.db, u.id);
  if (sole.length) throw err(409, 'SOLE_OWNER', 'This person is the only owner of a business.', { tenants: sole });
  for (const m of c.db.memberships.filter((x) => x.user_id === u.id)) {
    const t = c.db.tenants.find((x) => x.id === m.tenant_id);
    if (t) audit({ ...c, tenant: t }, 'member.removed', u.id, { email: u.email });
  }
  c.db.memberships = c.db.memberships.filter((m) => m.user_id !== u.id);
  for (const t of c.db.tickets.filter((x) => x.assignee_user_id === u.id && x.status === 'open')) {
    t.assignee_user_id = undefined;
    t.assignee_name = undefined;
  }
  for (const i of c.db.invites.filter((x) => x.email.toLowerCase() === u.email.toLowerCase() && x.status === 'pending')) i.status = 'revoked';
  u.email = `deleted+${u.id}@invalid`;
  u.name = '';
  u.platform_admin = false;
  u.status = 'deleted';
  u.deleted_at = nowIso();
  audit(c, 'user.deleted', u.id, null, '_platform');
  return noContent();
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

/* Performance -------------------------------------------------------- */

/** Replies per day: the bot's model requests, which is what a reply costs. */
const replyDays = (days: string[], bots: { tenant: string; bot: string }[]) =>
  days.map((date) => ({ date, replies: bots.reduce((n, b) => n + usageDay(b.tenant, b.bot, date).requests, 0) }));

route('GET', '/platform/performance', 'platform', ({ db, query }): PerformanceStats => {
  const mode = performanceMode();
  if (mode === 'off') throw err(404, 'NOT_FOUND', 'Route not found.');
  if (query.has('scope')) throw invalid('This endpoint takes no scope.');
  const { from, to, days } = rangeOf(query);
  const perTenant = db.tenants
    .filter((t) => !t.deleted_at)
    .map((t) => ({ tenant_id: t.id, name: t.name, bots: db.bots.filter((b) => b.tenant_id === t.id).map((b) => ({ tenant: t.id, bot: b.id })) }));
  const all = perTenant.flatMap((t) => t.bots);
  return buildPerformance({
    from,
    to,
    scope: 'platform',
    mode,
    days: replyDays(days, all),
    tenants: perTenant.map((t) => ({ tenant_id: t.tenant_id, name: t.name, replies: replyDays(days, t.bots).reduce((n, d) => n + d.replies, 0) })),
  });
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

/** The server's LLM_VISION_MODEL in the demo. */
const ENV_VISION_MODEL = 'google/gemini-3.1-flash-lite';

function visionSettings(db: MockDb) {
  const value = db.settings.vision_model;
  const effective = value || ENV_VISION_MODEL;
  return { vision_model: { value, default: ENV_VISION_MODEL, effective, source: value ? 'console' : ENV_VISION_MODEL ? 'env' : 'none' } };
}

route('GET', '/platform/settings', 'platform', ({ db }) => visionSettings(db));

route('PATCH', '/platform/settings', 'platform', ({ db, body }) => {
  if (!body || !('vision_model' in body)) throw invalid('vision_model is required.');
  const id = body.vision_model;
  if (id === null) {
    db.settings.vision_model = '';
    return visionSettings(db);
  }
  if (typeof id !== 'string' || !/^[a-z0-9-]+\/[a-z0-9._:-]+$/i.test(id)) throw invalid('vision_model must be an OpenRouter model ID such as vendor/model, or null.');
  const listed = db.models.find((m) => m.id === id);
  if (listed) {
    if (listed.status === 'retired') throw invalid(`${id} is retired.`);
    if (!listed.supports_vision) throw invalid(`${id} can't read pictures.`);
  } else if (!openRouterModel(id).supports_vision) {
    throw invalid(`${id} can't read pictures.`);
  }
  db.settings.vision_model = id;
  return visionSettings(db);
});

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
    supports_vision: h % 4 !== 0,
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
    supports_vision: false,
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

const channelTypeOut = (db: MockDb, t: MockDb['channelTypes'][number]): PlatformChannelType => ({ ...t, auto_close_hours: t.auto_close_hours ?? null, channels: db.channels.filter((x) => x.type === t.id).length });

function applyChannelType(t: Partial<MockDb['channelTypes'][number]>, b: any) {
  if (b.label !== undefined) t.label = str(b.label, 'label', 1, 80)!;
  if (b.description !== undefined) t.description = str(b.description, 'description', 0, 300)!;
  if (b.icon !== undefined) t.icon = str(b.icon, 'icon', 0, 200)!;
  if (b.status !== undefined) {
    if (!['active', 'hidden', 'upcoming'].includes(b.status)) throw invalid('status must be active, upcoming or hidden.');
    t.status = b.status;
  }
  if (b.sort_order !== undefined) {
    if (!Number.isInteger(b.sort_order) || Math.abs(b.sort_order) > 10_000) throw invalid('sort_order must be a whole number from -10000 to 10000.');
    t.sort_order = b.sort_order;
  }
  if (b.auto_close_hours !== undefined) t.auto_close_hours = autoCloseHours(b.auto_close_hours, 'auto_close_hours', true);
}

route('GET', '/platform/channel-types', 'platform', ({ db }) => ({
  data: [...db.channelTypes].sort((a, b) => a.sort_order - b.sort_order).map((t) => channelTypeOut(db, t)),
}));

route('POST', '/platform/channel-types', 'platform', (c) => {
  const { db } = c;
  const b = c.body ?? {};
  if (typeof b.id !== 'string' || !CHANNEL_TYPE_ID_RE.test(b.id)) throw invalid('id must be 2–32 lowercase letters, digits, - or _, starting with a letter.');
  if (b.label === undefined) throw invalid('label is required.');
  if (db.channelTypes.some((t) => t.id === b.id)) throw err(409, 'CHANNEL_TYPE_EXISTS', `Channel type ${b.id} exists.`);
  const now = nowIso();
  const t = { id: b.id, label: '', description: '', icon: '', status: 'active', connect: null, sort_order: 0, auto_close_hours: null, created_at: now, updated_at: now } as MockDb['channelTypes'][number];
  applyChannelType(t, b);
  db.channelTypes.push(t);
  audit(c, 'channel_type.create', t.id, { name: t.label }, '_platform');
  return created(channelTypeOut(db, t));
});

route('PATCH', '/platform/channel-types/:id', 'platform', (c) => {
  const { db, params, body } = c;
  const t = db.channelTypes.find((x) => x.id === params.id);
  if (!t) throw notFound('CHANNEL_TYPE_NOT_FOUND', 'Channel type');
  if (body?.id !== undefined && body.id !== t.id) throw invalid("id can't change.");
  applyChannelType(t, body ?? {});
  t.updated_at = nowIso();
  audit(c, 'channel_type.update', t.id, { name: t.label }, '_platform');
  return channelTypeOut(db, t);
});

route('GET', '/platform/channels', 'platform', ({ db, query }) => {
  const status = query.get('status');
  if (status && !['active', 'disabled'].includes(status)) throw invalid('status must be active or disabled.');
  const tenant = query.get('tenant');
  if (tenant && !db.tenants.some((t) => t.id === tenant)) throw invalid('tenant must be a business ID.');
  const type = query.get('type');
  if (type && !CHANNEL_TYPE_ID_RE.test(type)) throw invalid('type must be a channel type id.');
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
  if (typeof c.body?.disabled !== 'boolean') throw invalid('disabled must be true or false.');
  const ch = c.db.channels.find((x) => x.id === c.params.id);
  if (!ch) throw notFound('CHANNEL_NOT_FOUND', 'Channel');
  ch.disabled_by_platform = c.body.disabled;
  ch.updated_at = nowIso();
  audit(c, ch.disabled_by_platform ? 'channel.platform_disabled' : 'channel.platform_enabled', ch.id, { name: ch.name }, ch.tenant_id);
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
  if (r.access !== 'public' && (!user || user.status === 'deleted')) throw err(401, 'UNAUTHORIZED', 'Sign in again.');
  if (r.access !== 'public' && user?.status === 'disabled') throw err(403, 'ACCOUNT_DISABLED', 'A platform admin disabled this account.');

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

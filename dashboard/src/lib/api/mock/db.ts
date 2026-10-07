import type {
  ApiKey,
  AuditEvent,
  BillingAddon,
  BotConfig,
  BusinessTypeId,
  DeletionRequest,
  Invite,
  KnowledgeDocument,
  LedgerEntry,
  Limits,
  PlanId,
  PlatformModel,
  PlatformTemplate,
  PlaygroundConversation,
  Role,
  Ticket,
  TicketMessage,
  TenantDeletion,
  TicketReply,
  Tool,
  Webhook,
  WorkspaceVersion,
} from '@/lib/api/types';

/** The mock API's whole state. Kept in localStorage so a reload keeps your edits. */
export interface MockUser {
  id: string;
  email: string;
  name: string;
  platform_admin: boolean;
  created_at: string;
  last_seen_at?: string;
}

export interface MockTenant {
  id: string;
  name: string;
  business_type: BusinessTypeId;
  plan: PlanId;
  status: 'active' | 'suspended';
  created_at: string;
  reply_target_hours: number;
  limit_overrides: Partial<Limits>;
  replies_this_month: number;
  tokens_this_month: number;
  /** USD. */
  balance: number;
  /** Every extra-token purchase, newest first. */
  addons: BillingAddon[];
  /** Every change to the balance, newest first. */
  ledger: LedgerEntry[];
  /** Set while the business is deleted and not purged yet. */
  deleted_at?: string;
}

export interface MockMembership {
  tenant_id: string;
  user_id: string;
  role: Role;
  joined_at: string;
}

export interface MockBot {
  tenant_id: string;
  id: string;
  name: string;
  kb_version: number;
  created_at: string;
}

/** The stored bot also holds its system prompt, which the API never sends to businesses. */
export type MockBotConfig = BotConfig & { promptTemplateId?: string; promptVariables?: Record<string, string>; prompt?: string };

export interface MockWorkspace {
  tenant_id: string;
  bot_id: string;
  name: string;
  bot: MockBotConfig;
  revision: number;
  updated_at?: string;
  history: (Omit<WorkspaceVersion, 'bot'> & { bot: MockBotConfig })[];
}

/** A catalog model as stored: the effective markup and billed prices are worked out on the way out. */
export type MockModel = Omit<
  PlatformModel,
  'bots' | 'effective_fee_percent' | 'effective_commission_percent' | 'billed_input_price_per_mtok' | 'billed_output_price_per_mtok'
>;

export type MockInvite = Invite & { tenant_id: string; token: string };
export type MockAudit = AuditEvent & { tenant_id: string };
export type MockDoc = KnowledgeDocument & { tenant_id: string; bot_id: string; content: string; sha256?: string };
export type MockTool = Tool & { id: string; tenant_id: string; disabled: boolean; calls: number; errors: number };
export type MockTicket = Omit<Ticket, 'flags' | 'needs_reply'> & { tenant_id: string; bot_id: string };

export interface MockConversation {
  id: string;
  tenant_id: string;
  bot_id: string;
  channel: string;
  title: string;
  status: 'open' | 'handoff';
  created_at: string;
  updated_at: string;
  messages: TicketMessage[];
}

export interface MockDb {
  version: number;
  seededAt: number;
  currentUserId: string;
  users: MockUser[];
  tenants: MockTenant[];
  memberships: MockMembership[];
  invites: MockInvite[];
  bots: MockBot[];
  workspaces: MockWorkspace[];
  apiKeys: ApiKey[];
  audit: MockAudit[];
  documents: MockDoc[];
  tools: MockTool[];
  tickets: MockTicket[];
  conversations: MockConversation[];
  replies: Record<string, TicketReply[]>;
  webhooks: Record<string, Webhook & { secret: string }>;
  models: MockModel[];
  templates: Omit<PlatformTemplate, 'bots'>[];
  playground: Record<string, PlaygroundConversation>;
  deletionRequests: DeletionRequest[];
  /** `restorable` is worked out on the way out. */
  deletions: Omit<TenantDeletion, 'restorable'>[];
}

export const DB_VERSION = 6;
const KEY = 'truplexy.mock.db';

export function loadDb(seed: () => MockDb): MockDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as MockDb;
      // Sample data is relative to when it was made; refresh it daily so it stays current.
      if (db.version === DB_VERSION && Date.now() - db.seededAt < 86_400_000) return db;
    }
  } catch {
    /* corrupt or blocked: start over */
  }
  const db = seed();
  saveDb(db);
  return db;
}

let saveTimer = 0;
export function saveDb(db: MockDb) {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* quota or blocked: the state lives for this page only */
    }
  }, 50);
}

export function clearDb() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const wsKey = (t: string, b: string) => `${t}/${b}`;

export const hex = (n = 32) => Array.from(crypto.getRandomValues(new Uint8Array(n / 2)), (b) => b.toString(16).padStart(2, '0')).join('');
export const newId = (prefix: string) => `${prefix}_${hex(32)}`;
export const nowIso = () => new Date().toISOString();

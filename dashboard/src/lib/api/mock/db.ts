import type {
  ApiKey,
  AuditEvent,
  BotConfig,
  BusinessTypeId,
  Invite,
  KnowledgeDocument,
  Limits,
  PlanId,
  PlatformModel,
  PlatformTemplate,
  PlaygroundConversation,
  Role,
  Ticket,
  TicketMessage,
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

export interface MockWorkspace {
  tenant_id: string;
  bot_id: string;
  name: string;
  bot: BotConfig;
  revision: number;
  updated_at?: string;
  history: WorkspaceVersion[];
}

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
  models: Omit<PlatformModel, 'bots'>[];
  templates: Omit<PlatformTemplate, 'bots'>[];
  playground: Record<string, PlaygroundConversation>;
}

export const DB_VERSION = 3;
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

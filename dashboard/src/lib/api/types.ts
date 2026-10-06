/**
 * Records of the Truplexy API v2, as documented in API_REFERENCE.md.
 * Optional fields (`?`) are the ones the reference marks as sometimes absent.
 */

/* ------------------------------------------------------------------ */
/* Roles and permissions                                               */
/* ------------------------------------------------------------------ */

export type Role = 'owner' | 'admin' | 'editor' | 'agent' | 'viewer';

export type Permission =
  | 'bot.read'
  | 'knowledge.read'
  | 'tools.read'
  | 'tickets.read'
  | 'usage.read'
  | 'members.read'
  | 'playground.run'
  | 'tickets.write'
  | 'bot.write'
  | 'knowledge.write'
  | 'tools.write'
  | 'tickets.delete'
  | 'integrations.read'
  | 'integrations.write'
  | 'bots.create'
  | 'members.write'
  | 'business.write'
  | 'billing.write'
  | 'audit.read'
  | 'owners.manage';

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

export type BusinessTypeId =
  | 'ecommerce'
  | 'saas'
  | 'healthcare'
  | 'real_estate'
  | 'hospitality'
  | 'education'
  | 'professional_services'
  | 'other';

export type PlanId = 'free' | 'starter' | 'pro' | 'enterprise' | (string & {});

export interface BotRef {
  id: string;
  name: string;
}

export interface Membership {
  tenant_id: string;
  name: string;
  business_type: BusinessTypeId;
  plan: PlanId;
  status: 'active' | 'suspended';
  role: Role;
  bots: BotRef[];
}

export interface Me {
  user: { id: string; email: string; name: string };
  platform_admin: boolean;
  memberships: Membership[];
  roles: Record<Role, Permission[]>;
}

export interface BusinessType {
  id: BusinessTypeId;
  label: string;
  description: string;
  assistant_name: string;
  knowledge_topics: string[];
  tool_ideas: string[];
}

export interface Limits {
  bots: number;
  documents_per_bot: number;
  members: number;
  replies_per_month: number;
  tokens_per_month: number;
}

/** The extra-token slider a plan sells. */
export interface TokenAddon {
  /** The first tier's price: what 1M costs. */
  price_per_million: number;
  min_millions: number;
  max_millions: number;
  step_millions: number;
  currency: string;
  tiers: { from_millions: number; price_per_million: number }[];
}

export interface Plan {
  id: PlanId;
  name: string;
  limits: Limits;
  /** Null when the plan sells no extra tokens. */
  token_addon: TokenAddon | null;
}

export interface InvitePreview {
  tenant_id: string;
  business_name: string;
  email: string;
  role: Role;
  expires_at: string;
}

/* ------------------------------------------------------------------ */
/* Business, members, invitations, activity                            */
/* ------------------------------------------------------------------ */

export interface Business {
  id: string;
  name: string;
  business_type: BusinessTypeId;
  plan: PlanId;
  status: 'active' | 'suspended';
  created_at: string;
  reply_target_hours: number;
  limits: Limits;
  limit_overrides: Partial<Limits>;
  usage: { bots: number; members: number; replies_this_month: number; tokens_this_month: number };
  /** USD; see GET /billing. */
  balance: number;
}

export interface Member {
  user_id: string;
  email: string;
  name: string;
  role: Role;
  joined_at: string;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  status: 'pending' | (string & {});
  invited_by: string;
  expires_at: string;
  created_at: string;
  /** Only in the POST /invites response. */
  token?: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  actor_email?: string;
  action: string;
  target: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Bots and keys                                                       */
/* ------------------------------------------------------------------ */

export interface Bot {
  tenant_id: string;
  id: string;
  name: string;
  kb_version: number;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  tenant_id: string;
  bot_id: string;
  key_prefix: string;
  status: 'active' | 'revoked';
  created_at: string;
  last_used_at?: string;
  /** The secret, only in the POST /api-keys response. */
  key?: string;
}

/* ------------------------------------------------------------------ */
/* Bot configuration                                                   */
/* ------------------------------------------------------------------ */

export interface BotConfig {
  name: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  ragEnabled?: boolean;
  topK?: number;
  toolsEnabled?: boolean;
  tools?: string[];
}

export interface WorkspaceVersion {
  id: string;
  savedAt: string;
  bot: BotConfig;
}

export interface Workspace {
  name: string;
  bot: BotConfig;
  revision: number;
  updated_at?: string;
  history: WorkspaceVersion[];
  defaults: { name: string; bot: BotConfig };
}

export type ModelTier = 'economy' | 'standard' | 'premium';

export interface Model {
  id: string;
  label: string;
  description: string;
  tier: ModelTier;
  /** What the business pays per million tokens, fee and commission included. */
  input_price_per_mtok: number;
  output_price_per_mtok: number;
  currency: string;
  context_tokens: number;
  max_output_tokens: number;
  supports_tools: boolean;
  is_default: boolean;
  offered: boolean;
}

export interface TemplateVariable {
  key: string;
  label: string;
  help?: string;
  required: boolean;
  max_length: number;
}

/* ------------------------------------------------------------------ */
/* Knowledge                                                           */
/* ------------------------------------------------------------------ */

export type DocumentStatus = 'pending_upload' | 'processing' | 'indexed' | 'failed';

export interface DocMetadata {
  source_url?: string;
  knowledge_base_id?: string;
  locale?: string;
  product?: string;
  version?: string;
}

export interface KnowledgeDocument extends DocMetadata {
  id: string;
  title: string;
  source_type: 'manual' | 'file';
  source_name?: string;
  mime_type?: string;
  byte_size: number;
  status: DocumentStatus;
  error?: string;
  chunk_count: number;
  embedded_count: number;
  token_count: number;
  created_at: string;
  updated_at: string;
  indexed_at?: string;
  content?: string;
}

export interface DocumentList {
  data: KnowledgeDocument[];
  next_cursor?: string;
  total: number;
  counts: Partial<Record<DocumentStatus, number>>;
  max_documents: number;
  max_file_bytes: number;
  accept: string[] | string;
}

export interface UploadRegistration {
  document: KnowledgeDocument;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expires_at: string;
}

export interface SearchFilters {
  knowledge_base_id?: string;
  locale?: string;
  product?: string;
  version?: string;
}

export interface Passage {
  id: string;
  document_id: string;
  title: string;
  section?: string;
  url?: string;
  content: string;
}

export interface SearchHit {
  id: string;
  document_id: string;
  title: string;
  heading?: string;
  position: number;
  content: string;
  keyword_rank: number | null;
  vector_rank: number | null;
  vector_score: number | null;
  fused_score: number | null;
  rerank_score: number | null;
  selected: boolean;
}

export interface SearchResult {
  result: {
    query: string;
    confidence: 'high' | 'low' | 'none';
    passages: Passage[];
    sources: unknown[];
    context_tokens: number;
    candidates: number;
    fallback: boolean;
    degraded: string[];
  };
  hits: SearchHit[];
  trace: {
    query?: string;
    rewrite?: string;
    stages?: Record<string, unknown>;
    rewrite_ms?: number;
    embed_ms?: number;
    dense_ms?: number;
    lexical_ms?: number;
    load_ms?: number;
    rerank_ms?: number;
    retrieval_ms?: number;
    total_ms?: number;
    [k: string]: unknown;
  };
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface JsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: (string | number)[];
  items?: JsonSchema;
  additionalProperties?: false;
}

export interface Tool {
  name: string;
  description: string;
  parameters: JsonSchema;
  read_only: boolean;
  available: boolean;
  unavailable_reason?: string;
  api: { method: HttpMethod; url: string; created_at: string; updated_at: string };
}

export interface ToolInput {
  name: string;
  description: string;
  method: HttpMethod;
  url: string;
  parameters?: JsonSchema;
  read_only?: boolean;
}

export interface ToolRun {
  name: string;
  arguments: Record<string, unknown>;
  status: 'ok' | 'error';
  output: string;
  latency_ms: number;
}

/* ------------------------------------------------------------------ */
/* Tickets                                                             */
/* ------------------------------------------------------------------ */

export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketFlag = 'needs_reply' | 'escalated' | 'handed_off' | 'unassigned' | 'overdue' | 'reopened';
export type TicketView = 'all' | 'open' | 'needs_reply' | 'escalated' | 'mine';

export interface Ticket {
  id: string;
  conversation_id?: string;
  channel?: 'api' | 'playground' | (string & {});
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee_user_id?: string;
  assignee_name?: string;
  assignee?: string;
  escalated: boolean;
  escalated_at?: string;
  source: 'dashboard' | 'customer';
  needs_reply: boolean;
  handed_off: boolean;
  flags: Record<TicketFlag, boolean>;
  last_customer_at?: string;
  last_agent_at?: string;
  first_response_at?: string;
  resolved_at?: string;
  closed_at?: string;
  reopen_count: number;
  created_at: string;
  updated_at: string;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
}

export interface TicketMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  author: 'customer' | 'assistant' | 'agent';
  agent?: string;
  via?: 'api';
  status?: string;
  error?: string;
  model?: string;
  usage?: Usage;
  created_at: string;
}

export interface TicketReply {
  id: string;
  kind: 'reply' | 'note';
  author: string;
  content: string;
  message_id?: string;
  created_at: string;
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
  replies: TicketReply[];
  usage: Usage & { replies: number };
}

export interface TicketCounts {
  needs_reply: number;
  escalated: number;
  open: number;
  all: number;
  mine: number;
  overdue: number;
  unassigned: number;
}

export interface TicketList {
  data: Ticket[];
  counts: TicketCounts;
  next_cursor?: string;
}

export interface TicketQuery {
  view?: TicketView;
  flag?: TicketFlag;
  assignee?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface TicketPatch {
  subject?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignee_user_id?: string;
  escalated?: boolean;
}

export interface Handoff {
  conversation_id: string;
  channel: string;
  title: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/* Live updates and webhook                                            */
/* ------------------------------------------------------------------ */

export interface RealtimeInfo {
  url: string;
  publishable_key: string;
  bot_topic: string;
  events: string[];
}

export interface WebhookDelivery {
  event: string;
  ok: boolean;
  status?: number;
  error?: string;
  at: string;
}

export interface Webhook {
  url: string;
  enabled: boolean;
  secret?: string;
  secret_hint: string;
  events: string[];
  last_delivery?: WebhookDelivery;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export interface UsageDay {
  date: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number;
}

export interface UsageSummary {
  from: string;
  to: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  avg_latency_ms: number;
  by_day: UsageDay[];
  by_model: { model: string; requests: number; total_tokens: number; estimated_cost: number; avg_latency_ms: number }[];
  tool_calls: {
    total: number;
    errors: number;
    avg_latency_ms: number;
    by_tool: { name: string; calls: number; errors: number; avg_latency_ms: number }[];
  };
  rag: {
    requests: number;
    no_answer_rate: number;
    handoff_rate: number;
    clarification_rate: number;
    cache_hit_rate: number;
    rewrite_rate: number;
    degraded_rate: number;
    avg_latency_ms: number;
    avg_retrieval_ms: number;
  };
}

export interface DurationStats {
  count: number;
  avg_seconds: number | null;
  median_seconds: number | null;
  p90_seconds: number | null;
}

export interface SupportStats {
  from: string;
  to: string;
  scope: 'bot' | 'business';
  conversations: { total: number; ai_only: number; handed_off: number; escalated: number; deflection_rate: number };
  tickets: { created: number; resolved: number; closed: number; from_customer: number; reopened: number; reopen_rate: number };
  backlog: {
    total: number;
    overdue: number;
    unassigned: number;
    by_status: Partial<Record<TicketStatus, number>>;
    by_priority: Partial<Record<TicketPriority, number>>;
  };
  first_response: DurationStats;
  resolution: DurationStats;
  cost: { total: number; per_ticket: number; per_conversation: number; per_ai_resolved: number };
  by_day: { date: string; conversations: number; tickets_created: number; tickets_resolved: number; ticket_cost: number }[];
}

/* ------------------------------------------------------------------ */
/* Billing                                                             */
/* ------------------------------------------------------------------ */

export interface BillingAddon {
  id: string;
  tokens: number;
  price: number;
  month: string;
  actor: string;
  created_at: string;
}

export interface Billing {
  currency: string;
  balance: number;
  /** YYYY-MM, UTC. */
  month: string;
  plan: { id: PlanId; name: string };
  tokens: {
    unlimited: boolean;
    plan_allowance: number;
    addons: number;
    allowance: number;
    used: number;
    /** Null when unlimited. */
    remaining: number | null;
  };
  token_addon: TokenAddon | null;
  /** Bought this month, newest first. */
  addons: BillingAddon[];
}

export type LedgerKind = 'credit' | 'debit' | 'token_addon' | 'overage';

export interface LedgerEntry {
  id: string;
  /** USD: positive adds to the balance, negative spends it. */
  amount: number;
  balance_after: number;
  kind: LedgerKind;
  note: string;
  actor: string;
  usage_id?: string;
  addon_id?: string;
  created_at: string;
}

export interface AddonQuote {
  millions: number;
  tokens: number;
  currency: string;
  price: number;
  average_per_million: number;
  breakdown: { from_millions: number; to_millions: number; millions: number; price_per_million: number; amount: number }[];
}

/* ------------------------------------------------------------------ */
/* Playground                                                          */
/* ------------------------------------------------------------------ */

export type ReplyStatus = 'answered' | 'clarification_required' | 'no_answer' | 'handoff' | 'escalated';

export interface Source {
  document_id: string;
  title: string;
  section?: string;
  url?: string;
  score?: number;
}

export interface PlaygroundRunInput {
  message?: string;
  max_output_tokens: number;
  assistant_name?: string;
  model?: string;
  temperature?: number;
  conversation_id?: string;
  resend?: boolean;
  history?: { role: 'user' | 'assistant'; content: string }[];
  rag_enabled?: boolean;
  rag_top_k?: number;
  tools_enabled?: boolean;
  tools?: string[];
  filters?: SearchFilters;
  debug?: boolean;
}

export interface PlaygroundMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  usage?: Usage | null;
  status?: ReplyStatus;
  sources?: Source[] | null;
  tool_calls?: ToolRun[];
  latency_ms?: number;
  created_at: string;
}

export interface PlaygroundRunResult {
  output: string;
  model: string;
  latency_ms: number;
  finish_reason: string;
  usage: Usage | null;
  tool_calls: ToolRun[];
  status: ReplyStatus;
  sources: Source[] | null;
  context_tokens: number;
  conversation_id?: string;
  user_message?: PlaygroundMessage;
  reply?: PlaygroundMessage;
  debug?: Record<string, unknown>;
}

export interface PlaygroundConversation {
  id: string;
  created_at: string;
  updated_at?: string;
  messages: PlaygroundMessage[];
}

/* ------------------------------------------------------------------ */
/* Platform                                                            */
/* ------------------------------------------------------------------ */

export interface PlatformOverview {
  businesses: number;
  suspended_businesses: number;
  users: number;
  platform_admins: number;
  bots: number;
  conversations_this_month: number;
  open_tickets: number;
  needs_reply: number;
  replies_this_month: number;
  /** USD OpenRouter charged. */
  cost_this_month: number;
  /** USD businesses were billed: cost plus fees and commissions. */
  billed_this_month: number;
  by_day: UsageDay[];
}

export interface PlatformBusiness extends Business {
  owner_email: string;
  first_bot: string;
}

export interface PlatformBusinessDetail {
  members: { user_id: string; email: string; name: string; role: Role; created_at: string }[];
  bots: {
    id: string;
    name: string;
    model: string;
    prompt_template_id: string;
    own_prompt: boolean;
    saved: boolean;
    documents: number;
    replies_this_month: number;
    cost_this_month: number;
    billed_this_month: number;
  }[];
  open_tickets: number;
  balance: number;
  audit: { id: string; actor: string; action: string; target: string; created_at: string }[];
}

export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  platform_admin: boolean;
  created_at: string;
  last_seen_at?: string;
  memberships: { tenant_id: string; tenant_name: string; role: Role }[];
}

export interface PlatformTicket {
  id: string;
  tenant_id: string;
  tenant_name: string;
  bot_id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: 'dashboard' | 'customer';
  escalated: boolean;
  needs_reply: boolean;
  handed_off: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformTool {
  id: string;
  tenant_id: string;
  tenant_name: string;
  name: string;
  method: HttpMethod;
  url: string;
  read_only: boolean;
  disabled: boolean;
  calls: number;
  errors: number;
  avg_latency_ms: number;
  updated_at: string;
}

export interface PlatformUsageRow {
  key: string;
  label: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  /** What OpenRouter charged. */
  estimated_cost: number;
  /** What businesses were billed. */
  billed_cost: number;
  avg_latency_ms: number;
}

export type CatalogStatus = 'active' | 'hidden' | 'retired';

export interface PlatformModel {
  id: string;
  label: string;
  description: string;
  /** OpenRouter's price, USD per million tokens. */
  input_price_per_mtok: number;
  output_price_per_mtok: number;
  /** The model's own markup; null = the platform default. */
  fee_percent: number | null;
  commission_percent: number | null;
  /** When the prices were last read from OpenRouter; "" if never. */
  pricing_synced_at: string;
  context_tokens: number;
  max_output_tokens: number;
  supports_tools: boolean;
  supports_prompt_cache: boolean;
  status: CatalogStatus;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  bots: number;
  effective_fee_percent: number;
  effective_commission_percent: number;
  /** What businesses see in GET /models. */
  billed_input_price_per_mtok: number;
  billed_output_price_per_mtok: number;
}

export interface PlatformTemplate {
  id: string;
  name: string;
  description: string;
  body: string;
  variables: TemplateVariable[];
  business_types: BusinessTypeId[];
  status: CatalogStatus;
  is_default: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  bots: number;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    request_id?: string;
    document_id?: string;
    limit?: keyof Limits;
  };
}

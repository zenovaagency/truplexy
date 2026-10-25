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
  | 'channels.read'
  | 'channels.write'
  | 'customers.read'
  | 'customers.write'
  | 'properties.read'
  | 'properties.write'
  | 'queries.read'
  | 'queries.write'
  | 'queries.delete'
  | 'queries.manage'
  | 'bots.create'
  | 'members.write'
  | 'business.write'
  | 'billing.write'
  | 'audit.read'
  | 'owners.manage'
  | 'business.delete';

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
  /** Public URL of the bot's picture (v2); absent when it has none. */
  avatar_url?: string;
}

export interface Membership {
  tenant_id: string;
  name: string;
  business_type: BusinessTypeId;
  plan: PlanId;
  status: 'active' | 'suspended';
  role: Role;
  bots: BotRef[];
  /** Public URL of the business's logo (v2); absent when it has none. */
  logo_url?: string;
}

export interface Me {
  user: { id: string; email: string; name: string; avatar_url?: string };
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
  /** Whether the bot may search the web (v2). Plans don't list it; a business's limits always do. */
  web_search?: boolean;
  /** Web searches a month; 0 = unlimited (v2). */
  web_searches_per_month?: number;
  /** Whether customers may attach pictures to a message (image input). Plans don't list it; a business's limits always do. Free has none. */
  image_input?: boolean;
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
  /** Open tickets close after this many hours without activity (v2); 0 = never. */
  auto_close_hours: number;
  limits: Limits;
  limit_overrides: Partial<Limits>;
  usage: { bots: number; members: number; replies_this_month: number; tokens_this_month: number };
  /** USD; see GET /billing. */
  balance: number;
  /** Only on deleted businesses, which only platform admins see. */
  deleted_at?: string;
  /** Public URL of the logo (v2); absent when there is none. */
  logo_url?: string;
}

export interface Member {
  user_id: string;
  email: string;
  name: string;
  avatar_url?: string;
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
  /** Only in the POST /invites response, when the API knows the dashboard's URL. */
  link?: string;
  /** Only in the POST /invites response: whether the API emailed the link. */
  emailed?: boolean;
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

/** An owner's request that platform admins delete the business. */
export interface DeletionRequest {
  id: string;
  tenant_id: string;
  tenant_name: string;
  requested_by: string;
  requested_by_email: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by?: string;
  /** Shown to the business when a request is rejected. */
  review_note?: string;
  reviewed_at?: string;
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
  avatar_url?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  tenant_id: string;
  bot_id: string;
  key_prefix: string;
  /** The channel the key is bound to (v2). */
  channel_id?: string;
  status: 'active' | 'revoked';
  created_at: string;
  last_used_at?: string;
  /** The secret, only in the POST /api-keys response. */
  key?: string;
}

/* ------------------------------------------------------------------ */
/* Channels                                                            */
/* ------------------------------------------------------------------ */

/** A channel type the bot may add, from GET /channel-types. */
export interface ChannelType {
  id: string;
  label: string;
  description: string;
  /** An icon name or URL. */
  icon: string;
  /** False for a hidden type one of the bot's channels still uses; don't offer it for new channels. */
  offered: boolean;
  /** True for a type the platform marked upcoming: show it as "Upcoming" and don't offer it. Absent on older APIs. */
  upcoming?: boolean;
}

/** A place the bot talks to customers, such as a Discord server or a website's chat widget. */
export interface Channel {
  id: string;
  tenant_id: string;
  bot_id: string;
  type: string;
  type_label: string;
  name: string;
  description: string;
  /** The platform's own ID, e.g. a Discord server ID. A Shopify channel's is the store, your-store.myshopify.com. */
  external_id: string;
  /** The business's switch. */
  enabled: boolean;
  /** A platform admin's switch; the business can't undo it. */
  disabled_by_platform: boolean;
  /** enabled and not disabled_by_platform: its keys work. */
  active: boolean;
  open_tickets: number;
  tickets: number;
  /** Active chat API keys bound to it. */
  api_keys: number;
  /** Its own inactivity time; null uses the channel type's, else the business's. 0 = never. */
  auto_close_hours: number | null;
  /** The time that applies; 0 = never. */
  effective_auto_close_hours: number;
  created_at: string;
  updated_at: string;
}

export type ChannelInput = Pick<Channel, 'type' | 'name' | 'description' | 'external_id' | 'enabled'> & {
  /** null uses the channel type's time, else the business's. In a PATCH, null clears it and leaving it out keeps it. */
  auto_close_hours?: number | null;
};

/* ------------------------------------------------------------------ */
/* Bot configuration                                                   */
/* ------------------------------------------------------------------ */

/**
 * `model`, `temperature`, `maxTokens`, `topK`, `routing` and the `knowledge` fields other than `policy`
 * are set by the platform. This dashboard doesn't show them; a save sends them back as loaded and the
 * API keeps its own values for a business.
 */
export interface BotConfig {
  name: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  ragEnabled?: boolean;
  topK?: number;
  toolsEnabled?: boolean;
  tools?: string[];
  /** Search the web when the knowledge base has no confident answer, or always (v2). Needs ragEnabled. */
  webSearch?: WebSearchConfig;
  routing?: BotRouting;
  /** Source rules for the bot's answers. A business sets only `policy`. */
  knowledge?: BotKnowledge;
}

export type KnowledgePolicy = 'strict_kb' | 'kb_plus_general' | 'kb_general_external';

export interface BotKnowledge {
  policy?: KnowledgePolicy;
  ragMode?: string;
  maxSubqueries?: number;
  verify?: string;
}

/** Platform-managed and not edited here; typed so a saved bot is sent back as loaded. */
export interface BotRouting {
  mode?: string;
  classifier?: unknown;
  fixedModel?: string;
  modelPools?: unknown;
  allowedTiers?: RoutingTier[];
  providerAllowlist?: string[];
  maxRequestCostUsd?: number;
  maxAttempts?: number;
}

export type WebSearchMode = 'fallback' | 'always';
export type WebSearchDepth = 'basic' | 'advanced';
export type WebSearchTopic = 'general' | 'news';
export type WebSearchTimeRange = 'day' | 'week' | 'month' | 'year' | '';

export interface WebSearchConfig {
  enabled: boolean;
  mode: WebSearchMode;
  /** 1–8. */
  maxResults: number;
  depth: WebSearchDepth;
  topic: WebSearchTopic;
  timeRange: WebSearchTimeRange;
  /** Hostnames such as docs.example.com; a domain covers its subdomains. Up to 50 each. */
  includeDomains: string[];
  excludeDomains: string[];
}

export interface WorkspaceVersion {
  id: string;
  savedAt: string;
  bot: BotConfig;
}

export interface Workspace {
  name: string;
  /** The platform chooses every reply's model and how every bot answers. */
  modelSelection: 'platform';
  bot: BotConfig;
  revision: number;
  updated_at?: string;
  history: WorkspaceVersion[];
  defaults: { name: string; bot: BotConfig };
}

/** The models the platform's routing answers with. */
export type RoutingTier = 'fast' | 'balanced' | 'advanced';

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
    passages?: Passage[] | null;
    sources: unknown[];
    context_tokens: number;
    candidates: number;
    fallback: boolean;
    degraded?: string[] | null;
  };
  hits?: SearchHit[] | null;
  trace?: {
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
  } | null;
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
  /** A built-in tool, such as shopify_order_status: it can't be changed or deleted, and its api fields are empty. */
  built_in?: boolean;
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

export type TicketStatus = 'open' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketFlag = 'needs_reply' | 'escalated' | 'handed_off' | 'unassigned' | 'overdue' | 'reopened';
export type TicketView = 'all' | 'open' | 'needs_reply' | 'escalated' | 'mine';

export interface Ticket {
  id: string;
  conversation_id?: string;
  /** The conversation's kind. */
  channel?: 'api' | 'playground' | (string & {});
  /** The bot's channel it came from (v2); kept after the channel is deleted. */
  channel_id?: string;
  channel_name?: string;
  channel_type?: string;
  /** The customer it is from (v2), taken from its conversation. */
  customer_id?: string;
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
  closed_at?: string;
  reopen_count: number;
  /** The AI summary a person last generated, and when. */
  summary?: string;
  summary_at?: string;
  /** Never closes on its own (v2). */
  keep_open: boolean;
  /** When it closes if nothing happens before (v2). */
  auto_close_at?: string;
  /** When it last closed on its own (v2); reopening clears it. */
  auto_closed_at?: string;
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
  /** The customer's pictures (image input). Their `url` expires after an hour: reload the ticket, never keep it. */
  attachments?: Attachment[];
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
  /** A channel id, or `none`. */
  channel?: string;
  channel_type?: string;
  /** A customer id: only tickets from them. */
  customer?: string;
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
  /** "" clears it. */
  channel_id?: string;
  /** true stops it closing on its own; false lets it again. */
  keep_open?: boolean;
}

/* ------------------------------------------------------------------ */
/* Customers (v2)                                                      */
/* ------------------------------------------------------------------ */

/**
 * One way to reach or recognise a customer. `type` is any lowercase word:
 * email, phone, discord, telegram, or your own user ID type. A type and value
 * belong to one customer per bot. Emails are lowercased and phones lose their
 * spaces, dashes and brackets; other values are kept as sent.
 */
export interface Contact {
  type: string;
  value: string;
  /** Free text up to 60 characters, such as "work". */
  label?: string;
  /** Each type has one primary contact: the first added, unless another is marked. */
  primary: boolean;
}

/** A person the bot talks to. */
export interface Customer {
  id: string;
  tenant_id: string;
  bot_id: string;
  name: string;
  /** Up to 20, including several of one type. */
  contacts: Contact[];
  /** A JSON object kept about them, up to 4 KB. */
  metadata: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  conversations: number;
  tickets: number;
  open_tickets: number;
  created_at: string;
  updated_at: string;
}

/** Fields of POST and PATCH /customers. */
export interface CustomerInput {
  name?: string;
  /** On PATCH this replaces the whole list; leave it out to keep the contacts. */
  contacts?: { type: string; value: string; label?: string; primary?: boolean }[];
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Custom properties                                                   */
/* ------------------------------------------------------------------ */

/** The kinds of record that have custom properties. */
export type PropertyEntity = 'customer' | 'query';

export type PropertyType = 'text' | 'long_text' | 'number' | 'boolean' | 'date' | 'select' | 'multi_select' | 'email' | 'phone' | 'url';

export interface PropertyOption {
  /** What records store; never changes meaning. */
  value: string;
  label: string;
}

export interface PropertyDefinition {
  id: string;
  entity: PropertyEntity;
  /** For entities whose properties are per type; absent otherwise. */
  scope_id?: string;
  /** Never changes. */
  key: string;
  label: string;
  description: string;
  /** Never changes. */
  type: PropertyType;
  /** select and multi_select only. */
  options: PropertyOption[];
  required: boolean;
  /** Shown only to members who may edit the record; never given to the assistant. */
  sensitive: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Fields of POST and PATCH /properties. entity, scope_id, key and type are sent only on POST. */
export interface PropertyInput {
  entity?: PropertyEntity;
  scope_id?: string;
  key?: string;
  label?: string;
  description?: string;
  type?: PropertyType;
  options?: PropertyOption[];
  required?: boolean;
  sensitive?: boolean;
  sort_order?: number;
}

export interface PropertyPreset {
  entity: PropertyEntity;
  key: string;
  label: string;
  description: string;
  type: PropertyType;
  options: PropertyOption[];
  sensitive: boolean;
  /** Empty suits every business. */
  business_types: string[];
}

/** A record's values by property key, as stored: strings, numbers, booleans, or a list for multi_select. */
export type PropertyValues = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export type QueryCategory = 'open' | 'pending' | 'done';

export interface QueryStatus {
  key: string;
  label: string;
  category: QueryCategory;
}

export type LimitableRole = 'editor' | 'agent' | 'viewer';

export interface QueryType {
  id: string;
  /** Never changes. */
  key: string;
  name: string;
  description: string;
  statuses: QueryStatus[];
  default_status: string;
  /** Empty: every role with queries.read. Owners and admins always see every type. */
  visible_roles: LimitableRole[];
  /** The assistant may open queries of this type and report on them. */
  bot_enabled: boolean;
  sort_order: number;
  archived: boolean;
  /** Its queries not done. */
  open: number;
  created_at: string;
  updated_at: string;
}

export interface QueryTypeInput {
  key?: string;
  name?: string;
  description?: string;
  statuses?: QueryStatus[];
  default_status?: string;
  visible_roles?: LimitableRole[];
  bot_enabled?: boolean;
  sort_order?: number;
  archived?: boolean;
}

export interface QueryTypePreset {
  key: string;
  name: string;
  description: string;
  statuses: QueryStatus[];
  default_status: string;
  fields: { key: string; label: string; type: PropertyType; options: PropertyOption[]; required: boolean; sensitive: boolean }[];
  business_types: string[];
}

export interface CustomerQuery {
  id: string;
  /** Q-1001 */
  reference: string;
  number: number;
  type_id: string;
  type_name: string;
  subject: string;
  status: string;
  status_label: string;
  status_category: QueryCategory;
  customer_id?: string;
  customer_name?: string;
  conversation_id?: string;
  ticket_id?: string;
  assignee_user_id?: string;
  assignee_name?: string;
  source: 'dashboard' | 'assistant';
  properties: PropertyValues;
  masked_properties?: string[];
  closed_at?: string;
  created_at: string;
  updated_at: string;
}

/** Fields of POST and PATCH /queries. type_id and conversation_id only on POST; "" clears customer, ticket and assignee. */
export interface QueryInput {
  type_id?: string;
  subject?: string;
  status?: string;
  customer_id?: string;
  conversation_id?: string;
  ticket_id?: string;
  assignee_user_id?: string;
  properties?: PropertyValues;
  note?: string;
}

export interface QueryList {
  data: CustomerQuery[];
  next_cursor?: string;
}

export interface QueryEvent {
  id: string;
  kind: 'created' | 'status' | 'assigned' | 'fields' | 'note';
  from?: string;
  to?: string;
  note?: string;
  actor_type: 'member' | 'assistant' | 'key';
  actor_id?: string;
  actor_name?: string;
  created_at: string;
}

export interface CustomerList {
  data: Customer[];
  next_cursor?: string;
}

export interface CustomerDetail extends Customer {
  recent_conversations: { id: string; created_at: string; updated_at: string }[];
  recent_tickets: { id: string; subject: string; status: TicketStatus; created_at: string; updated_at: string }[];
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
  /** Searches that ran count against the plan (v2). */
  web_searches?: { searches: number; with_results: number; errors: number; skipped: number; avg_latency_ms: number };
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
  tickets: { created: number; closed: number; from_customer: number; reopened: number; reopen_rate: number };
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
  by_day: { date: string; conversations: number; tickets_created: number; tickets_closed: number; ticket_cost: number }[];
}

/** Durations in whole milliseconds (avg_ms has one decimal) with nearest-rank percentiles; `count` is how many durations it covers. */
export interface LatencyStats {
  count: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  max_ms: number;
}

export interface RoutePerformance extends LatencyStats {
  method: string;
  /** The router's pattern without the API version, e.g. "/conversations/{id}/messages". */
  route: string;
  requests: number;
  errors: number;
  server_errors: number;
  error_rate: number;
}

export interface StagePerformance extends LatencyStats {
  stage: string;
  /** Replies the stage took at least 1 ms for; the other fields are over those replies only. */
  ran: number;
  /** The stage's part of all reply time, 0–1. */
  share: number;
}

export interface PerformanceDay {
  date: string;
  requests: number;
  errors: number;
  server_errors: number;
  p50_ms: number;
  p95_ms: number;
}

export interface PerformanceStats {
  from: string;
  to: string;
  scope: 'bot' | 'business' | 'platform';
  /** Which records the server keeps, so zero can be told from "not recorded". */
  recording: { http: boolean; sample_rate: number; model_attempts: boolean };
  requests: {
    total: number;
    errors: number;
    server_errors: number;
    error_rate: number;
    server_error_rate: number;
    by_status: Partial<Record<'2xx' | '3xx' | '4xx' | '5xx', number>>;
    by_route: RoutePerformance[];
    by_day: PerformanceDay[];
  };
  latency: LatencyStats;
  pipeline: {
    replies: number;
    total: LatencyStats;
    stages: StagePerformance[];
    retrieval_stages: StagePerformance[];
  };
  rag: {
    replies: number;
    answered_rate: number;
    no_answer_rate: number;
    clarification_rate: number;
    handoff_rate: number;
    empty_retrieval_rate: number;
    cache_hit_rate: number;
    cache_hits: Record<string, number>;
    rewrite_rate: number;
    degraded_rate: number;
    degraded: Record<string, number>;
    confidence: Partial<Record<'high' | 'low' | 'none' | 'unknown', number>>;
    web_search_rate: number;
    split_rate: number;
    avg_candidates: number;
    avg_passages: number;
    avg_top_score: number;
    retrieval: LatencyStats;
  };
  models: (LatencyStats & { model: string; attempts: number; failures: number; failure_rate: number })[];
  /** Platform scope only: the 20 businesses with the most requests. */
  tenants?: { tenant_id: string; name: string; requests: number; server_errors: number; server_error_rate: number }[];
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

/** The paid plans sold through Paddle. Enterprise is sales-led. */
export type CheckoutPlan = 'starter' | 'pro';
export type BillingInterval = 'monthly' | 'yearly';

/** Paddle's subscription statuses, as the API reports them. */
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';

export interface Subscription {
  status: SubscriptionStatus;
  plan: CheckoutPlan;
  interval: BillingInterval;
  /** Set while trialing: the first charge happens then. */
  trial_ends_at: string | null;
  /** The next renewal, or the end of the paid period once canceled. */
  current_period_end: string | null;
  /** Set when a cancellation is scheduled: access ends then. */
  cancel_at: string | null;
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
  /** Web results have kind "web" and a url instead of a document (v2). */
  kind?: 'document' | 'web';
  document_id?: string;
  title: string;
  section?: string;
  url?: string;
  score?: number;
}

/** The limit an error names. */
export type LimitName = keyof Limits;

/* ------------------------------------------------------------------ */
/* Image input (planned, 2026-10-19). Not served until the API ships.   */
/* ------------------------------------------------------------------ */

/** A picture a customer message carried, as the server stored it (shrunk, a JPEG, metadata removed). `url` is signed and lasts 1 hour. */
export interface Attachment {
  id: string;
  content_type: 'image/jpeg';
  width: number;
  height: number;
  size: number;
  url: string;
  url_expires_at: string;
}

/** `GET /playground/attachments/config`. The limits are only meaningful with `enabled: true`. */
export interface AttachmentConfig {
  enabled: boolean;
  /** With `enabled: false`: the plan has no image input, or no active model can read pictures. */
  reason?: 'plan' | 'no_vision_model';
  max_bytes?: number;
  max_per_message?: number;
  content_types?: string[];
}

export interface AttachmentRegistration {
  filename: string;
  content_type: string;
  size: number;
  sha256: string;
}

export interface AttachmentUpload {
  attachment: { id: string; status: 'pending'; filename: string; content_type: string; size: number };
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expires_at: string;
}

export interface PlaygroundRunInput {
  message?: string;
  /** 1–3 attachment IDs from `POST /playground/attachments`; `message` may then be empty. Not allowed with `resend`. */
  attachments?: string[];
  /** Required, 1–32768, but the platform's limit is used. */
  max_output_tokens: number;
  assistant_name?: string;
  conversation_id?: string;
  resend?: boolean;
  history?: { role: 'user' | 'assistant'; content: string }[];
  rag_enabled?: boolean;
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
  /** The pictures a user message carried (image input). Their `url` expires: never keep it. */
  attachments?: Attachment[];
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
  /** Businesses that aren't deleted. */
  businesses: number;
  suspended_businesses: number;
  /** Deleted, not purged yet. */
  deleted_businesses: number;
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

/** A business's deletion: restorable until `restore_until`, then purged. */
export interface TenantDeletion {
  id: string;
  tenant_id: string;
  tenant_name: string;
  owner_email: string;
  reason: string;
  request_id?: string;
  deleted_by: string;
  deleted_by_email?: string;
  deleted_at: string;
  restore_until: string;
  restored_at?: string;
  restored_by?: string;
  purged_at?: string;
  state: 'deleted' | 'restored' | 'purged';
  /** state is deleted and restore_until hasn't passed. */
  restorable: boolean;
}

export type PlatformUserStatus = 'active' | 'disabled' | 'deleted';

/** An account. A deleted one keeps only its id: email deleted+{id}@invalid, an empty name. */
export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  platform_admin: boolean;
  status: PlatformUserStatus;
  disabled_at?: string;
  deleted_at?: string;
  created_at: string;
  last_seen_at?: string;
  memberships: { tenant_id: string; tenant_name: string; role: Role }[];
}

export interface PlatformUserActivity {
  id: string;
  tenant_id: string;
  actor: string;
  action: string;
  target?: string;
  created_at: string;
}

export interface PlatformUserDetail extends PlatformUser {
  /** The last 50 audit events the person made, in any business. */
  activity: PlatformUserActivity[];
}

export interface PlatformUserInput {
  email: string;
  name?: string;
  platform_admin?: boolean;
  /** Up to 20, each business once. */
  memberships?: { tenant_id: string; role: Role }[];
}

export interface PlatformUserPatch {
  name?: string;
  email?: string;
  platform_admin?: boolean;
  /** true locks the person out at once; false lets them back in. */
  disabled?: boolean;
}

export interface PlatformUserQuery {
  q?: string;
  /** Default: everyone not deleted. */
  status?: PlatformUserStatus | 'all';
  platform_admin?: boolean;
  limit?: number;
  cursor?: string;
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
  channel_id?: string;
  channel_name?: string;
  channel_type?: string;
  escalated: boolean;
  needs_reply: boolean;
  handed_off: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformCustomer extends Customer {
  tenant_name: string;
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
  /** The model reads pictures (image input). OpenRouter lists it, and a platform admin may change it. */
  supports_vision: boolean;
  /** Which messages routing gives this model: null = not used by routing. The lowest sort_order in a tier is tried first. */
  routing_tier: RoutingTier | null;
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

/** `GET /platform/settings` (v2): settings that apply to the whole platform. */
export interface PlatformSettings {
  /** The model that answers a message with pictures when the bot's own model can't read them. */
  vision_model: {
    /** What a platform admin set; "" when nothing is set. */
    value: string;
    /** The server's LLM_VISION_MODEL; "" when unset. */
    default: string;
    /** The model in use; "" when there is none. */
    effective: string;
    source: 'console' | 'env' | 'none';
  };
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

export interface PlatformChannelType {
  id: string;
  label: string;
  description: string;
  icon: string;
  /**
   * A hidden type isn't offered for new channels; channels already of it keep working.
   * An upcoming type is listed to businesses as "Upcoming" and can't be added yet.
   */
  status: 'active' | 'hidden' | 'upcoming';
  sort_order: number;
  /** Inactivity time for channels of the type; null leaves it to each business. 0 = never. */
  auto_close_hours: number | null;
  /** Businesses' channels of the type. */
  channels: number;
  created_at: string;
  updated_at: string;
}

export type PlatformChannel = Channel & { tenant_name: string };

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    request_id?: string;
    document_id?: string;
    limit?: LimitName;
    /** SOLE_OWNER: the businesses the person is the only owner of. */
    tenants?: { id: string; name: string }[];
  };
}

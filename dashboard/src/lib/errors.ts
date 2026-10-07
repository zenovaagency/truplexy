import { isApiError } from '@/lib/api/client';

/**
 * People-facing copy per error code. The API's own `message` is used when a
 * code has no entry here, or when the entry asks for it (`useMessage`),
 * because for those the message names the exact rule that failed.
 */
const COPY: Record<string, { title: string; hint?: string; useMessage?: boolean }> = {
  NETWORK_ERROR: { title: "Couldn't reach Truplexy", hint: 'Check your connection and try again.' },
  UNAUTHORIZED: { title: 'Your session has ended', hint: 'Sign in again to continue.' },
  FORBIDDEN: { title: "Your role can't do that", hint: 'Ask an admin of this business for access.' },
  TENANT_SUSPENDED: { title: 'This business is suspended', hint: 'Contact Truplexy support to restore it.' },
  TENANT_NOT_FOUND: { title: 'Business not found', hint: "It may have been removed, or you're no longer a member." },
  BOT_NOT_FOUND: { title: 'Bot not found' },
  PLAN_LIMIT_REACHED: { title: 'Plan limit reached', hint: 'See Settings → Plan & usage.' },
  ADDON_NOT_AVAILABLE: { title: "Extra tokens aren't needed", hint: "This business's tokens are unlimited." },
  INSUFFICIENT_BALANCE: { title: 'The balance is too low', hint: 'Ask Truplexy for a top-up, or buy fewer tokens.' },
  PRICING_UNAVAILABLE: { title: "Couldn't reach OpenRouter for prices", hint: 'Try again, or enter the prices yourself.' },
  BUSINESS_LIMIT_REACHED: { title: 'You already own 3 businesses', hint: 'Leave or hand over one before creating another.' },
  WORKSPACE_CONFLICT: { title: 'Someone else saved first', hint: 'Reload to get their changes, then apply yours again.' },
  TICKET_EXISTS: { title: 'This conversation already has an open ticket', useMessage: true },
  DUPLICATE_DOCUMENT: { title: 'Already in the knowledge base', hint: 'The same content exists as another document.' },
  KNOWLEDGE_BASE_FULL: { title: 'The knowledge base is full' },
  DOCUMENT_BUSY: { title: 'This document is being processed', hint: 'Try again in a few seconds.' },
  LAST_OWNER: { title: 'A business needs at least one owner', hint: 'Make someone else an owner first.' },
  OWN_ACCESS: { title: "You can't revoke your own platform access" },
  ALREADY_MEMBER: { title: 'Already a member' },
  BOT_EXISTS: { title: 'A bot with that ID exists' },
  TOOL_EXISTS: { title: 'A tool with that name exists' },
  INVALID_TOOL: { title: "The tool isn't valid", useMessage: true },
  INVALID_REQUEST: { title: 'Check the form', useMessage: true },
  INVALID_ASSIGNEE: { title: "That person can't be assigned", hint: 'Assignees need the Agent role or above.' },
  MODEL_NOT_ALLOWED: { title: "That model isn't available", useMessage: true },
  LLM_RATE_LIMITED: { title: 'The model provider is busy', hint: 'Try again in a moment.' },
  LLM_TIMEOUT: { title: 'The model took too long', hint: 'Try again.' },
  TIMEOUT: { title: 'That took too long', hint: 'Try again.' },
  LLM_PROVIDER_ERROR: { title: 'The model provider failed', useMessage: true },
  STORAGE_ERROR: { title: 'Storage failed', useMessage: true },
  RETRIEVAL_FAILED: { title: 'Retrieval failed', useMessage: true },
  REALTIME_NOT_CONFIGURED: { title: 'Live updates are off on this server' },
  INVITE_EMAIL_MISMATCH: { title: 'Wrong account for this invitation', hint: 'Sign in with the invited address.' },
  INVITE_EXPIRED: { title: 'This invitation has expired', hint: 'Ask for a new one.' },
  INVITE_REVOKED: { title: 'This invitation was cancelled', hint: 'Ask for a new one.' },
  INVITE_USED: { title: 'This invitation was already used' },
  INVITE_NOT_FOUND: { title: 'Invitation not found' },
  BODY_TOO_LARGE: { title: 'That is too large to send' },
  INTERNAL_ERROR: { title: 'Something went wrong on our side', hint: 'Quote the request ID if you contact support.' },
};

const LIMIT_LABEL: Record<string, string> = {
  bots: 'bots',
  documents_per_bot: 'documents per bot',
  members: 'team members',
  replies_per_month: 'AI replies this month',
  tokens_per_month: 'tokens this month',
};

export interface Described {
  title: string;
  detail?: string;
  code?: string;
  requestId?: string;
}

/** Turns any thrown value into a title and detail for a toast or error panel. */
export function describeError(e: unknown): Described {
  if (isApiError(e)) {
    const c = COPY[e.code];
    let detail = c?.useMessage || !c ? e.message : c.hint;
    if (e.code === 'PLAN_LIMIT_REACHED' && e.limit === 'tokens_per_month') detail = "This month's tokens are used up and the balance is empty. Buy extra tokens in Settings → Billing.";
    else if (e.code === 'PLAN_LIMIT_REACHED' && e.limit) detail = `Your plan has no room for more ${LIMIT_LABEL[e.limit] ?? e.limit}. See Settings → Plan & usage.`;
    return { title: c?.title ?? 'Request failed', detail, code: e.code, requestId: e.requestId };
  }
  if (e instanceof Error) return { title: 'Something went wrong', detail: e.message };
  return { title: 'Something went wrong' };
}

import { hasCode, isApiError } from '@/lib/api/client';

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
  ACCOUNT_DISABLED: { title: 'Your account is disabled', hint: 'A Truplexy administrator turned it off. Contact support to restore it.' },
  SCOPE_REQUIRED: { title: 'No business selected', hint: 'Reload the page, then try again.' },
  INVALID_SCOPE: { title: "That business address isn't valid", hint: 'Check the link, or pick a business from the switcher.' },
  NOT_FOUND: { title: 'Not found', hint: "It doesn't exist, or it's outside this business." },
  TICKET_NOT_FOUND: { title: 'Ticket not found', hint: 'It may have been deleted, or it belongs to another business.' },
  CUSTOMER_NOT_FOUND: { title: 'Customer not found', hint: 'They may have been deleted.' },
  DOCUMENT_NOT_FOUND: { title: 'Document not found', hint: 'It may have been deleted.' },
  CONVERSATION_NOT_FOUND: { title: 'Conversation not found' },
  MEMBER_NOT_FOUND: { title: 'Member not found', hint: 'They may have left the business.' },
  KEY_NOT_FOUND: { title: 'API key not found', hint: 'It may already have been revoked.' },
  TOOL_NOT_FOUND: { title: 'Tool not found', hint: 'It may have been deleted.' },
  MODEL_NOT_FOUND: { title: 'Model not found' },
  TEMPLATE_NOT_FOUND: { title: 'Template not found' },
  PLAN_LIMIT_REACHED: { title: 'Plan limit reached', hint: 'See Settings → Plan & usage.' },
  ADDON_NOT_AVAILABLE: { title: "Extra tokens aren't available", hint: "This business's plan doesn't sell extra tokens, or its tokens are unlimited." },
  INSUFFICIENT_BALANCE: { title: 'The balance is too low', hint: 'Ask Truplexy for a top-up, or buy fewer tokens.' },
  PRICING_UNAVAILABLE: { title: "Couldn't reach OpenRouter for prices", hint: 'Try again, or enter the prices yourself.' },
  BUSINESS_LIMIT_REACHED: { title: 'You already own 3 businesses', hint: 'Leave or hand over one before creating another.' },
  WORKSPACE_CONFLICT: { title: 'Someone else saved first', hint: 'Reload to get their changes, then apply yours again.' },
  TICKET_EXISTS: { title: 'This conversation already has an open ticket', useMessage: true },
  DUPLICATE_DOCUMENT: { title: 'Already in the knowledge base', hint: 'The same content exists as another document.' },
  KNOWLEDGE_BASE_FULL: { title: 'The knowledge base is full' },
  DOCUMENT_BUSY: { title: 'This document is being processed', hint: 'Try again in a few seconds.' },
  LAST_OWNER: { title: 'A business needs at least one owner', hint: 'Make someone else an owner first.' },
  OWN_ACCESS: { title: "You can't do that to your own account", hint: 'Ask another platform admin.' },
  LAST_PLATFORM_ADMIN: { title: 'Truplexy needs at least one platform admin', hint: 'Make someone else an admin first.' },
  EMAIL_TAKEN: { title: 'That email already has an account' },
  SOLE_OWNER: { title: 'This person is the only owner of a business', hint: 'Make someone else an owner of those businesses first.' },
  AUTH_PROVIDER_ERROR: { title: "The sign-in provider didn't respond", useMessage: true },
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
  LLM_NOT_CONFIGURED: { title: "AI isn't set up on this server" },
  WEB_SEARCH_NOT_CONFIGURED: { title: "Web search isn't set up on this server", hint: 'Ask Truplexy to add a search provider key.' },
  NO_CONVERSATION: { title: 'This ticket has no conversation to summarize' },
  STORAGE_ERROR: { title: 'Storage failed', useMessage: true },
  RETRIEVAL_FAILED: { title: 'Retrieval failed', useMessage: true },
  REALTIME_NOT_CONFIGURED: { title: 'Live updates are off on this server' },
  INVITE_EMAIL_MISMATCH: { title: 'Wrong account for this invitation', hint: 'Sign in with the invited address.' },
  INVITE_EXPIRED: { title: 'This invitation has expired', hint: 'Ask for a new one.' },
  INVITE_REVOKED: { title: 'This invitation was cancelled', hint: 'Ask for a new one.' },
  INVITE_USED: { title: 'This invitation was already used' },
  INVITE_NOT_FOUND: { title: 'Invitation not found' },
  CHANNEL_NOT_FOUND: { title: 'Channel not found', hint: 'It may have been deleted.' },
  CHANNEL_TYPE_NOT_FOUND: { title: 'Channel type not found' },
  CHANNEL_TYPE_NOT_ALLOWED: { title: "That channel type isn't offered", hint: 'Pick another type.' },
  CHANNEL_EXISTS: { title: 'This bot already has a channel with that name' },
  CHANNEL_TYPE_EXISTS: { title: 'A channel type with that ID exists' },
  CHANNEL_IN_USE: { title: 'Active API keys use this channel', hint: 'Revoke them first, then delete the channel.' },
  CHANNEL_DISABLED: { title: 'This channel is turned off', hint: 'Turn it on, or ask Truplexy if it was turned off for you.' },
  INVALID_IMAGE: { title: "That image can't be used", hint: 'It must be readable and 16–4096 pixels on each side.' },
  IMAGE_TOO_LARGE: { title: 'That image is too large', hint: 'Use a file of 512 KiB or less.' },
  UNSUPPORTED_IMAGE_TYPE: { title: 'Use a PNG, JPEG or WebP image', hint: "SVG and GIF files aren't supported." },
  NOT_CONFIGURED: { title: "This isn't set up on this server", useMessage: true },
  USER_NOT_FOUND: { title: 'Account not found', hint: 'It may have been deleted. Reload the page, then try again.' },
  BODY_TOO_LARGE: { title: 'That is too large to send' },
  DELETION_REQUEST_PENDING: { title: 'A deletion request is already pending', hint: 'Withdraw it first to send a new one.' },
  DELETION_REQUEST_NOT_FOUND: { title: 'Deletion request not found', hint: 'It may already have been reviewed or withdrawn.' },
  TENANT_PROTECTED: { title: "This business can't be deleted", hint: 'The default business is kept.' },
  TENANT_DELETED: { title: 'This business is already deleted' },
  RESTORE_EXPIRED: { title: "It can't be restored", hint: 'It was deleted more than 30 days ago.' },
  INTERNAL_ERROR: { title: 'Something went wrong on our side', hint: 'Quote the request ID if you contact support.' },
};

const LIMIT_LABEL: Record<string, string> = {
  bots: 'bots',
  documents_per_bot: 'documents per bot',
  members: 'team members',
  replies_per_month: 'AI replies this month',
  tokens_per_month: 'tokens this month',
  web_search: 'web search',
  web_searches_per_month: 'web searches this month',
};

/** A record (or route) that doesn't exist, or that the caller can't see: the API answers both with 404. */
export const isNotFoundError = (e: unknown) => isApiError(e) && (e.status === 404 || e.code === 'NOT_FOUND' || e.code.endsWith('_NOT_FOUND'));

/** The server has no such route (yet): 405 or 501, as an older deployment answers a newer endpoint. */
export const isUnsupportedError = (e: unknown) => isApiError(e) && (e.status === 405 || e.status === 501);

/** The business or bot the tab is on is gone, or the person was removed from it. */
export const isScopeLostError = (e: unknown) => hasCode(e, 'TENANT_NOT_FOUND', 'BOT_NOT_FOUND');

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
    else if (e.code === 'SOLE_OWNER' && e.tenants?.length) detail = `Make someone else an owner of ${e.tenants.map((t) => t.name).join(', ')} first.`;
    else if (e.code === 'PLAN_LIMIT_REACHED' && e.limit === 'web_search') detail = "This business's plan doesn't include web search. See Settings → Plan & usage.";
    else if (e.code === 'PLAN_LIMIT_REACHED' && e.limit) detail = `Your plan has no room for more ${LIMIT_LABEL[e.limit] ?? e.limit}. See Settings → Plan & usage.`;
    return { title: c?.title ?? 'Request failed', detail, code: e.code, requestId: e.requestId };
  }
  if (e instanceof Error) return { title: 'Something went wrong', detail: e.message };
  return { title: 'Something went wrong' };
}

import type { AgentAccess, ApiKey } from '@/lib/api/types';
import { env } from '@/lib/env';
import { agentSnippets } from '@/features/api-keys/snippets';

/* AI agents' keys and the MCP endpoint (API_REFERENCE.md → "MCP server for AI agents (2026-11-08)"). */

/** The MCP endpoint agents connect to, always under /v3 and absolute (an API base may be a path on this site). */
export function mcpUrl(base = env.apiBaseUrl): string {
  const absolute = /^https?:\/\//.test(base) || typeof window === 'undefined' ? base : new URL(base, window.location.origin).href;
  return `${absolute.replace(/\/+$/, '').replace(/\/v[123]$/, '')}/v3/mcp`;
}

export const isAgentKey = (k: Pick<ApiKey, 'kind'>) => k.kind === 'agent';

export const ACCESS_LABEL: Record<AgentAccess, string> = { read: 'Read only', write: 'Read & write' };

export const ACCESS_HINT: Record<AgentAccess, string> = {
  read: 'Reads tickets, the knowledge base, customers and stats. Changes nothing.',
  write: 'Also replies to customers, updates tickets, drafts replies, adds knowledge articles and asks the bot (billed like replies).',
};

/** Setup snippets for the common agents, with key in place, or a placeholder (shared with the site's /docs/mcp). */
export function connectSnippets(key = 'tpxa_…', url = mcpUrl()) {
  return agentSnippets(url, key);
}

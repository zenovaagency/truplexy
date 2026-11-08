/**
 * How common AI agents connect to Truplexy's MCP endpoint with an agent key.
 * The dashboard's API keys page and the marketing site's /docs/mcp page both
 * use these, so keep this file free of imports.
 */

/** Setup snippets for the common agents, with key in place, or a placeholder. */
export function agentSnippets(url: string, key = 'tpxa_…') {
  const auth = `Bearer ${key}`;
  return [
    { id: 'claude-code', label: 'Claude Code', lang: 'bash', name: 'Terminal', code: `claude mcp add --transport http truplexy ${url} \\\n  --header "Authorization: ${auth}"` },
    { id: 'cursor', label: 'Cursor', lang: 'json', name: '.cursor/mcp.json', code: JSON.stringify({ mcpServers: { truplexy: { url, headers: { Authorization: auth } } } }, null, 2) },
    {
      id: 'claude-desktop',
      label: 'Claude Desktop',
      lang: 'json',
      name: 'claude_desktop_config.json',
      code: JSON.stringify(
        { mcpServers: { truplexy: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${AUTH}'], env: { AUTH: auth } } } },
        null,
        2,
      ),
    },
  ];
}

/** What an agent can do through MCP, per tool, as the API documents it. */
export const AGENT_TOOLS: { name: string; access: 'read' | 'write'; what: string }[] = [
  { name: 'list_tickets', access: 'read', what: 'Lists tickets that need a reply, are escalated or are open, with filters and a search.' },
  { name: 'get_ticket', access: 'read', what: 'One ticket with its conversation and the team’s replies and notes.' },
  { name: 'search_knowledge', access: 'read', what: 'Searches the knowledge base the way the bot does before answering.' },
  { name: 'find_customers', access: 'read', what: 'Finds customers by name, email address, phone number or ID.' },
  { name: 'get_customer', access: 'read', what: 'One customer with their contacts, properties and recent tickets.' },
  { name: 'support_stats', access: 'read', what: 'Conversations, how many the AI resolved, tickets, backlog and response times for a date range.' },
  { name: 'reply_to_ticket', access: 'write', what: 'Replies to the customer on their own channel, signed with the key’s name, or adds an internal note.' },
  { name: 'update_ticket', access: 'write', what: 'Changes status, priority, subject or assignee, or takes the conversation over from the bot.' },
  { name: 'suggest_reply', access: 'write', what: 'Drafts a reply from the conversation and the knowledge base, without sending it. Billed like a reply.' },
  { name: 'add_knowledge_article', access: 'write', what: 'Adds an article to the knowledge base, which the bot then answers from.' },
  { name: 'ask_bot', access: 'write', what: 'Asks the bot a question as a customer would and returns its answer and sources. Billed like a reply.' },
];

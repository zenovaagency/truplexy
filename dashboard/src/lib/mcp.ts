import type { McpServer, Tool } from '@/lib/api/types';
import { storeToolPlatform } from '@/lib/woocommerce';

/* MCP servers (API_REFERENCE.md → "MCP servers (2026-11-08)"). */

/** Every MCP server's tool is named mcp_<slug>_<tool>; API tools can't take these names. */
export const MCP_PREFIX = 'mcp_';

/** A bot offers the model at most this many tools. */
export const MAX_BOT_TOOLS = 20;

export const isMcpTool = (t: Pick<Tool, 'name' | 'mcp'>) => Boolean(t.mcp) || t.name.startsWith(MCP_PREFIX);

/** The badge on a built-in tool: which MCP server or store it comes from. Null for the business's own API tools. */
export function builtInLabel(t: Tool): string | null {
  if (t.mcp) return `MCP · ${t.mcp.server_name}`;
  if (!t.built_in) return null;
  const store = storeToolPlatform(t);
  return store ? `Built-in · ${store}` : 'Built-in';
}

/** Lowercase letters and digits from a server's name, as the API makes a slug when none is given. */
export function slugFrom(name: string): string {
  let out = '';
  for (const c of name.toLowerCase()) {
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9' && out.length > 0)) out += c;
    if (out.length === 20) break;
  }
  return out || 'server';
}

export const SLUG_PATTERN = /^[a-z][a-z0-9]{0,19}$/;

/** Light checks only; the API checks the address properly and connects to it. */
export function urlError(url: string): string | null {
  const v = url.trim();
  if (!v) return 'Enter the server’s MCP endpoint.';
  if (/\s/.test(v)) return 'An address has no spaces.';
  if (!/^https:\/\/[^/]+/.test(v) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(v)) return 'Enter an https:// URL.';
  if (v.length > 2000) return 'Use at most 2000 characters.';
  return null;
}

/**
 * The bot's tools with every usable tool of the server added, keeping the order and the 20-tool cap.
 * Returns the names added, which may be fewer than the server has.
 */
export function withServerTools(current: readonly string[] | undefined, server: McpServer): { tools: string[]; added: string[] } {
  const tools = [...(current ?? [])];
  const added: string[] = [];
  for (const t of server.tools) {
    if (!t.available || tools.includes(t.name)) continue;
    if (tools.length >= MAX_BOT_TOOLS) break;
    tools.push(t.name);
    added.push(t.name);
  }
  return { tools, added };
}

// Read straight from the build environment (same default as lib/env) so this file has no
// app imports: the marketing site's channel docs import these packs too.
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/v3').replace(/\/+$/, '');

/** The API base integrators call: the real URL, even in demo mode. */
export const PUBLIC_API = /^https?:\/\//.test(apiBaseUrl) ? apiBaseUrl : 'https://api.truplexy.com/v3';

/** The website SDK guide on the marketing site: every widget option, framework and the server protocol. */
export const WEB_SDK_DOCS = 'https://truplexy.com/docs/web-sdk';

/** The Truplexy Chat WordPress plugin, as a zip for Plugins → Add New → Upload Plugin (also works for WooCommerce). */
export const WORDPRESS_PLUGIN_ZIP = 'https://truplexy.com/downloads/truplexy-chat.zip';

export type Lang = 'node' | 'python' | 'php' | 'go' | 'java' | 'csharp' | 'ruby';

export const LANG_LABEL: Record<Lang, string> = {
  node: 'Node.js',
  python: 'Python',
  php: 'PHP',
  go: 'Go',
  java: 'Java',
  csharp: 'C#',
  ruby: 'Ruby',
};

/** One integration's server code in one language. */
export interface IntegrationCode {
  /** How a customer message reaches Truplexy and the reply goes back. */
  handler: string;
  /** File name for the handler tab; defaults to the pack's server file. */
  file?: string;
  /** The handler needs no separate chat-API helper (e.g. a WordPress plugin). */
  standalone?: boolean;
  /**
   * On `message.created` (your team replied): deliver `text` from `agent`
   * to the customer's `thread`. Runs inside the pack's webhook receiver.
   */
  deliver?: string;
  /** On `ticket.updated` with `escalated`: tell your team about `ticket`. */
  escalation?: string;
  /** A complete webhook receiver, used instead of the pack's own. */
  receiver?: string;
}

export interface LangPack {
  /** A line shown under the code, e.g. where the snippets go. */
  note?: string;
  files: { server: string; helper: string; webhook: string; verify: string };
  /** Server-side chat helpers: HTTP methods, structured errors, customer upsert and conversation routing. */
  helper: string;
  /** Checks X-Truplexy-Signature. */
  verify: string;
  /** The webhook route, wrapped around an integration's delivery code. */
  receiver: (code: { deliver?: string; escalation?: string }) => string;
  integrations: Partial<Record<string, IntegrationCode>>;
}

export const PACKS: Record<Lang, () => Promise<{ default: LangPack }>> = {
  node: () => import('./node'),
  python: () => import('./python'),
  php: () => import('./php'),
  go: () => import('./go'),
  java: () => import('./java'),
  csharp: () => import('./csharp'),
  ruby: () => import('./ruby'),
};

/** Indent every line after the first, for code placed inside a block. */
export const indent = (code: string, by: string) => code.split('\n').join(`\n${by}`);

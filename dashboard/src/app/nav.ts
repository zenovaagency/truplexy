import {
  BookOpen,
  Building2,
  Cpu,
  FileText,
  FlaskConical,
  Inbox,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
  Plug,
  ScrollText,
  Settings,
  Sparkles,
  Ticket,
  UserRound,
  Users,
  Wrench,
  BarChart3,
} from 'lucide-react';
import type { Permission } from '@/lib/api/types';

/**
 * Page chunks, shared by the router (to render) and the sidebar (to
 * prefetch on hover), so a click after a hover is instant.
 */
export const pages = {
  overview: () => import('@/features/overview/OverviewPage'),
  tickets: () => import('@/features/tickets/TicketsPage'),
  knowledge: () => import('@/features/knowledge/KnowledgePage'),
  draft: () => import('@/features/llm/draft'),
  llm: () => import('@/features/llm/LlmPage'),
  tools: () => import('@/features/tools/ToolsPage'),
  playground: () => import('@/features/playground/PlaygroundPage'),
  integrations: () => import('@/features/integrations/IntegrationsPage'),
  apiKeys: () => import('@/features/api-keys/ApiKeysPage'),
  logs: () => import('@/features/logs/LogsPage'),
  team: () => import('@/features/team/TeamPage'),
  settings: () => import('@/features/settings/SettingsLayout'),
  platform: () => import('@/features/platform/PlatformPages'),
};

export interface NavItem {
  id: string;
  label: string;
  /** Path inside the business scope, or absolute for platform pages. */
  path: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Two-key shortcut after "g". */
  key?: string;
  prefetch?: () => Promise<unknown>;
  keywords?: string[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const BUSINESS_NAV: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { id: 'overview', label: 'Overview', path: 'overview', icon: LayoutDashboard, permission: 'usage.read', key: 'o', prefetch: pages.overview, keywords: ['dashboard', 'stats', 'usage', 'metrics'] },
      { id: 'tickets', label: 'Tickets', path: 'tickets', icon: Inbox, permission: 'tickets.read', key: 't', prefetch: pages.tickets, keywords: ['inbox', 'support', 'conversations', 'handoffs'] },
      { id: 'knowledge', label: 'Knowledge base', path: 'knowledge', icon: BookOpen, permission: 'knowledge.read', key: 'k', prefetch: pages.knowledge, keywords: ['documents', 'articles', 'upload', 'rag'] },
    ],
  },
  {
    label: 'AI',
    items: [
      { id: 'llm', label: 'LLM', path: 'llm', icon: Sparkles, permission: 'bot.read', key: 'l', prefetch: pages.llm, keywords: ['model', 'system prompt', 'temperature', 'cost', 'pricing', 'openrouter', 'usage'] },
      { id: 'tools', label: 'Tools', path: 'tools', icon: Wrench, permission: 'tools.read', key: 'w', prefetch: pages.tools, keywords: ['functions', 'api', 'actions'] },
      { id: 'playground', label: 'Playground', path: 'playground', icon: FlaskConical, permission: 'playground.run', key: 'p', prefetch: pages.playground, keywords: ['chat', 'test', 'try'] },
    ],
  },
  {
    label: 'Connect',
    items: [
      { id: 'integrations', label: 'Integrations', path: 'integrations', icon: Plug, permission: 'integrations.read', key: 'i', prefetch: pages.integrations, keywords: ['whatsapp', 'telegram', 'discord', 'shopify', 'wordpress', 'webhook', 'channels'] },
      { id: 'api-keys', label: 'API keys', path: 'api-keys', icon: KeyRound, permission: 'integrations.read', key: 'a', prefetch: pages.apiKeys, keywords: ['chat key', 'token', 'credentials'] },
    ],
  },
  {
    label: 'Business',
    items: [
      { id: 'team', label: 'Team', path: 'team', icon: Users, permission: 'members.read', key: 'm', prefetch: pages.team, keywords: ['members', 'invite', 'roles'] },
      { id: 'logs', label: 'Logs', path: 'logs', icon: ScrollText, permission: 'audit.read', key: 'h', prefetch: pages.logs, keywords: ['audit', 'activity', 'history'] },
      { id: 'settings', label: 'Settings', path: 'settings', icon: Settings, permission: 'members.read', key: 's', prefetch: pages.settings, keywords: ['business', 'plan', 'bots', 'backup'] },
    ],
  },
];

export const PLATFORM_NAV: NavSection[] = [
  {
    label: 'Platform',
    items: [
      { id: 'p-overview', label: 'Overview', path: '/platform/overview', icon: LayoutDashboard, prefetch: pages.platform },
      { id: 'p-businesses', label: 'Businesses', path: '/platform/businesses', icon: Building2, prefetch: pages.platform },
      { id: 'p-users', label: 'Users', path: '/platform/users', icon: UserRound, prefetch: pages.platform },
      { id: 'p-tickets', label: 'Tickets', path: '/platform/tickets', icon: Ticket, prefetch: pages.platform },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { id: 'p-models', label: 'Models', path: '/platform/models', icon: Cpu, prefetch: pages.platform },
      { id: 'p-templates', label: 'Prompt templates', path: '/platform/templates', icon: FileText, prefetch: pages.platform },
      { id: 'p-tools', label: 'Tools', path: '/platform/tools', icon: Wrench, prefetch: pages.platform },
      { id: 'p-usage', label: 'Usage', path: '/platform/usage', icon: BarChart3, prefetch: pages.platform },
    ],
  },
];

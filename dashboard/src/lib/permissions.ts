import type { Permission, Role } from '@/lib/api/types';

/**
 * Roles, highest first. The permission table itself comes from GET /me
 * (`roles`); DEFAULT_ROLE_PERMISSIONS mirrors API_REFERENCE.md §2 and is only
 * the fallback (and the mock API's source of truth).
 */
export const ROLES: Role[] = ['owner', 'admin', 'editor', 'agent', 'viewer'];

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  agent: 'Agent',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: 'Everything, including managing other owners and asking to delete the business.',
  admin: 'Team, integrations, API keys, bots, business details, extra tokens and the activity log.',
  editor: 'Bot configuration, knowledge, tools, and read access to integrations.',
  agent: 'Works tickets and uses the playground.',
  viewer: 'Read-only access to tickets, knowledge, tools and usage.',
};

const VIEWER: Permission[] = ['bot.read', 'knowledge.read', 'tools.read', 'tickets.read', 'usage.read', 'members.read'];
const AGENT: Permission[] = [...VIEWER, 'playground.run', 'tickets.write'];
const EDITOR: Permission[] = [...AGENT, 'bot.write', 'knowledge.write', 'tools.write', 'tickets.delete', 'integrations.read'];
const ADMIN: Permission[] = [...EDITOR, 'integrations.write', 'bots.create', 'members.write', 'business.write', 'billing.write', 'audit.read'];
const OWNER: Permission[] = [...ADMIN, 'owners.manage', 'business.delete'];

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  viewer: VIEWER,
  agent: AGENT,
  editor: EDITOR,
  admin: ADMIN,
  owner: OWNER,
};

/** Roles a person may hand out: only owners can make (or invite) owners. */
export function assignableRoles(canManageOwners: boolean): Role[] {
  return canManageOwners ? ROLES : ROLES.filter((r) => r !== 'owner');
}

/** Ticket assignees need tickets.write: agent and above. */
export const canBeAssigned = (role: Role) => role !== 'viewer';

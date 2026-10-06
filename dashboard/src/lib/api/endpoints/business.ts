import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiKey, AuditEvent, Bot, Business, BusinessTypeId, Invite, Member, Role } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

/* Business-wide records. Scope headers are required, but these act on the business. */

export function useTenant() {
  const scope = useScope();
  return useQuery({
    queryKey: qk.tenant(scope, 'business'),
    queryFn: ({ signal }) => api<Business>('/tenant', { scope, signal }),
    staleTime: 60_000,
  });
}

export function useUpdateTenant() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; business_type?: BusinessTypeId; reply_target_hours?: number }) =>
      api<Business>('/tenant', { method: 'PATCH', body, scope }),
    onSuccess: (b) => {
      qc.setQueryData(qk.tenant(scope, 'business'), b);
      qc.invalidateQueries({ queryKey: qk.me });
    },
    meta: { success: 'Business details saved' },
  });
}

export function useLeaveTenant() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/tenant/leave', { method: 'POST', scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

/* Members ------------------------------------------------------------ */

export function useMembers(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.tenant(scope, 'members'),
    queryFn: ({ signal }) => api<{ data: Member[] }>('/members', { scope, signal }).then((r) => r.data),
    staleTime: 60_000,
    enabled,
  });
}

export function useUpdateMember() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api<Member>(`/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: { role }, scope }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'members') });
      qc.invalidateQueries({ queryKey: qk.me });
    },
    meta: { success: 'Role updated' },
  });
}

export function useRemoveMember() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api<void>(`/members/${encodeURIComponent(userId)}`, { method: 'DELETE', scope }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'members') });
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'business') });
    },
    meta: { success: 'Member removed' },
  });
}

/* Invitations -------------------------------------------------------- */

export function useInvites(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.tenant(scope, 'invites'),
    queryFn: ({ signal }) => api<{ data: Invite[] }>('/invites', { scope, signal }).then((r) => r.data),
    enabled,
  });
}

export function useCreateInvite() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: Role }) => api<Invite>('/invites', { method: 'POST', body, scope }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'invites') });
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'business') });
    },
  });
}

export function useRevokeInvite() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/invites/${id}`, { method: 'DELETE', scope }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'invites') });
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'business') });
    },
    meta: { success: 'Invitation cancelled' },
  });
}

/* Activity ----------------------------------------------------------- */

export function useAudit(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.tenant(scope, 'audit'),
    queryFn: ({ signal }) => api<{ data: AuditEvent[] }>('/audit', { scope, signal }).then((r) => r.data),
    enabled,
  });
}

/* Bots --------------------------------------------------------------- */

export function useBots() {
  const scope = useScope();
  return useQuery({
    queryKey: qk.tenant(scope, 'bots'),
    queryFn: ({ signal }) => api<{ data: Bot[] }>('/bots', { scope, signal }).then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useCreateBot() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { bot_id: string; name: string }) => api<Bot>('/bots', { method: 'POST', body, scope }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tenant(scope) });
      qc.invalidateQueries({ queryKey: qk.me });
    },
    meta: { success: 'Bot created' },
  });
}

/* Chat API keys ------------------------------------------------------ */

export function useApiKeys(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.tenant(scope, 'api-keys'),
    queryFn: ({ signal }) => api<{ data: ApiKey[] }>('/api-keys', { scope, signal }).then((r) => r.data),
    enabled,
  });
}

export function useCreateApiKey() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { bot_id: string; name: string }) => api<ApiKey>('/api-keys', { method: 'POST', body, scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tenant(scope, 'api-keys') }),
  });
}

export function useRevokeApiKey() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api-keys/${id}`, { method: 'DELETE', scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tenant(scope, 'api-keys') }),
    meta: { success: 'Key revoked. It stops working within a minute.' },
  });
}

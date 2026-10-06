import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Business, BusinessType, BusinessTypeId, InvitePreview, Me, Plan } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';

/* Account endpoints: a signed-in person's token, no scope headers. */

export const fetchMe = (signal?: AbortSignal) => api<Me>('/me', { signal });

export function useMe(enabled = true) {
  return useQuery({ queryKey: qk.me, queryFn: ({ signal }) => fetchMe(signal), enabled, staleTime: 60_000 });
}

export function useHealth() {
  return useQuery({
    queryKey: qk.health,
    queryFn: ({ signal }) => api<{ status: string }>('/health', { signal }),
    refetchInterval: 60_000,
    retry: false,
    meta: { silent: true },
  });
}

export function useBusinessTypes() {
  return useQuery({
    queryKey: qk.businessTypes,
    queryFn: ({ signal }) => api<{ data: BusinessType[] }>('/business-types', { signal }).then((r) => r.data),
    staleTime: Infinity,
  });
}

export function usePlans() {
  return useQuery({
    queryKey: qk.plans,
    queryFn: ({ signal }) => api<{ data: Plan[] }>('/plans', { signal }).then((r) => r.data),
    staleTime: 10 * 60_000,
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; business_type: BusinessTypeId }) =>
      api<{ tenant: Business; bot_id: string }>('/tenants', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export const previewInvite = (token: string) => api<InvitePreview>('/invites/preview', { method: 'POST', body: { token } });

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api<InvitePreview>('/invites/accept', { method: 'POST', body: { token } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
    meta: { silent: true },
  });
}

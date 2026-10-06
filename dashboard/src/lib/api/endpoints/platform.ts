import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type {
  Business,
  Limits,
  PlanId,
  PlatformBusiness,
  PlatformBusinessDetail,
  PlatformModel,
  PlatformOverview,
  PlatformTemplate,
  PlatformTicket,
  PlatformTool,
  PlatformUsageRow,
  PlatformUser,
  TicketPriority,
  TicketStatus,
} from '@/lib/api/types';
import type { Range } from './stats';
import { qk } from '@/lib/query-keys';

/* Platform administration: a platform admin's token, no scope headers. */

export function usePlatformOverview() {
  return useQuery({
    queryKey: qk.platform('overview'),
    queryFn: ({ signal }) => api<PlatformOverview>('/platform/overview', { signal }),
  });
}

export function usePlatformTenants() {
  return useQuery({
    queryKey: qk.platform('tenants'),
    queryFn: ({ signal }) => api<{ data: PlatformBusiness[] }>('/platform/tenants', { signal }).then((r) => r.data),
  });
}

export function usePlatformTenantDetail(id: string | null) {
  return useQuery({
    queryKey: qk.platform('tenant', id),
    queryFn: ({ signal }) => api<PlatformBusinessDetail>(`/platform/tenants/${id}/detail`, { signal }),
    enabled: Boolean(id),
  });
}

export function useUpdatePlatformTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { plan?: PlanId; status?: 'active' | 'suspended'; limits?: Partial<Limits> } }) =>
      api<Business>(`/platform/tenants/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform() });
      qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    meta: { success: 'Business updated' },
  });
}

export function usePlatformUsers(q: string) {
  return useQuery({
    queryKey: qk.platform('users', q),
    queryFn: ({ signal }) => api<{ data: PlatformUser[] }>('/platform/users', { signal, query: { q } }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
}

export function useUpdatePlatformUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, platform_admin }: { id: string; platform_admin: boolean }) =>
      api<{ id: string; platform_admin: boolean }>(`/platform/users/${id}`, { method: 'PATCH', body: { platform_admin } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platform('users') }),
    meta: { success: 'Platform access updated' },
  });
}

export interface PlatformTicketQuery {
  tenant?: string;
  view?: 'all' | 'open' | 'needs_reply' | 'escalated';
  status?: TicketStatus;
  priority?: TicketPriority;
}

export function usePlatformTickets(params: PlatformTicketQuery) {
  return useInfiniteQuery({
    queryKey: qk.platform('tickets', params),
    queryFn: ({ pageParam, signal }) =>
      api<{ data: PlatformTicket[]; next_before?: string }>('/platform/tickets', { signal, query: { ...params, before: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_before,
  });
}

export function usePlatformTools(tenant?: string) {
  return useQuery({
    queryKey: qk.platform('tools', tenant),
    queryFn: ({ signal }) => api<{ data: PlatformTool[] }>('/platform/tools', { signal, query: { tenant } }).then((r) => r.data),
  });
}

export function useTogglePlatformTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      api<{ id: string; disabled: boolean }>(`/platform/tools/${id}`, { method: 'PATCH', body: { disabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platform('tools') }),
  });
}

export function usePlatformUsage(range: Range, group: 'tenant' | 'model' | 'day') {
  return useQuery({
    queryKey: qk.platform('usage', range, group),
    queryFn: ({ signal }) =>
      api<{ from: string; to: string; group: string; data: PlatformUsageRow[] }>('/platform/usage', { signal, query: { ...range, group } }),
    placeholderData: (prev) => prev,
  });
}

/* Model catalog -------------------------------------------------------- */

export function usePlatformModels() {
  return useQuery({
    queryKey: qk.platform('models'),
    queryFn: ({ signal }) => api<{ models: PlatformModel[] }>('/platform/models', { signal }).then((r) => r.models),
  });
}

export type ModelInput = Omit<PlatformModel, 'created_at' | 'updated_at' | 'bots'>;

export function useSavePlatformModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ existing, body }: { existing: boolean; body: Partial<ModelInput> }) =>
      existing
        ? api<PlatformModel>(`/platform/models/${encodeURIComponent(body.id!)}`, {
            method: 'PATCH',
            body: Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'id')),
          })
        : api<PlatformModel>('/platform/models', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platform('models') }),
    meta: { success: 'Model saved' },
  });
}

/* Prompt templates ------------------------------------------------------ */

export function usePlatformTemplates() {
  return useQuery({
    queryKey: qk.platform('templates'),
    queryFn: ({ signal }) => api<{ templates: PlatformTemplate[]; own_prompt_bots: number }>('/platform/prompt-templates', { signal }),
  });
}

export type TemplateInput = Pick<PlatformTemplate, 'name' | 'body' | 'description' | 'variables' | 'business_types' | 'status' | 'is_default'>;

export function useSavePlatformTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Partial<TemplateInput> }) =>
      id
        ? api<PlatformTemplate>(`/platform/prompt-templates/${id}`, { method: 'PATCH', body })
        : api<PlatformTemplate>('/platform/prompt-templates', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platform('templates') }),
    meta: { success: 'Template saved' },
  });
}

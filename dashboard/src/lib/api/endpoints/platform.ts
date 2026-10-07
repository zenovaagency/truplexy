import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type {
  Business,
  DeletionRequest,
  LedgerEntry,
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
  TenantDeletion,
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

export function useAdjustBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount: number; note: string }) =>
      api<{ entry: LedgerEntry; balance: number }>(`/platform/tenants/${id}/balance`, { method: 'POST', body: { amount, note } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform() });
      qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    meta: { success: 'Balance updated' },
  });
}

/* Deletion ------------------------------------------------------------ */

/** Deleting or restoring a business changes lists, counts and people's businesses. */
function useInvalidateDeletion() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.platform() });
    qc.invalidateQueries({ queryKey: qk.me });
    qc.invalidateQueries({ queryKey: ['tenant'] });
  };
}

export function useDeleteTenant() {
  const invalidate = useInvalidateDeletion();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api<TenantDeletion>(`/platform/tenants/${id}`, { method: 'DELETE', body: reason ? { reason } : {} }),
    onSuccess: invalidate,
    meta: { success: 'Business deleted. It can be restored for 30 days.' },
  });
}

export function useRestoreTenant() {
  const invalidate = useInvalidateDeletion();
  return useMutation({
    mutationFn: (id: string) => api<Business>(`/platform/tenants/${id}/restore`, { method: 'POST' }),
    onSuccess: invalidate,
    meta: { success: 'Business restored' },
  });
}

export function useDeletedTenants() {
  return useQuery({
    queryKey: qk.platform('deleted-tenants'),
    queryFn: ({ signal }) => api<{ data: TenantDeletion[] }>('/platform/deleted-tenants', { signal }).then((r) => r.data),
  });
}

export type DeletionRequestFilter = DeletionRequest['status'] | 'all';

export function usePlatformDeletionRequests(status: DeletionRequestFilter = 'pending') {
  return useQuery({
    queryKey: qk.platform('deletion-requests', status),
    queryFn: ({ signal }) => api<{ data: DeletionRequest[] }>('/platform/deletion-requests', { signal, query: { status } }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
}

export function useApproveDeletion() {
  const invalidate = useInvalidateDeletion();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api<TenantDeletion>(`/platform/deletion-requests/${id}/approve`, { method: 'POST', body: note ? { note } : {} }),
    onSuccess: invalidate,
    meta: { success: 'Request approved. The business is deleted and can be restored for 30 days.' },
  });
}

export function useRejectDeletion() {
  const invalidate = useInvalidateDeletion();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api<DeletionRequest>(`/platform/deletion-requests/${id}/reject`, { method: 'POST', body: note ? { note } : {} }),
    onSuccess: invalidate,
    meta: { success: 'Request rejected' },
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

/** The fields an admin sets. Leave out both prices on create and the API reads them from OpenRouter. */
export type ModelInput = Omit<
  PlatformModel,
  | 'created_at'
  | 'updated_at'
  | 'bots'
  | 'pricing_synced_at'
  | 'effective_fee_percent'
  | 'effective_commission_percent'
  | 'billed_input_price_per_mtok'
  | 'billed_output_price_per_mtok'
>;

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

export function useRefreshModelPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<PlatformModel>(`/platform/models/${encodeURIComponent(id)}/refresh-pricing`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platform('models') }),
    meta: { success: 'Prices read from OpenRouter' },
  });
}

export function useRefreshAllPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ models: PlatformModel[]; failed: { id: string; error: string }[] }>('/platform/models/refresh-pricing', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platform('models') }),
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

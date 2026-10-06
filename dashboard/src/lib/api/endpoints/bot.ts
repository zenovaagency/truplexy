import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type {
  BotConfig,
  Model,
  PromptTemplate,
  RealtimeInfo,
  Tool,
  ToolInput,
  ToolRun,
  Webhook,
  WebhookDelivery,
  Workspace,
} from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

/* Bot configuration ---------------------------------------------------- */

export function useWorkspace() {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'workspace'),
    queryFn: ({ signal }) => api<Workspace>('/workspace', { scope, signal }),
    staleTime: 30_000,
  });
}

export function useSaveWorkspace() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; bot: BotConfig; revision: number }) =>
      api<Workspace>('/workspace', { method: 'PUT', body, scope }),
    onSuccess: (ws) => {
      qc.setQueryData(qk.bot(scope, 'workspace'), ws);
      qc.invalidateQueries({ queryKey: qk.me });
      qc.invalidateQueries({ queryKey: qk.tenant(scope, 'bots') });
    },
    // The page handles WORKSPACE_CONFLICT itself with a reload dialog.
    meta: { silentCodes: ['WORKSPACE_CONFLICT'], success: 'Configuration saved. Customers get it from the next message.' },
  });
}

export function useModels() {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'models'),
    queryFn: ({ signal }) => api<{ models: Model[] }>('/models', { scope, signal }).then((r) => r.models),
    staleTime: 5 * 60_000,
  });
}

export function usePromptTemplates() {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'prompt-templates'),
    queryFn: ({ signal }) => api<{ templates: PromptTemplate[] }>('/prompt-templates', { scope, signal }).then((r) => r.templates),
    staleTime: 5 * 60_000,
  });
}

/* Tools (business-wide) ------------------------------------------------ */

export function useTools() {
  const scope = useScope();
  return useQuery({
    queryKey: qk.tenant(scope, 'tools'),
    queryFn: ({ signal }) => api<{ data: Tool[]; database_configured: boolean }>('/tools', { scope, signal }),
  });
}

export function useSaveTool() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ original, input }: { original?: string; input: ToolInput }) =>
      original
        ? api<Tool>(`/tools/${encodeURIComponent(original)}`, { method: 'PUT', body: input, scope })
        : api<Tool>('/tools', { method: 'POST', body: input, scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tenant(scope, 'tools') }),
    meta: { success: 'Tool saved' },
  });
}

export function useDeleteTool() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<void>(`/tools/${encodeURIComponent(name)}`, { method: 'DELETE', scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tenant(scope, 'tools') }),
    meta: { success: 'Tool deleted' },
  });
}

export function useTestTool() {
  const scope = useScope();
  return useMutation({
    mutationFn: ({ name, args }: { name: string; args: Record<string, unknown> }) =>
      api<ToolRun>(`/tools/${encodeURIComponent(name)}/test`, { method: 'POST', body: { arguments: args }, scope }),
  });
}

/* Webhook -------------------------------------------------------------- */

export function useWebhook(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'webhook'),
    // 404 WEBHOOK_NOT_FOUND means "none yet": an empty form, not an error.
    queryFn: ({ signal }) =>
      api<Webhook>('/webhook', { scope, signal }).catch((e) => {
        if (e?.code === 'WEBHOOK_NOT_FOUND') return null;
        throw e;
      }),
    enabled,
  });
}

export function useSaveWebhook() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string; enabled?: boolean }) => api<Webhook>('/webhook', { method: 'PUT', body, scope }),
    onSuccess: (w) => qc.setQueryData(qk.bot(scope, 'webhook'), { ...w, secret: undefined }),
  });
}

export function useDeleteWebhook() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/webhook', { method: 'DELETE', scope }),
    onSuccess: () => qc.setQueryData(qk.bot(scope, 'webhook'), null),
    meta: { success: 'Webhook removed' },
  });
}

export function useRotateWebhookSecret() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Webhook>('/webhook/secret', { method: 'POST', scope }),
    onSuccess: (w) => qc.setQueryData(qk.bot(scope, 'webhook'), { ...w, secret: undefined }),
  });
}

export function useTestWebhook() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<WebhookDelivery>('/webhook/test', { method: 'POST', scope }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'webhook') }),
  });
}

/* Live updates --------------------------------------------------------- */

export function useRealtimeInfo(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'realtime'),
    queryFn: ({ signal }) => api<RealtimeInfo>('/realtime', { scope, signal }),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    enabled,
    meta: { silent: true },
  });
}

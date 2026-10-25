import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, hasCode } from '@/lib/api/client';
import type {
  BotConfig,
  RealtimeInfo,
  Tool,
  ToolInput,
  ToolRun,
  Webhook,
  WebhookDelivery,
  Workspace,
} from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { withShopifyTools } from '@/lib/shopify';
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

/**
 * Turns on both Shopify tools for the bot and saves it: adds their names to
 * `tools` and sets `toolsEnabled`. The change only adds, so when a teammate
 * saved first it is applied once more on their version instead of asking.
 */
export function useEnableShopifyTools() {
  const scope = useScope();
  const qc = useQueryClient();
  const save = useSaveWorkspace();
  return useMutation({
    mutationFn: async () => {
      const attempt = async (fresh: boolean) => {
        const ws = fresh
          ? await qc.fetchQuery({ queryKey: qk.bot(scope, 'workspace'), queryFn: ({ signal }) => api<Workspace>('/workspace', { scope, signal }), staleTime: 0 })
          : await qc.ensureQueryData({ queryKey: qk.bot(scope, 'workspace'), queryFn: ({ signal }) => api<Workspace>('/workspace', { scope, signal }) });
        const tools = withShopifyTools(ws.bot.tools);
        if (!tools) throw new Error('This bot already uses 20 tools. Turn one off under Tools first.');
        return save.mutateAsync({ name: ws.name, bot: { ...ws.bot, toolsEnabled: true, tools }, revision: ws.revision });
      };
      try {
        return await attempt(false);
      } catch (e) {
        if (!hasCode(e, 'WORKSPACE_CONFLICT')) throw e;
        return attempt(true);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'tools') }),
    // useSaveWorkspace already toasts success and errors.
    meta: { silent: true },
  });
}

/* Tools ------------------------------------------------------------------ */

/** The business's tools, with this bot's availability: built-in tools depend on the bot's channels. */
export function useTools(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'tools'),
    queryFn: ({ signal }) => api<{ data: Tool[]; database_configured: boolean }>('/tools', { scope, signal }),
    enabled,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'tools') }),
    meta: { success: 'Tool saved' },
  });
}

export function useDeleteTool() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<void>(`/tools/${encodeURIComponent(name)}`, { method: 'DELETE', scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'tools') }),
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

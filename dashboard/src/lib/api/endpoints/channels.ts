import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Channel, ChannelInput, ChannelType, ChannelWidget, ChannelWidgetSettings } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { connectReturnTo } from '@/lib/shopify';
import { useScope } from '@/lib/session/scope-context';

/* The bot's channels. Scope headers are required; these act on the bot. */

export function useChannelTypes(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'channel-types'),
    queryFn: ({ signal }) => api<{ data: ChannelType[] }>('/channel-types', { scope, signal }).then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** The bot's channels, oldest first. `botId` reads another bot of the same business. */
export function useChannels(botId?: string, enabled = true) {
  const current = useScope();
  const scope = botId ? { tenant: current.tenant, bot: botId } : current;
  return useQuery({
    queryKey: qk.bot(scope, 'channels'),
    queryFn: ({ signal }) => api<{ data: Channel[] }>('/channels', { scope, signal }).then((r) => r.data),
    staleTime: 60_000,
    enabled,
  });
}

/** Channels change ticket and key counts both ways, so refresh all three. */
function useInvalidateChannels() {
  const scope = useScope();
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.bot(scope, 'channels') });
    qc.invalidateQueries({ queryKey: qk.tenant(scope, 'api-keys') });
    qc.invalidateQueries({ queryKey: qk.bot(scope, 'tickets') });
  };
}

export function useCreateChannel() {
  const scope = useScope();
  const invalidate = useInvalidateChannels();
  return useMutation({
    mutationFn: (body: Partial<ChannelInput>) => api<Channel>('/channels', { method: 'POST', body, scope }),
    onSuccess: invalidate,
    meta: { success: 'Channel added' },
  });
}

export interface ConnectInput {
  type: 'shopify';
  /** The store as typed: your-store, your-store.myshopify.com or its admin URL. The API normalizes it. */
  account: string;
}

/**
 * Sends the browser, in this tab, to Shopify's install page. Shopify sends it
 * back to the API, which adds the channel and returns to this page with
 * ?connected=shopify&channel_id=…&type=shopify, or ?connect_error=<code>&type=shopify.
 * The url works once, within 10 minutes, so it's asked for on every click.
 */
export function useConnectChannel() {
  const scope = useScope();
  return useMutation({
    mutationFn: (body: ConnectInput) =>
      api<{ url: string }>('/channels/connect', { method: 'POST', body: { ...body, return_to: connectReturnTo(window.location.href) }, scope }),
    onSuccess: ({ url }) => window.location.assign(url),
    // The connect control shows these next to the store field.
    meta: { silentCodes: ['INVALID_REQUEST', 'CHANNEL_TYPE_NOT_ALLOWED', 'CHANNEL_CONNECT_UNSUPPORTED', 'CHANNEL_CONNECT_UNAVAILABLE'] },
  });
}

/**
 * A Shopify channel's chat window. `poll` refreshes it every few seconds, to notice the
 * moment a page of the store first loads the window (last_seen_at).
 */
export function useChannelWidget(id: string | undefined, poll = false) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'channel-widget', id),
    queryFn: ({ signal }) => api<ChannelWidget>(`/channels/${id}/widget`, { scope, signal }),
    enabled: Boolean(id),
    staleTime: 0,
    refetchInterval: poll ? 5_000 : false,
  });
}

/** Saves the chat window's settings (and, when sent, whether it is shown). */
export function useSaveChannelWidget(id: string | undefined) {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { enabled?: boolean; settings: ChannelWidgetSettings }) => api<ChannelWidget>(`/channels/${id}/widget`, { method: 'PUT', body, scope }),
    onSuccess: (widget) => qc.setQueryData(qk.bot(scope, 'channel-widget', id), widget),
    // The form shows these next to the fields.
    meta: { silentCodes: ['INVALID_REQUEST'] },
  });
}

export function useUpdateChannel() {
  const scope = useScope();
  const invalidate = useInvalidateChannels();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ChannelInput> }) =>
      api<Channel>(`/channels/${id}`, { method: 'PATCH', body: patch, scope }),
    onSuccess: invalidate,
  });
}

export function useDeleteChannel() {
  const scope = useScope();
  const invalidate = useInvalidateChannels();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/channels/${id}`, { method: 'DELETE', scope }),
    onSuccess: invalidate,
    meta: { success: 'Channel removed. Its tickets keep its name.' },
  });
}

/** A type's icon from the catalog, falling back to the type ID (which names the default types' icons). */
export function useChannelIcon() {
  const types = useChannelTypes();
  return (type?: string) => types.data?.find((t) => t.id === type)?.icon || type;
}

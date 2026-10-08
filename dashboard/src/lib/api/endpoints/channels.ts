import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Channel, ChannelInput, ChannelType } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
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
    meta: { success: 'Channel deleted. Its tickets keep its name.' },
  });
}

/** A type's icon from the catalog, falling back to the type ID (which names the default types' icons). */
export function useChannelIcon() {
  const types = useChannelTypes();
  return (type?: string) => types.data?.find((t) => t.id === type)?.icon || type;
}

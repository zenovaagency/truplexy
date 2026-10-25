import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Widget, WidgetSettings } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';
import { imageForm } from './account';

/* The bot's chat widget: one look for every place the chat is shown (v2). */

export function useWidget(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'widget'),
    queryFn: ({ signal }) => api<Widget>('/widget', { scope, signal }),
    staleTime: 30_000,
    enabled,
  });
}

export function useSaveWidget() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: WidgetSettings) => api<Widget>('/widget', { method: 'PUT', body: { settings }, scope }),
    onSuccess: (widget) => qc.setQueryData(qk.bot(scope, 'widget'), widget),
    // The form shows these next to the fields.
    meta: { silentCodes: ['INVALID_REQUEST'], success: 'Chat widget saved' },
  });
}

/** The header picture: send the cropped square as a file. The API cuts it to a square and shrinks it again. */
export function useSetWidgetPicture() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api<{ picture_url: string }>('/widget/picture', { method: 'PUT', body: imageForm(file), scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'widget') }),
    meta: { success: 'Picture updated' },
  });
}

export function useRemoveWidgetPicture() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ picture_url: null }>('/widget/picture', { method: 'DELETE', scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'widget') }),
    meta: { success: 'Picture removed' },
  });
}

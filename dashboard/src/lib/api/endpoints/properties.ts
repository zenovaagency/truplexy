import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { PropertyDefinition, PropertyEntity, PropertyInput, PropertyPreset } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

/* Custom properties of the bot's records. Scope headers are required; these act on the bot. */

/** One entity's properties, in their order. `scopeId` narrows a per-type entity to one type. */
export function useProperties(entity: PropertyEntity, opts: { scopeId?: string; enabled?: boolean } = {}) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'properties', entity, opts.scopeId ?? ''),
    queryFn: ({ signal }) =>
      api<{ data: PropertyDefinition[] }>('/properties', { scope, signal, query: { entity, scope_id: opts.scopeId || undefined } }).then((r) => r.data),
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
  });
}

export function usePropertyPresets(entity: PropertyEntity, businessType: string | undefined, enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'properties', 'presets', entity, businessType ?? ''),
    queryFn: ({ signal }) =>
      api<{ data: PropertyPreset[] }>('/properties/presets', { scope, signal, query: { entity, business_type: businessType || undefined } }).then((r) => r.data),
    enabled,
    staleTime: Infinity,
  });
}

function useInvalidateProperties() {
  const scope = useScope();
  const qc = useQueryClient();
  // Records show their properties, so a change to a definition reloads them too.
  return () => qc.invalidateQueries({ queryKey: qk.bot(scope) });
}

export function useCreateProperty() {
  const scope = useScope();
  const invalidate = useInvalidateProperties();
  return useMutation({
    mutationFn: (body: PropertyInput) => api<PropertyDefinition>('/properties', { method: 'POST', body, scope }),
    onSuccess: invalidate,
    meta: { success: 'Property added' },
  });
}

export function useUpdateProperty() {
  const scope = useScope();
  const invalidate = useInvalidateProperties();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PropertyInput }) => api<PropertyDefinition>(`/properties/${id}`, { method: 'PATCH', body: patch, scope }),
    onSuccess: invalidate,
    meta: { success: 'Property saved' },
  });
}

/** Adds several properties, such as suggested ones, one after another; stops at the first refusal. */
export function useAddProperties() {
  const scope = useScope();
  const invalidate = useInvalidateProperties();
  return useMutation({
    mutationFn: async (bodies: PropertyInput[]) => {
      const out: PropertyDefinition[] = [];
      for (const body of bodies) out.push(await api<PropertyDefinition>('/properties', { method: 'POST', body, scope }));
      return out;
    },
    onSettled: invalidate,
    meta: { success: 'Properties added' },
  });
}

/** Moves a property up or down: two quiet PATCHes of sort_order, with one reload after. */
export function useReorderProperties() {
  const scope = useScope();
  const invalidate = useInvalidateProperties();
  return useMutation({
    mutationFn: (moves: { id: string; sort_order: number }[]) =>
      Promise.all(moves.map((m) => api<PropertyDefinition>(`/properties/${m.id}`, { method: 'PATCH', body: { sort_order: m.sort_order }, scope }))),
    onSettled: invalidate,
  });
}

export function useDeleteProperty() {
  const scope = useScope();
  const invalidate = useInvalidateProperties();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/properties/${id}`, { method: 'DELETE', scope }),
    onSuccess: invalidate,
    meta: { success: 'Property deleted' },
  });
}

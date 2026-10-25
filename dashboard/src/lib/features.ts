import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Query } from '@/lib/api/client';
import type { Permission } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { ScopeContext } from '@/lib/session/scope-context';

/**
 * Features the API added after the dashboard could rely on them. Each is asked about once per bot with a cheap
 * read; until the answer is "on", its menu entries and tabs stay hidden, so a server without the feature (404), or
 * with its migration not yet applied (a database error), looks exactly as it did before.
 */
export type Feature = 'properties' | 'products';

interface Probe {
  path: string;
  query?: Query;
  /** The probe needs this permission; without it the feature counts as off for this person. */
  permission: Permission;
}

const PROBES: Record<Feature, Probe> = {
  properties: { path: '/properties', query: { entity: 'customer' }, permission: 'properties.read' },
  products: { path: '/products', query: { limit: 1 }, permission: 'products.read' },
};

export type FeatureState = 'pending' | 'on' | 'off';

/** Outside a business (the platform console) every feature counts as off. */
export function useFeature(feature: Feature): FeatureState {
  const ctx = useContext(ScopeContext);
  const probe = PROBES[feature];
  const allowed = Boolean(ctx?.can(probe.permission));
  const scope = ctx?.scope ?? { tenant: '', bot: '' };
  const q = useQuery({
    queryKey: qk.bot(scope, 'feature', feature),
    queryFn: ({ signal }) => api<unknown>(probe.path, { scope, signal, query: probe.query }).then(() => true),
    enabled: allowed,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    meta: { silent: true },
  });
  if (!allowed || q.isError) return 'off';
  return q.isSuccess ? 'on' : 'pending';
}

/** Menu entries with a `feature` show once it is on. */
export function useFeatureNav() {
  const properties = useFeature('properties');
  const products = useFeature('products');
  const states: Record<Feature, FeatureState> = { properties, products };
  return (item: { feature?: Feature }) => !item.feature || states[item.feature] === 'on';
}

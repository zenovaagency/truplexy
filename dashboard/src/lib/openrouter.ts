import { useQuery } from '@tanstack/react-query';

/**
 * OpenRouter's public model list: list prices, context and capabilities.
 * No key and no credentials, so nothing of ours leaves the browser.
 */
const URL = 'https://openrouter.ai/api/v1/models';

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  /** USD per million tokens. */
  inPerM: number;
  outPerM: number;
  context: number;
  maxOutput: number | null;
  tools: boolean;
}

interface Raw {
  id: string;
  canonical_slug?: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { max_completion_tokens?: number | null };
  supported_parameters?: string[];
}

export interface OpenRouterCatalog {
  list: OpenRouterModel[];
  byId: Map<string, OpenRouterModel>;
}

/** Prices arrive as USD per token strings; "-1" marks a variable-price router. */
const perM = (s?: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 10_000) / 10_000 : NaN;
};

async function fetchCatalog(signal: AbortSignal): Promise<OpenRouterCatalog> {
  const res = await fetch(URL, { signal, credentials: 'omit', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OpenRouter answered ${res.status}`);
  const body = (await res.json()) as { data?: Raw[] };
  const list: OpenRouterModel[] = [];
  const byId = new Map<string, OpenRouterModel>();
  for (const r of body.data ?? []) {
    const m: OpenRouterModel = {
      id: r.id,
      name: r.name ?? r.id,
      description: r.description ?? '',
      inPerM: perM(r.pricing?.prompt),
      outPerM: perM(r.pricing?.completion),
      context: r.context_length ?? 0,
      maxOutput: r.top_provider?.max_completion_tokens ?? null,
      tools: Boolean(r.supported_parameters?.includes('tools')),
    };
    if (Number.isNaN(m.inPerM) || Number.isNaN(m.outPerM)) continue;
    list.push(m);
    byId.set(r.id, m);
    if (r.canonical_slug && !byId.has(r.canonical_slug)) byId.set(r.canonical_slug, m);
  }
  list.sort((a, b) => a.id.localeCompare(b.id));
  return { list, byId };
}

export function useOpenRouterModels() {
  return useQuery({
    queryKey: ['openrouter', 'models'],
    queryFn: ({ signal }) => fetchCatalog(signal),
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    meta: { silent: true },
  });
}

/** List price for one model, or undefined while loading, offline, or not on OpenRouter. */
export function useOpenRouterPrice(id: string | undefined) {
  const q = useOpenRouterModels();
  return { price: id ? q.data?.byId.get(id) : undefined, status: q.status };
}

/** Cost in USD of a reply with these average token counts. */
export const replyCost = (m: Pick<OpenRouterModel, 'inPerM' | 'outPerM'>, inTokens: number, outTokens: number) => (inTokens * m.inPerM + outTokens * m.outPerM) / 1e6;

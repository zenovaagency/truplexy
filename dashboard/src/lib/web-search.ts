import type { PlaygroundRunInput, WebSearchConfig } from '@/lib/api/types';

/** What the API fills in for missing fields. */
export const DEFAULT_WEB_SEARCH: WebSearchConfig = {
  enabled: false,
  mode: 'fallback',
  maxResults: 3,
  depth: 'basic',
  topic: 'general',
  timeRange: '',
  includeDomains: [],
  excludeDomains: [],
};

export const webSearchOf = (c: Partial<WebSearchConfig> | undefined): WebSearchConfig => ({ ...DEFAULT_WEB_SEARCH, ...c });

/** The bot's settings as the playground takes them, in snake_case. */
export function playgroundWebSearch(c: Partial<WebSearchConfig> | undefined): PlaygroundRunInput['web_search'] {
  const w = webSearchOf(c);
  return {
    enabled: w.enabled,
    mode: w.mode,
    max_results: w.maxResults,
    depth: w.depth,
    topic: w.topic,
    time_range: w.timeRange,
    include_domains: w.includeDomains,
    exclude_domains: w.excludeDomains,
  };
}

/** Hostnames from free text: "https://Docs.Example.com/x, example.org" → ["docs.example.com", "example.org"]. */
export function parseDomains(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const host = raw
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/[/?#].*$/, '')
      .replace(/^\*\./, '');
    if (host && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) && !out.includes(host)) out.push(host);
  }
  return out.slice(0, 50);
}

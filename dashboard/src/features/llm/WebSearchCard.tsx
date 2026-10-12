import { useEffect, useState } from 'react';
import { Globe, Lock } from 'lucide-react';
import { useTenant } from '@/lib/api/endpoints/business';
import type { WebSearchConfig, WebSearchDepth, WebSearchMode, WebSearchTimeRange, WebSearchTopic } from '@/lib/api/types';
import { parseDomains, webSearchOf } from '@/lib/web-search';
import { Callout, Card, Field, Input, Segmented, Select, Switch } from '@/components/ui';
import { useBotDraft } from './draft';

/** Search the web when the knowledge base has no confident answer, or on every message. */
export function WebSearchCard() {
  const { draft, patchBot, canWrite } = useBotDraft();
  const tenant = useTenant();
  const b = draft.bot;
  const w = webSearchOf(b.webSearch);
  const ragOff = b.ragEnabled === false;
  // Unknown until the business loads; the API answers PLAN_LIMIT_REACHED either way.
  const planAllows = tenant.data?.limits.web_search !== false;
  const editable = canWrite && planAllows && !ragOff;
  const set = (p: Partial<WebSearchConfig>) => patchBot({ webSearch: { ...w, ...p } });

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Globe className="size-4 text-accent" /> Web search
        </span>
      }
      description="Look things up on the web and cite the pages, alongside the knowledge base."
    >
      <div className="grid gap-5">
        {!planAllows && (
          <Callout tone="neutral" icon={<Lock />} title="Not on this plan">
            Web search comes with a higher plan. See Settings → Plan &amp; usage.
          </Callout>
        )}
        {planAllows && ragOff && (
          <Callout tone="neutral" title="Needs the knowledge base">
            Turn on “Use the knowledge base” to let the assistant search the web too.
          </Callout>
        )}
        <Switch
          checked={w.enabled && planAllows}
          disabled={!editable}
          onCheckedChange={(v) => set({ enabled: v })}
          label="Search the web"
          description={
            tenant.data?.limits.web_searches_per_month
              ? `Up to ${tenant.data.limits.web_searches_per_month.toLocaleString()} searches a month on your plan.`
              : 'Each search that runs counts toward your plan.'
          }
        />
        <fieldset disabled={!editable || !w.enabled} className="grid gap-5 disabled:opacity-60">
          <Field label="When" hint={w.mode === 'fallback' ? "Only when the knowledge base has no confident answer." : 'On every customer message, before answering.'}>
            <Segmented<WebSearchMode>
              size="sm"
              value={w.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { value: 'fallback', label: 'As a fallback' },
                { value: 'always', label: 'Always' },
              ]}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Results per search" aside={w.maxResults} hint="More results give more context and cost more tokens.">
              <input
                type="range"
                min={1}
                max={8}
                value={w.maxResults}
                onChange={(e) => set({ maxResults: Number(e.target.value) })}
                className="w-full accent-[var(--color-btn)] disabled:opacity-50"
              />
            </Field>
            <Field label="Depth" hint="Advanced reads pages more closely and takes longer.">
              <Select
                value={w.depth}
                onChange={(e) => set({ depth: e.target.value as WebSearchDepth })}
                options={[
                  { value: 'basic', label: 'Basic' },
                  { value: 'advanced', label: 'Advanced' },
                ]}
              />
            </Field>
            <Field label="Topic">
              <Select
                value={w.topic}
                onChange={(e) => set({ topic: e.target.value as WebSearchTopic })}
                options={[
                  { value: 'general', label: 'General' },
                  { value: 'news', label: 'News' },
                ]}
              />
            </Field>
            <Field label="Published within">
              <Select
                value={w.timeRange}
                onChange={(e) => set({ timeRange: e.target.value as WebSearchTimeRange })}
                options={[
                  { value: '', label: 'Any time' },
                  { value: 'day', label: 'The last day' },
                  { value: 'week', label: 'The last week' },
                  { value: 'month', label: 'The last month' },
                  { value: 'year', label: 'The last year' },
                ]}
              />
            </Field>
          </div>
          <DomainsField
            label="Only these sites"
            hint="Leave empty to search the whole web. A domain covers its subdomains."
            value={w.includeDomains}
            onChange={(includeDomains) => set({ includeDomains })}
          />
          <DomainsField label="Never these sites" value={w.excludeDomains} onChange={(excludeDomains) => set({ excludeDomains })} />
        </fieldset>
      </div>
    </Card>
  );
}

/** Up to 50 hostnames, typed with commas or spaces between them; tidied when the box loses focus. */
function DomainsField({ label, hint, value, onChange }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value]);
  return (
    <Field label={label} optional hint={hint ?? 'Hostnames such as docs.example.com, without https:// or a path.'} aside={`${value.length}/50`}>
      <Input
        value={text}
        placeholder="docs.example.com, example.org"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const next = parseDomains(text);
          setText(next.join(', '));
          if (next.join() !== value.join()) onChange(next);
        }}
      />
    </Field>
  );
}

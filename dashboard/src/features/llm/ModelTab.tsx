import { useMemo } from 'react';
import { BookOpen, Check, Cpu, SlidersHorizontal } from 'lucide-react';
import { useModels } from '@/lib/api/endpoints/bot';
import { useUsageSummary } from '@/lib/api/endpoints/stats';
import type { Model, ModelTier } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { dayRange, formatCompact, formatCurrency, formatPerM } from '@/lib/format';
import { replyCost } from '@/lib/openrouter';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Badge, Card, ErrorState, Field, Input, SkeletonRows, Switch } from '@/components/ui';
import { useBotDraft } from './draft';
import { ViewOnly } from './LlmPage';

export const TIER: Record<ModelTier, { label: string; tone: 'neutral' | 'accent' | 'violet' }> = {
  economy: { label: 'Economy', tone: 'neutral' },
  standard: { label: 'Standard', tone: 'accent' },
  premium: { label: 'Premium', tone: 'violet' },
};

/** Used for the per-reply estimate until the bot has usage of its own. */
const TYPICAL = { in: 1500, out: 300 };

function tempLabel(t: number) {
  if (t <= 0.3) return 'Precise';
  if (t <= 0.8) return 'Balanced';
  if (t <= 1.3) return 'Creative';
  return 'Experimental';
}

export default function ModelTab() {
  const { draft, setDraft, patchBot, canWrite } = useBotDraft();
  const { can } = useScopeCtx();
  const models = useModels();
  const range = useMemo(() => dayRange(30), []);
  const usage = useUsageSummary(range, { enabled: can('usage.read') });
  const b = draft.bot;

  const defaultModel = models.data?.find((m) => m.is_default);
  const model = models.data?.find((m) => m.id === b.model) ?? (b.model ? undefined : defaultModel);
  const maxOut = model?.max_output_tokens || 32768;

  // Average tokens per request from this bot's last 30 days, when there are any.
  const u = usage.data;
  const avg = u && u.requests > 0 ? { in: Math.round(u.input_tokens / u.requests), out: Math.round(u.output_tokens / u.requests), own: true } : { ...TYPICAL, own: false };

  const pickModel = (m: Model) => {
    if (!canWrite) return;
    patchBot({
      model: m.id,
      maxTokens: m.max_output_tokens ? Math.min(b.maxTokens ?? 800, m.max_output_tokens) : b.maxTokens,
      toolsEnabled: m.supports_tools ? b.toolsEnabled : false,
    });
  };

  return (
    <div className="grid gap-5">
      <ViewOnly />

      <Card title="Identity" description="How the assistant introduces itself.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assistant name" hint="Customers see this name." aside={`${b.name.length}/80`}>
            <Input value={b.name} disabled={!canWrite} onChange={(e) => patchBot({ name: e.target.value.slice(0, 80) })} />
          </Field>
          <Field label="Bot name" hint="Shown in this dashboard, e.g. in the bot switcher." aside={`${draft.name.length}/80`}>
            <Input value={draft.name} disabled={!canWrite} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.slice(0, 80) }))} />
          </Field>
        </div>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Cpu className="size-4 text-accent" /> Model
          </span>
        }
        description="The models Truplexy offers. Larger models write better replies but cost more per reply."
      >
        {models.isPending ? (
          <SkeletonRows rows={3} />
        ) : models.isError ? (
          <ErrorState compact error={models.error} onRetry={() => models.refetch()} />
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Model">
              {models.data.map((m) => {
                const on = model?.id === m.id;
                const p = { inPerM: m.input_price_per_mtok, outPerM: m.output_price_per_mtok };
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!canWrite || (!m.offered && !on)}
                    onClick={() => pickModel(m)}
                    className={cn(
                      'grid content-start gap-2.5 rounded-[14px] border p-4 text-left transition-all disabled:cursor-default',
                      on ? 'border-accent bg-accent-soft/50 ring-2 ring-accent/20' : 'border-line bg-surface hover:border-line-strong',
                    )}
                  >
                    <span className="flex items-start gap-2">
                      <span className="grid min-w-0 flex-1">
                        <span className="font-semibold text-ink">{m.label}</span>
                        <span className="truncate font-mono text-[0.68rem] text-ink-faint">{m.id}</span>
                      </span>
                      {on && <Check className="size-4 shrink-0 text-accent" />}
                    </span>
                    <span className="text-[0.8125rem] leading-snug text-ink-muted">{m.description}</span>
                    <span className="grid grid-cols-2 gap-2 rounded-[10px] bg-surface-2 px-3 py-2 text-xs">
                      <span className="grid">
                        <span className="text-ink-faint">Input / 1M</span>
                        <span className="font-mono font-semibold tabular-nums text-ink">{formatPerM(p.inPerM)}</span>
                      </span>
                      <span className="grid">
                        <span className="text-ink-faint">Output / 1M</span>
                        <span className="font-mono font-semibold tabular-nums text-ink">{formatPerM(p.outPerM)}</span>
                      </span>
                      <span className="col-span-2 border-t border-line pt-1.5 text-ink-muted">
                        ≈ <span className="font-semibold text-ink">{formatCurrency(replyCost(p, avg.in, avg.out) * 1000)}</span> per 1,000 replies
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={TIER[m.tier].tone}>{TIER[m.tier].label}</Badge>
                      <Badge tone="outline">{formatCompact(m.context_tokens)} context</Badge>
                      {m.supports_tools && <Badge tone="outline">Tools</Badge>}
                      {m.is_default && <Badge tone="outline">Default</Badge>}
                      {!m.offered && <Badge tone="warn">No longer offered</Badge>}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* <p className="flex items-start gap-1.5 text-xs text-ink-faint">
              <Info className="mt-px size-3.5 shrink-0" />
              <span>
                List prices from OpenRouter, refreshed hourly; your plan's billing may differ. Estimates assume{' '}
                {avg.own ? `this bot's average of ${formatNumber(avg.in)} input and ${formatNumber(avg.out)} output tokens per reply over 30 days` : `a typical ${formatNumber(TYPICAL.in)} input and ${formatNumber(TYPICAL.out)} output tokens per reply`}
                .
              </span>
            </p> */}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-accent" /> Replies
            </span>
          }
          description="How long and how varied answers are."
        >
          <div className="grid gap-5">
            <Field label="Temperature" aside={`${(b.temperature ?? 0.4).toFixed(1)} · ${tempLabel(b.temperature ?? 0.4)}`} hint="Lower is more consistent; higher is more varied. Support usually works best between 0.2 and 0.6.">
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={b.temperature ?? 0.4}
                disabled={!canWrite}
                onChange={(e) => patchBot({ temperature: Number(e.target.value) })}
                className="w-full accent-[var(--color-btn)]"
              />
            </Field>
            <Field label="Maximum reply length" hint={`In tokens, about ¾ of a word each. This model allows up to ${maxOut.toLocaleString()}.`}>
              <Input
                type="number"
                min={1}
                max={maxOut}
                value={b.maxTokens ?? ''}
                disabled={!canWrite}
                onChange={(e) => patchBot({ maxTokens: Math.max(1, Math.min(maxOut, Number(e.target.value) || 1)) })}
              />
            </Field>
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <BookOpen className="size-4 text-accent" /> Knowledge retrieval
            </span>
          }
          description="Answer from the knowledge base and cite it."
        >
          <div className="grid gap-5">
            <Switch
              checked={b.ragEnabled ?? true}
              disabled={!canWrite}
              onCheckedChange={(v) => patchBot({ ragEnabled: v })}
              label="Use the knowledge base"
              description="Off means the assistant answers from its instructions alone."
            />
            <Field
              label="Passages per message"
              aside={b.topK ?? 4}
              hint="More passages give more context but cost more and can distract the model."
            >
              <input
                type="range"
                min={1}
                max={20}
                value={b.topK ?? 4}
                disabled={!canWrite || b.ragEnabled === false}
                onChange={(e) => patchBot({ topK: Number(e.target.value) })}
                className="w-full accent-[var(--color-btn)] disabled:opacity-50"
              />
            </Field>
          </div>
        </Card>
      </div>
    </div>
  );
}

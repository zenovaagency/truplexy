import { useMemo } from 'react';
import { Check, FileText, Lock, MessageSquareText } from 'lucide-react';
import { usePromptTemplates } from '@/lib/api/endpoints/bot';
import type { PromptTemplate } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { useScopeCtx } from '@/lib/session/scope-context';
import { BUILTIN_VARIABLES, renderTemplate } from '@/lib/template';
import { Badge, Callout, Card, ErrorState, Field, Input, SkeletonRows, Textarea } from '@/components/ui';
import { useBotDraft } from './draft';
import { ViewOnly } from './LlmPage';

export default function PromptTab() {
  const { draft, setDraft, patchBot, canWrite } = useBotDraft();
  const { businessName } = useScopeCtx();
  const templates = usePromptTemplates();
  const b = draft.bot;

  const template = templates.data?.find((t) => t.id === b.promptTemplateId);
  const legacy = Boolean(b.prompt && !b.promptTemplateId);

  const pickTemplate = (t: PromptTemplate) => {
    if (!canWrite || t.id === b.promptTemplateId) return;
    // Keep values for keys the new template shares; choosing a template clears a legacy prompt.
    const vars = Object.fromEntries(t.variables.map((v) => [v.key, b.promptVariables?.[v.key] ?? '']));
    patchBot({ promptTemplateId: t.id, promptVariables: vars, prompt: '' });
  };

  const preview = useMemo(
    () =>
      template
        ? renderTemplate(template.body, { ...b.promptVariables, business_name: businessName, assistant_name: b.name })
        : '',
    [template, b.promptVariables, b.name, businessName],
  );

  return (
    <div className="grid gap-5">
      <ViewOnly />

      <Card title="Identity" description="How the assistant introduces itself.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assistant name" hint="Customers see this, and templates use it as {{assistant_name}}." aside={`${b.name.length}/80`}>
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
            <MessageSquareText className="size-4 text-accent" /> System prompt
          </span>
        }
        description="Pick a prompt template made for your business type, then fill in the details about your business."
      >
        {templates.isPending ? (
          <SkeletonRows rows={3} />
        ) : templates.isError ? (
          <ErrorState compact error={templates.error} onRetry={() => templates.refetch()} />
        ) : (
          <div className="grid gap-5">
            {legacy && (
              <Callout tone="warn" icon={<FileText />} title="This bot uses its own older prompt">
                It's read-only and stays in use until you pick a template below.
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-[10px] bg-surface p-3 font-mono text-xs text-ink">{b.prompt}</pre>
              </Callout>
            )}
            <div className="grid gap-2.5 md:grid-cols-2" role="radiogroup" aria-label="Prompt template">
              {templates.data.map((t) => {
                const on = t.id === b.promptTemplateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!canWrite || (!t.offered && !on)}
                    onClick={() => pickTemplate(t)}
                    className={cn(
                      'grid gap-1 rounded-[14px] border p-4 text-left transition-all disabled:cursor-default',
                      on ? 'border-accent bg-accent-soft/50 ring-2 ring-accent/20' : 'border-line bg-surface hover:border-line-strong',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex-1 font-semibold text-ink">{t.name}</span>
                      {t.is_default && <Badge tone="outline">Default</Badge>}
                      {!t.offered && <Badge tone="warn">No longer offered</Badge>}
                      {on && <Check className="size-4 text-accent" />}
                    </span>
                    <span className="text-[0.8125rem] text-ink-muted">{t.description}</span>
                  </button>
                );
              })}
            </div>

            {template && (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="grid content-start gap-4">
                  <p className="mono text-ink-faint">About your business</p>
                  {template.variables.filter((v) => !(BUILTIN_VARIABLES as readonly string[]).includes(v.key)).length === 0 && (
                    <p className="text-[0.8125rem] text-ink-faint">This template needs no extra details.</p>
                  )}
                  {template.variables
                    .filter((v) => !(BUILTIN_VARIABLES as readonly string[]).includes(v.key))
                    .map((v) => {
                      const val = b.promptVariables?.[v.key] ?? '';
                      const long = v.max_length > 160;
                      const missing = v.required && !val.trim();
                      return (
                        <Field
                          key={v.key}
                          label={v.label}
                          optional={!v.required}
                          hint={v.help}
                          error={missing && canWrite ? 'Required to save.' : undefined}
                          aside={long ? `${val.length}/${v.max_length}` : undefined}
                        >
                          {long ? (
                            <Textarea
                              rows={3}
                              value={val}
                              disabled={!canWrite}
                              onChange={(e) => patchBot({ promptVariables: { ...b.promptVariables, [v.key]: e.target.value.replace(/\n/g, ' ').slice(0, v.max_length) } })}
                            />
                          ) : (
                            <Input
                              value={val}
                              disabled={!canWrite}
                              onChange={(e) => patchBot({ promptVariables: { ...b.promptVariables, [v.key]: e.target.value.slice(0, v.max_length) } })}
                            />
                          )}
                        </Field>
                      );
                    })}
                </div>
                <div className="grid content-start gap-2">
                  <p className="mono flex items-center justify-between text-ink-faint">
                    Preview
                    <span className="normal-case tracking-normal">Updates as you type</span>
                  </p>
                  <div className="overflow-hidden rounded-[14px] border border-line">
                    <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3.5 py-2 text-xs text-ink-muted">
                      <Lock className="size-3.5 text-ink-faint" />
                      Truplexy's fixed safety and formatting instructions come first.
                    </div>
                    <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap bg-surface p-4 text-[0.8125rem] leading-relaxed text-ink">{preview}</pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

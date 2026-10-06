import { Link } from 'react-router';
import { Bot } from 'lucide-react';
import { useModels, useTools } from '@/lib/api/endpoints/bot';
import { cn } from '@/lib/cn';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Badge, Card, Checkbox, ErrorState, SkeletonRows, Switch } from '@/components/ui';
import { useBotDraft } from '@/features/llm/draft';

/** Which tools this bot may call. Part of the bot's draft, saved with the save bar. */
export function BotToolsCard() {
  const { draft, patchBot, canWrite } = useBotDraft();
  const { bot, href } = useScopeCtx();
  const tools = useTools();
  const models = useModels();
  const b = draft.bot;
  const model = models.data?.find((m) => m.id === b.model) ?? (b.model ? undefined : models.data?.find((m) => m.is_default));
  const modelSupportsTools = model?.supports_tools ?? true;
  const selected = new Set(b.tools ?? []);
  const toggle = (name: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(name);
    else next.delete(name);
    patchBot({ tools: [...next] });
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Bot className="size-4 text-accent" /> Tools {bot.name} may call
        </span>
      }
      description={`${selected.size} of 20 chosen. Only these are offered to the model.`}
    >
      <div className="grid gap-4">
        <Switch
          checked={Boolean(b.toolsEnabled)}
          disabled={!canWrite || !modelSupportsTools}
          onCheckedChange={(v) => patchBot({ toolsEnabled: v })}
          label="Allow tool calls"
          description={
            modelSupportsTools ? (
              'Off means the assistant answers without calling any tool.'
            ) : (
              <>
                {model?.label ?? 'The selected model'} can't call tools.{' '}
                <Link to={href('llm/model')} className="font-semibold text-accent hover:underline">
                  Pick a model marked Tools
                </Link>
                .
              </>
            )
          }
        />
        {b.toolsEnabled &&
          (tools.isPending ? (
            <SkeletonRows rows={2} />
          ) : tools.isError ? (
            <ErrorState compact error={tools.error} />
          ) : !tools.data.data.length ? (
            <p className="text-[0.8125rem] text-ink-faint">No tools yet. Add one to the library below.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {tools.data.data.map((t) => (
                <li key={t.name} className={cn('rounded-[12px] border border-line p-3', !t.available && 'opacity-60')}>
                  <Checkbox
                    checked={selected.has(t.name)}
                    disabled={!canWrite || (!selected.has(t.name) && (selected.size >= 20 || !t.available))}
                    onChange={(e) => toggle(t.name, e.target.checked)}
                    label={
                      <span className="grid">
                        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-ink">
                          {t.name}
                          {!t.read_only && <Badge tone="warn" className="px-1.5 py-0 font-sans text-[0.65rem]">Changes data</Badge>}
                        </span>
                        <span className="line-clamp-1 text-xs text-ink-faint">{t.available ? t.description : t.unavailable_reason}</span>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          ))}
      </div>
    </Card>
  );
}

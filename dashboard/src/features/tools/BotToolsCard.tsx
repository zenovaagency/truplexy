import { AlertTriangle, Bot } from 'lucide-react';
import { useTools } from '@/lib/api/endpoints/bot';
import { cn } from '@/lib/cn';
import { useScopeCtx } from '@/lib/session/scope-context';
import { storeToolPlatform } from '@/lib/woocommerce';
import { Badge, Button, Callout, Card, Checkbox, ErrorState, SkeletonRows, Switch } from '@/components/ui';
import { useBotDraft } from '@/features/llm/draft';

/** Which tools this bot may call. Part of the bot's draft, saved with the save bar. */
export function BotToolsCard() {
  const { draft, patchBot, canWrite } = useBotDraft();
  const { bot } = useScopeCtx();
  const tools = useTools();
  const b = draft.bot;
  const selected = new Set(b.tools ?? []);
  const toggle = (name: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(name);
    else next.delete(name);
    patchBot({ tools: [...next] });
  };

  // Replies leave out a chosen tool that is unavailable or no longer in the library.
  const library = tools.data?.data ?? [];
  const deleted = [...selected].filter((name) => !library.some((t) => t.name === name));
  const skipped = new Set([...library.filter((t) => selected.has(t.name) && !t.available).map((t) => t.name), ...(tools.data ? deleted : [])]);

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
          disabled={!canWrite}
          onCheckedChange={(v) => patchBot({ toolsEnabled: v })}
          label="Allow tool calls"
          description="Off means the assistant answers without calling any tool."
        />
        {b.toolsEnabled && skipped.size > 0 && (
          <Callout
            tone="warn"
            icon={<AlertTriangle />}
            title={`${skipped.size} chosen ${skipped.size === 1 ? 'tool is' : 'tools are'} skipped in replies`}
            action={
              canWrite && (
                <Button size="xs" variant="ghost" onClick={() => patchBot({ tools: [...selected].filter((n) => !skipped.has(n)) })}>
                  Remove {skipped.size === 1 ? 'it' : 'them'}
                </Button>
              )
            }
          >
            {skipped.size === 1 ? "It's" : "They're"} unavailable or deleted, so {bot.name} answers without {skipped.size === 1 ? 'it' : 'them'}.
          </Callout>
        )}
        {b.toolsEnabled &&
          (tools.isPending ? (
            <SkeletonRows rows={2} />
          ) : tools.isError ? (
            <ErrorState compact error={tools.error} />
          ) : !library.length && !deleted.length ? (
            <p className="text-[0.8125rem] text-ink-faint">No tools yet. Add one to the library below.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {library.map((t) => (
                <li key={t.name} className={cn('rounded-[12px] border border-line p-3', !t.available && 'opacity-60')}>
                  <Checkbox
                    checked={selected.has(t.name)}
                    disabled={!canWrite || (!selected.has(t.name) && (selected.size >= 20 || !t.available))}
                    onChange={(e) => toggle(t.name, e.target.checked)}
                    label={
                      <span className="grid">
                        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-ink">
                          {t.name}
                          {t.built_in && <Badge tone="accent" className="px-1.5 py-0 font-sans text-[0.65rem]">{storeToolPlatform(t) ? `Built-in · ${storeToolPlatform(t)}` : 'Built-in'}</Badge>}
                          {!t.read_only && <Badge tone="warn" className="px-1.5 py-0 font-sans text-[0.65rem]">Changes data</Badge>}
                          {skipped.has(t.name) && <Badge tone="danger" className="px-1.5 py-0 font-sans text-[0.65rem]">Skipped</Badge>}
                        </span>
                        <span className="line-clamp-1 text-xs text-ink-faint">{t.available ? t.description : t.unavailable_reason}</span>
                      </span>
                    }
                  />
                </li>
              ))}
              {deleted.map((name) => (
                <li key={name} className="rounded-[12px] border border-dashed border-line p-3 opacity-60">
                  <Checkbox
                    checked
                    disabled={!canWrite}
                    onChange={(e) => toggle(name, e.target.checked)}
                    label={
                      <span className="grid">
                        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-ink">
                          {name}
                          <Badge tone="danger" className="px-1.5 py-0 font-sans text-[0.65rem]">Deleted</Badge>
                        </span>
                        <span className="line-clamp-1 text-xs text-ink-faint">No longer in the library. Untick to remove it.</span>
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

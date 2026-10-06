import { useState } from 'react';
import { Command } from 'cmdk';
import { ChevronDown, Search } from 'lucide-react';
import { formatCompact, formatPerM } from '@/lib/format';
import { useOpenRouterModels, type OpenRouterModel } from '@/lib/openrouter';
import { Popover, PopoverContent, PopoverTrigger, Spinner } from '@/components/ui';

/** Search OpenRouter's public catalog and fill a model from it. */
export function OpenRouterPicker({ onPick }: { onPick: (m: OpenRouterModel) => void }) {
  const [open, setOpen] = useState(false);
  const q = useOpenRouterModels();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="input flex items-center gap-2 text-left">
        <Search className="size-4 text-ink-faint" />
        <span className="flex-1 truncate text-ink-faint">Search {q.data ? `${q.data.list.length} ` : ''}OpenRouter models…</span>
        <ChevronDown className="size-4 text-ink-faint" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(440px,calc(100vw-32px))] p-0">
        <Command className="[&_[cmdk-item]]:flex [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item]]:items-center [&_[cmdk-item]]:gap-3 [&_[cmdk-item]]:rounded-[9px] [&_[cmdk-item]]:px-2.5 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:text-[0.8125rem] [&_[cmdk-item][data-selected=true]]:bg-surface-2">
          <Command.Input autoFocus placeholder="gemini, claude, gpt…" className="h-10 w-full border-b border-line bg-transparent px-3 text-[0.8125rem] outline-none placeholder:text-ink-faint" />
          <Command.List className="max-h-80 overflow-y-auto p-1.5">
            {q.isPending ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-ink-faint">
                <Spinner /> Loading OpenRouter's catalog…
              </div>
            ) : q.isError ? (
              <p className="py-6 text-center text-xs text-ink-faint">OpenRouter couldn't be reached. Enter the model by hand.</p>
            ) : (
              <>
                <Command.Empty className="py-6 text-center text-xs text-ink-faint">No model matches.</Command.Empty>
                {q.data.list.map((m) => (
                  <Command.Item
                    key={m.id}
                    value={`${m.id} ${m.name}`}
                    onSelect={() => {
                      onPick(m);
                      setOpen(false);
                    }}
                  >
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-medium text-ink">{m.name}</span>
                      <span className="truncate font-mono text-[0.68rem] text-ink-faint">{m.id}</span>
                    </span>
                    <span className="grid shrink-0 text-right font-mono text-[0.68rem] tabular-nums text-ink-muted">
                      <span>
                        {formatPerM(m.inPerM)} / {formatPerM(m.outPerM)}
                      </span>
                      <span className="text-ink-faint">{formatCompact(m.context)} ctx</span>
                    </span>
                  </Command.Item>
                ))}
              </>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Whether a configured price differs from OpenRouter's list price. */
export const priceDiffers = (configured: number, list: number) => Math.abs(configured - list) > 0.0005;

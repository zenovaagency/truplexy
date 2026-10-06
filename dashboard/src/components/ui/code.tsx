import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CopyButton } from './display';

export interface CodeSample {
  label: string;
  lang?: string;
  code: string;
}

/** A code panel with optional language tabs and a copy button. Always dark, like a terminal. */
export function CodeBlock({
  samples,
  code,
  title,
  className,
  maxHeight = 420,
}: {
  samples?: CodeSample[];
  code?: string;
  title?: ReactNode;
  className?: string;
  maxHeight?: number;
}) {
  const list = samples ?? [{ label: '', code: code ?? '' }];
  const [i, setI] = useState(0);
  const cur = list[Math.min(i, list.length - 1)]!;
  return (
    <div className={cn('overflow-hidden rounded-[14px] border border-[var(--code-line)] bg-[var(--code-bg)] text-[var(--code-ink)]', className)}>
      <div className="flex items-center gap-1 border-b border-white/10 py-1 pl-2 pr-1">
        {title && !samples && <span className="px-2 font-mono text-[0.7rem] text-white/50">{title}</span>}
        {samples && (
          <div className="flex flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]" role="tablist">
            {list.map((s, idx) => (
              <button
                key={s.label}
                type="button"
                role="tab"
                aria-selected={idx === i}
                onClick={() => setI(idx)}
                className={cn(
                  'h-7 whitespace-nowrap rounded-md px-2.5 font-mono text-[0.7rem] transition-colors [@media(pointer:coarse)]:min-h-0',
                  idx === i ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto [&_button]:text-white/60 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
          <CopyButton value={cur.code} label="Copy code" />
        </div>
      </div>
      <pre className="code overflow-auto px-4 py-3.5" style={{ maxHeight }}>
        <code>{cur.code}</code>
      </pre>
    </div>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="rounded-[5px] border border-line bg-surface-2 px-1 py-px font-mono text-[0.78em] text-ink">{children}</code>;
}

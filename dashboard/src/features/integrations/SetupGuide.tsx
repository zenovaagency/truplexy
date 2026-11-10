import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';

/** A screenshot of the step in Meta, with what to click outlined. Served from public/guides. */
export interface GuideShot {
  src: string;
  alt: string;
}

export interface GuideStep {
  title: string;
  body: ReactNode;
  shots?: GuideShot[];
  /** Where in Meta the step is done. */
  link?: { href: string; label: string };
}

export const B = ({ children }: { children: ReactNode }) => <b className="font-semibold text-ink">{children}</b>;
export const C = ({ children }: { children: ReactNode }) => <code className="rounded bg-surface-2 px-1 py-px font-mono text-[0.75rem] text-ink">{children}</code>;

/** "a, b and c" with each item in code. */
export function CodeList({ items }: { items: string[] }) {
  return (
    <>
      {items.map((p, i) => (
        <span key={p}>
          <C>{p}</C>
          {i < items.length - 2 ? ', ' : i === items.length - 2 ? ' and ' : ''}
        </span>
      ))}
    </>
  );
}

/**
 * One step at a time: a short instruction, a screenshot of the screen in Meta with what to click
 * outlined, and a link to that screen. The progress bar jumps to any step.
 */
export function SetupGuide({ steps, after, label = 'Setup steps' }: { steps: GuideStep[]; after?: string; label?: string }) {
  const [at, setAt] = useState(0);
  const step = steps[at]!;
  const last = at === steps.length - 1;
  return (
    <div className="grid gap-4 rounded-[14px] border border-line bg-surface p-4" role="group" aria-label={label}>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-ink-muted">
            Step {at + 1} of {steps.length}
          </span>
        </div>
        <div className="flex gap-1">
          {steps.map((s, i) => (
            <button
              key={s.title}
              type="button"
              aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === at ? 'step' : undefined}
              onClick={() => setAt(i)}
              className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= at ? 'bg-ink' : 'bg-line hover:bg-ink-faint')}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        <h4 className="text-[0.9375rem] font-bold text-ink">{step.title}</h4>
        <div className="grid gap-2 text-[0.8125rem] leading-relaxed text-ink-muted">{step.body}</div>
        {step.shots?.map((shot) => (
          <a key={shot.src} href={shot.src} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border border-line" title="Open full size">
            <img src={shot.src} alt={shot.alt} loading="lazy" className="block h-auto w-full" />
            <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Maximize2 className="size-3.5" />
            </span>
          </a>
        ))}
        {step.link && (
          <a href={step.link.href} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-[0.8125rem] font-semibold text-accent hover:underline">
            {step.link.label}
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <Button type="button" size="sm" variant="ghost" leading={<ArrowLeft />} disabled={at === 0} onClick={() => setAt(at - 1)}>
          Back
        </Button>
        {last ? (
          after && <span className="text-xs font-semibold text-ink-muted">{after}</span>
        ) : (
          <Button type="button" size="sm" variant="soft" onClick={() => setAt(at + 1)}>
            Next: {steps[at + 1]!.title}
            <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import wordmarkLight from '@/assets/brand/wordmark-light.webp';
import { BrandMark } from '@/components/layout/Brand';
import { cn } from '@/lib/cn';

const POINTS = [
  'One assistant for web chat, WhatsApp, Telegram, Discord, Shopify and more',
  'Answers from your own knowledge base, in a human voice',
  'Hands off to your team the moment a person is needed',
];

/** Split screen: the form on the right, a brand panel on the left from 1024px. Without the aside, one centered column. */
export function AuthFrame({ children, aside = true }: { children: ReactNode; aside?: boolean }) {
  return (
    <div className={cn('grid min-h-dvh bg-paper', aside && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]')}>
      {aside && (
        <aside className="relative hidden overflow-hidden bg-[#0b0f24] p-12 text-white lg:flex lg:flex-col">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(60% 50% at 10% 0%, rgb(69 212 255 / 0.28), transparent 70%), radial-gradient(50% 60% at 100% 100%, rgb(106 43 255 / 0.35), transparent 70%)',
            }}
          />
          <div className="relative">
            <span className="inline-block h-7 [&_img]:h-full">
              <img src={wordmarkLight} alt="Truplexy" />
            </span>
          </div>
          <div className="relative mt-auto grid max-w-md gap-8">
            <h2 className="text-[2rem] font-bold leading-[1.15] tracking-tight">
              Support that sounds like your best person on their best day.
            </h2>
            <ul className="grid gap-3.5">
              {POINTS.map((p) => (
                <li key={p} className="flex gap-3 text-[0.9375rem] text-white/75">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/10">
                    <Check className="size-3" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <div className="grid gap-2.5 rounded-[18px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <div className="max-w-[80%] self-start rounded-[14px] rounded-bl-[5px] bg-white/10 px-3 py-2 text-sm">Where's my order #4471?</div>
              <div className="ml-auto max-w-[85%] rounded-[14px] rounded-br-[5px] bg-[#2338e6] px-3 py-2 text-sm">
                It shipped this morning with DHL, arriving Thursday. Want the tracking link?
              </div>
            </div>
          </div>
        </aside>
      )}
      <main className="relative flex flex-col overflow-hidden px-4 py-8 sm:px-8">
        <div className={cn('aurora', aside && 'lg:hidden')} />
        <div className={cn('relative', aside && 'lg:hidden')}>
          <BrandMark className="h-7" />
        </div>
        <div className="relative mx-auto my-auto w-full max-w-[400px] py-10">{children}</div>
        <p className="relative text-center text-xs text-ink-faint">© {new Date().getFullYear()} Truplexy</p>
      </main>
    </div>
  );
}

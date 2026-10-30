import type { ReactNode } from 'react';
import { BrandMark, Bubbly } from '@/components/layout/Brand';
import { cn } from '@/lib/cn';

/** The public site. The dashboard host rewrites every path to this app, so legal pages need absolute links. */
export const SITE_URL = 'https://truplexy.com';

const LEGAL_LINKS = [
  ['Terms', '/terms'],
  ['Privacy', '/privacy'],
  ['Refunds', '/refunds'],
] as const;

/** Split screen: the form on white at the right, a cream panel with Bubbly on the left from 1024px. Without the aside, one centered column. */
export function AuthFrame({ children, aside = true }: { children: ReactNode; aside?: boolean }) {
  return (
    <div className={cn('grid min-h-dvh bg-paper', aside && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]')}>
      {aside && (
        <aside className="relative hidden border-r border-line bg-paper p-12 lg:flex lg:flex-col">
          <BrandMark className="h-7" />
          <div className="mx-auto my-auto grid max-w-md justify-items-center gap-10 py-10 text-center">
            <Bubbly size={240} />
            <div className="grid gap-3">
              <h2 className="text-[2.25rem] font-bold leading-[1.1] tracking-tight text-ink">
                Every channel.
                <br />
                <span className="text-ink-faint">One platform.</span>
              </h2>
              <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
                One assistant answers on your site, WhatsApp, Shopify and more, and hands off to your team when a person is needed.
              </p>
            </div>
          </div>
        </aside>
      )}
      <main className="relative flex flex-col overflow-hidden bg-surface px-4 py-8 sm:px-8">
        <div className={cn('relative', aside && 'lg:hidden')}>
          <BrandMark className="h-7" />
        </div>
        <div className="relative mx-auto my-auto w-full max-w-[400px] py-10">{children}</div>
        <p className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-ink-faint">
          <span>© {new Date().getFullYear()} Truplexy</span>
          {LEGAL_LINKS.map(([label, path]) => (
            <a key={path} className="hover:text-ink hover:underline" href={`${SITE_URL}${path}`} target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          ))}
        </p>
      </main>
    </div>
  );
}

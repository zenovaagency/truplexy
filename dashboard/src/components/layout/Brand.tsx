import wordmarkDark from '@/assets/brand/wordmark-dark.webp';
import wordmarkLight from '@/assets/brand/wordmark-light.webp';
import mark from '@/assets/brand/mark.webp';
import { cn } from '@/lib/cn';

/** The wordmark: dark ink on the light theme, light on the dark theme. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-block', className)}>
      <img src={wordmarkDark} alt="Truplexy" width={219} height={56} className="h-full w-auto dark:hidden" />
      <img src={wordmarkLight} alt="Truplexy" width={212} height={56} className="hidden h-full w-auto dark:block" />
    </span>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return <img src={mark} alt="Truplexy" width={90} height={96} className={cn('h-7 w-auto', className)} />;
}

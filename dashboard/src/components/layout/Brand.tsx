import { LOGO_HEIGHT, LOGO_INNER, LOGO_WIDTH, MARK_BARS, MARK_VIEWBOX } from '@/assets/brand/brand-paths';
import bubbly from '@/assets/brand/bubbly-avatar.png';
import { cn } from '@/lib/cn';

/** The Soft Triplex logo (mark and wordmark), drawn in the text colour, so it follows the theme. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-block text-ink', className)}>
      <svg
        viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`}
        fill="currentColor"
        role="img"
        aria-label="Truplexy"
        className="h-full w-auto"
        dangerouslySetInnerHTML={{ __html: LOGO_INNER }}
      />
    </span>
  );
}

/** The mark alone, in the text colour. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} fill="currentColor" role="img" aria-label="Truplexy" className={cn('h-7 w-auto text-ink', className)}>
      {MARK_BARS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Bubbly, the assistant: the avatar for anything the AI says or does. */
export function AssistantAvatar({ size = 24, className }: { size?: number; className?: string }) {
  return <img src={bubbly} alt="" width={size} height={size} className={cn('inline-block shrink-0 rounded-full', className)} style={{ width: size, height: size }} />;
}

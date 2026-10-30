import { LOGO_HEIGHT, LOGO_INNER, LOGO_WIDTH, MARK_BARS, MARK_VIEWBOX } from '@/assets/brand/brand-paths';
import bubbly from '@/assets/brand/bubbly-avatar.png';
import { cn } from '@/lib/cn';
// Shared with the marketing site, like tokens.css: one Bubbly for both.
import bubblyBody from '../../../../src/assets/brand/bubbly-body.png';
import '../../../../src/components/brand/bubbly.css';

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

/**
 * Bubbly, full size: the glossy body is a pre-rendered image and only the eyes are live SVG, so the bob,
 * blink and glance (bubbly.css) stay cheap. Mirrors the site's Bubbly.astro. `still` turns the motion off.
 */
export function Bubbly({ size = 96, still = false, className }: { size?: number; still?: boolean; className?: string }) {
  // The art's box (viewBox 636 × 707).
  const height = Math.round((size * 707) / 636);
  return (
    <span className={cn('bubbly', still && 'is-still', className)} style={{ width: size, height }} aria-hidden="true">
      <span className="bubbly-bob">
        <img src={bubblyBody} alt="" width={size} height={height} decoding="async" draggable={false} />
        <svg viewBox="0 0 636 707" focusable="false">
          <g transform="translate(-194 -144)">
            <g className="tpx-bubbly">
              <g className="face">
                <g className="eyes">
                  <g className="eye">
                    <ellipse cx="586" cy="470" rx="35" ry="52" fill="#1d1631" transform="rotate(8 586 470)" />
                    <circle cx="597.2" cy="448.2" r="10.5" fill="#fff" />
                  </g>
                  <g className="eye">
                    <ellipse cx="690" cy="460" rx="35" ry="52" fill="#1d1631" transform="rotate(8 690 460)" />
                    <circle cx="701.2" cy="438.2" r="10.5" fill="#fff" />
                  </g>
                </g>
              </g>
            </g>
          </g>
        </svg>
      </span>
    </span>
  );
}

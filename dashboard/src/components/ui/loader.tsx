import { MARK_BARS, MARK_DIRS, MARK_VIEWBOX } from '@/assets/brand/brand-paths';
import { cn } from '@/lib/cn';

/*
 * The Truplexy loader: the three Soft Triplex bars slide in along their own
 * direction, lock into the mark, hold, then slide on, each a beat after the
 * last. 1.8s loop. It takes the text colour. With reduced motion the bars
 * pulse in turn instead of moving. The base state is the still mark.
 */
const TRAVEL = 64; // mark units (the mark is 384 across)
const n = (v: number) => +v.toFixed(2);
const keyframes = MARK_DIRS.map(
  ([x, y], i) =>
    `@keyframes tpxl-${i}{0%{opacity:0;transform:translate(${n(-x * TRAVEL)}px,${n(-y * TRAVEL)}px);animation-timing-function:cubic-bezier(.2,.7,.2,1)}` +
    `22%,58%{opacity:1;transform:translate(0,0);animation-timing-function:cubic-bezier(.6,0,.8,.3)}` +
    `80%,100%{opacity:0;transform:translate(${n(x * TRAVEL)}px,${n(y * TRAVEL)}px)}}`,
).join('');
const CSS =
  '.tpxl-b{animation-duration:1.8s;animation-iteration-count:infinite;animation-fill-mode:both}' +
  MARK_BARS.map((_, i) => `.tpxl-b${i}{animation-name:tpxl-${i};animation-delay:${i * 0.16}s}`).join('') +
  keyframes +
  '@keyframes tpxl-pulse{0%,100%{opacity:1}50%{opacity:.3}}' +
  '@media (prefers-reduced-motion:reduce){.tpxl-b{animation-name:tpxl-pulse;animation-timing-function:ease-in-out}}';

// The keyframes go into the document once, not into every loader: a <style>
// inside the SVG would become part of the text of whatever holds it (a busy
// button's label, for one).
if (typeof document !== 'undefined' && !document.getElementById('tpxl-css')) {
  const style = document.createElement('style');
  style.id = 'tpxl-css';
  style.textContent = CSS;
  document.head.append(style);
}

/** `label={null}` when the surrounding control already says it is busy (e.g. a button with aria-busy). */
export function Loader({ size = 16, label = 'Loading', className }: { size?: number; label?: string | null; className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      width={size}
      height={size}
      fill="currentColor"
      {...(label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true })}
      className={cn('shrink-0 overflow-visible', className)}
    >
      {MARK_BARS.map((d, i) => (
        <path key={i} className={`tpxl-b tpxl-b${i}`} d={d} />
      ))}
    </svg>
  );
}

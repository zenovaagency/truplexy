import { reducedMotion } from './motion';

/*
 * Scrolling is the browser's own. A JS smooth-scroll layer (Lenis) used to
 * sit here; it added a second animation loop on top of the page's own and
 * made scrolling feel laggy, so wheel and touch scrolling are native again.
 * Only in-page jumps (#demo, #inbox, back to top) are smoothed, through
 * scrollIntoView / scrollTo.
 */

const behavior = (): ScrollBehavior => (reducedMotion() ? 'auto' : 'smooth');

/**
 * Scrolls so a section's content (eyebrow/heading) sits right under the nav.
 * Sections carry their own vertical padding, so aiming at the section's top
 * edge would leave a large empty band above the heading. The gap under the
 * nav comes from `scroll-padding-top` on <html> (global.css), which native
 * scrollIntoView honours.
 */
export function scrollToHash(hash: string): boolean {
  let el: Element | null = null;
  try {
    el = hash.length > 1 ? document.querySelector(decodeURIComponent(hash)) : null;
  } catch {
    return false;
  }
  if (!el) return false;

  const target = el.querySelector('.container-t') ?? el;
  target.scrollIntoView({ block: 'start', behavior: behavior() });
  if (location.hash !== hash) history.pushState(null, '', hash);
  return true;
}

/** Back to the top of the page. */
export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: behavior() });
}

// Same-page anchor links (#demo, #inbox, …) all go through scrollToHash.
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
    if (!a || a.target || !a.hash || a.origin !== location.origin || a.pathname !== location.pathname) return;
    if (scrollToHash(a.hash)) e.preventDefault();
  });
}

/** Used by the nav's mobile drawer to lock the page behind it. */
export function lockScroll(locked: boolean) {
  document.documentElement.style.overflow = locked ? 'hidden' : '';
}

import Lenis from 'lenis';
import { reducedMotion } from './motion';

type Gsap = typeof import('gsap')['gsap'];
type ScrollTriggerType = typeof import('gsap/ScrollTrigger')['ScrollTrigger'];

export interface Motion {
  gsap: Gsap;
  ScrollTrigger: ScrollTriggerType;
  reduced: boolean;
}

let motionPromise: Promise<Motion> | null = null;
let lenis: Lenis | null = null;

export const getLenis = () => lenis;

/**
 * Scrolls so a section's content (eyebrow/heading) sits right under the nav.
 * Sections carry their own vertical padding, so aiming at the section's top
 * edge would leave a large empty band above the heading. The gap under the
 * nav comes from `scroll-padding-top` on <html> (global.css), which both
 * Lenis and native scrollIntoView honour.
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
  if (lenis) lenis.scrollTo(target as HTMLElement);
  else target.scrollIntoView({ block: 'start', behavior: 'auto' });
  if (location.hash !== hash) history.pushState(null, '', hash);
  return true;
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

/**
 * Boots the scroll layer exactly once and hands back GSAP.
 *
 * GSAP and ScrollTrigger are dynamically imported so they stay off the
 * critical path — nothing here runs before first paint.
 *
 * Under `prefers-reduced-motion` we never construct Lenis at all: native
 * scrolling is returned to the browser, and callers branch on `reduced`
 * to set their final state instead of animating to it.
 */
export function motion(): Promise<Motion> {
  if (motionPromise) return motionPromise;

  motionPromise = (async () => {
    const reduced = reducedMotion();
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ]);
    gsap.registerPlugin(ScrollTrigger);

    if (!reduced) {
      lenis = new Lenis({
        lerp: 0.1,
        smoothWheel: true,
        // Touch devices keep their native scroll physics. Smoothing them
        // fights the platform and breaks momentum on iOS.
        syncTouch: false,
      });

      lenis.on('scroll', () => ScrollTrigger.update());

      // GSAP's ticker drives Lenis, so `autoRaf` stays false and there is
      // only ever one rAF loop on the page.
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    return { gsap, ScrollTrigger, reduced };
  })();

  return motionPromise;
}

function tick(time: number) {
  lenis?.raf(time * 1000);
}

/** Used by the nav's mobile drawer to lock the page behind it. */
export function lockScroll(locked: boolean) {
  if (!lenis) {
    document.documentElement.style.overflow = locked ? 'hidden' : '';
    return;
  }
  if (locked) lenis.stop();
  else lenis.start();
}

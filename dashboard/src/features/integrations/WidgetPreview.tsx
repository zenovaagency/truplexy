import { useEffect, useRef, useState } from 'react';
import type { ChannelWidgetSettings } from '@/lib/api/types';

/** The widget the storefront loads, vendored so the dashboard needs no package for a preview. */
const SCRIPT = `${import.meta.env.BASE_URL}vendor/truplexy.min.js`;
const TAG = 'truplexy-chat';

let loading: Promise<void> | null = null;

/** Loads the widget script once; it registers the <truplexy-chat> element. */
function loadWidget(): Promise<void> {
  if (typeof customElements !== 'undefined' && customElements.get(TAG)) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    // Only registers the element: the script must not mount a chat of its own on this page.
    script.dataset.manual = '';
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("The chat preview couldn't be loaded."));
    };
    document.head.append(script);
  });
  return loading;
}

/** Settings in the element's attribute names. Empty values are left out, so the window's own wording shows. */
export function widgetAttributes(s: ChannelWidgetSettings): Record<string, string> {
  const out: Record<string, string> = { accent: s.accent, theme: s.theme, position: s.position, details: s.details };
  if (s.heading) out.heading = s.heading;
  if (s.subtitle) out.subtitle = s.subtitle;
  if (s.greeting) out.greeting = s.greeting;
  if (s.placeholder) out.placeholder = s.placeholder;
  if (s.avatar_url) out.avatar = s.avatar_url;
  if (s.show_sources) out['show-sources'] = '';
  return out;
}

/**
 * How the chat window will look on the store: the real widget in its demo mode (canned replies, no
 * server), open on a stand-in page. The wrapper's transform makes the widget's fixed position
 * relative to it, so the side the window sits on shows.
 */
export function WidgetPreview({ settings }: { settings: ChannelWidgetSettings }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<'loading' | 'ready' | 'failed'>(() => (typeof customElements !== 'undefined' && customElements.get(TAG) ? 'ready' : 'loading'));
  // The element is rebuilt after a pause, not on every key press.
  const [shown, setShown] = useState(settings);

  useEffect(() => {
    const t = setTimeout(() => setShown(settings), 250);
    return () => clearTimeout(t);
  }, [settings]);

  useEffect(() => {
    let live = true;
    loadWidget().then(
      () => live && setReady('ready'),
      () => live && setReady('failed'),
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const parent = host.current;
    if (ready !== 'ready' || !parent) return;
    const el = document.createElement(TAG);
    for (const [name, value] of Object.entries(widgetAttributes(shown))) el.setAttribute(name, value);
    el.setAttribute('demo', '');
    el.setAttribute('open', '');
    // Fits the frame; the real window is larger.
    el.style.setProperty('--truplexy-width', '300px');
    el.style.setProperty('--truplexy-height', '320px');
    el.style.setProperty('--truplexy-offset-x', '12px');
    el.style.setProperty('--truplexy-offset-y', '12px');
    el.style.setProperty('--truplexy-z-index', '1');
    parent.append(el);
    return () => el.remove();
  }, [ready, shown]);

  return (
    <div
      className="relative h-[440px] overflow-hidden rounded-[14px] border border-line bg-surface-2"
      style={{ transform: 'translateZ(0)' }}
      role="img"
      aria-label="Preview of your chat window on your store"
    >
      <div className="pointer-events-none grid gap-3 p-4" aria-hidden>
        <div className="flex items-center justify-between">
          <div className="h-3 w-20 rounded-full bg-line-strong" />
          <div className="flex gap-2">
            <div className="h-2.5 w-10 rounded-full bg-line" />
            <div className="h-2.5 w-10 rounded-full bg-line" />
            <div className="h-2.5 w-10 rounded-full bg-line" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 pt-2">
          {[0, 1, 2].map((n) => (
            <div key={n} className="grid gap-2">
              <div className="aspect-square rounded-lg bg-line" />
              <div className="h-2.5 w-4/5 rounded-full bg-line-strong" />
              <div className="h-2.5 w-1/2 rounded-full bg-line" />
            </div>
          ))}
        </div>
      </div>
      <div ref={host} className="absolute inset-0" />
      {ready === 'loading' && <p className="absolute inset-0 grid place-items-center text-xs text-ink-faint">Loading the preview…</p>}
      {ready === 'failed' && <p className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-ink-faint">The preview isn't available right now. Your settings still save.</p>}
    </div>
  );
}

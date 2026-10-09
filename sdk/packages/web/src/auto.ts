/**
 * The CDN build. Add it to any page and the widget appears:
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@truplexy/web@0/dist/truplexy.min.js"
 *           data-endpoint="/api/truplexy" data-heading="Acme support" defer></script>
 *
 * Every data-* attribute becomes an element attribute. Add `data-manual` to
 * mount it yourself with `Truplexy.init({...})`.
 */
import { mount, type MountOptions } from './index';
import type { TruplexyChatElement } from './element';

let element: TruplexyChatElement | undefined;
const script = typeof document === 'undefined' ? null : (document.currentScript as HTMLScriptElement | null);

const api = {
  /** Mounts the widget (once) with these options, or updates it. */
  init(options: MountOptions = {}) {
    if (element?.isConnected) {
      element.remove();
    }
    element = mount(options);
    return element;
  },
  open: () => element?.open(),
  close: () => element?.close(),
  toggle: () => element?.toggle(),
  send: (text: string) => element?.send(text),
  reset: () => element?.reset(),
  get element() {
    return element;
  },
};

declare global {
  interface Window {
    Truplexy: typeof api;
  }
}

if (typeof window !== 'undefined') {
  window.Truplexy = api;
  if (script && !('manual' in script.dataset)) {
    const options: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(script.dataset)) {
      // data-show-sources → showSources; booleans are present-or-absent.
      options[key] = value === '' ? true : value === 'false' ? false : value;
    }
    const start = () => api.init(options as MountOptions);
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  }
}

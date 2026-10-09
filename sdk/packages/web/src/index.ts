import { defineTruplexyChat, TAG, TruplexyChatElement } from './element';
import type { Labels } from './labels';

export { TruplexyChatElement, defineTruplexyChat, ATTRIBUTES, TAG } from './element';
export { TruplexyClient, type ClientOptions, type ClientEvents } from './client';
export { fetchTransport, TruplexyRequestError, DEFAULT_ENDPOINT, type FetchTransportOptions } from './transport';
export { demoTransport } from './demo';
export { localStore, type SessionStore, type Saved } from './store';
export { renderMarkdown } from './markdown';
export { DEFAULT_LABELS, type Labels } from './labels';
export type { ChatMessage, ChatProfile, ChatState, ChatError, ReplyStatus, Source, Transport } from './types';

defineTruplexyChat();

/** Options for `mount()`, mirroring the element's attributes. */
export interface MountOptions {
  /** Your server route. Default `/api/truplexy`. */
  endpoint?: string;
  /** The header title. Default "Support". */
  heading?: string;
  subtitle?: string;
  /** The first message the visitor sees. Empty string for none. */
  greeting?: string;
  placeholder?: string;
  /** Any CSS colour. */
  accent?: string;
  /** An image URL for the header. */
  avatar?: string;
  theme?: 'light' | 'dark' | 'auto';
  position?: 'right' | 'left';
  /** `inline` renders a chat box inside `target` instead of a floating button. */
  mode?: 'floating' | 'inline';
  open?: boolean;
  showSources?: boolean;
  /** Canned replies, no server: for previews. */
  demo?: boolean;
  storageKey?: string;
  labels?: Partial<Labels>;
  /** Where to put the element. Default `document.body`. */
  target?: Element | string;
}

/** Sets the element's attributes from `options`. */
export function applyOptions(el: TruplexyChatElement, options: MountOptions): void {
  const { labels, target: _target, showSources, storageKey, open, demo, ...attrs } = options;
  for (const [name, value] of Object.entries({ ...attrs, 'show-sources': showSources, 'storage-key': storageKey, open, demo })) {
    if (value === undefined) continue;
    if (value === false) el.removeAttribute(name);
    else el.setAttribute(name, value === true ? '' : String(value));
  }
  if (labels) el.labels = labels;
}

/**
 * Adds the widget to the page and returns the element.
 *
 * ```ts
 * import { mount } from "@truplexy/web";
 * const chat = mount({ endpoint: "/api/truplexy", heading: "Acme support" });
 * chat.open();
 * ```
 */
export function mount(options: MountOptions = {}): TruplexyChatElement {
  const parent = typeof options.target === 'string' ? document.querySelector(options.target) : (options.target ?? document.body);
  if (!parent) throw new Error(`Truplexy: no element matches ${String(options.target)}`);
  const el = document.createElement(TAG) as TruplexyChatElement;
  applyOptions(el, options);
  parent.append(el);
  return el;
}

const first = () => (typeof document === 'undefined' ? null : document.querySelector(TAG));

/**
 * Controls the widget on the page from anywhere, such as a "Contact us" button:
 * `truplexy.open()`. Acts on the first `<truplexy-chat>` in the document.
 */
export const truplexy = {
  open: () => first()?.open(),
  close: () => first()?.close(),
  toggle: () => first()?.toggle(),
  send: (text: string) => first()?.send(text),
  reset: () => first()?.reset(),
};

declare global {
  interface HTMLElementTagNameMap {
    'truplexy-chat': TruplexyChatElement;
  }
  interface HTMLElementEventMap {
    'truplexy:open': CustomEvent<null>;
    'truplexy:close': CustomEvent<null>;
    'truplexy:message': CustomEvent<{ messages: import('./types').ChatMessage[] }>;
    'truplexy:status': CustomEvent<{ status: import('./types').ReplyStatus }>;
    'truplexy:error': CustomEvent<{ error: import('./types').ChatError }>;
  }
}

/**
 * The element's attributes, for typing `<truplexy-chat>` in JSX-based
 * frameworks (Solid, Preact, Qwik, Stencil). See the docs for each.
 */
export interface TruplexyChatAttributes {
  endpoint?: string;
  heading?: string;
  subtitle?: string;
  greeting?: string;
  placeholder?: string;
  accent?: string;
  avatar?: string;
  theme?: 'light' | 'dark' | 'auto';
  position?: 'right' | 'left';
  mode?: 'floating' | 'inline';
  open?: boolean | '';
  'show-sources'?: boolean | '';
  demo?: boolean | '';
  'storage-key'?: string;
}

import { createElement, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
  TruplexyClient,
  type ChatError,
  type ChatMessage,
  type ChatState,
  type ClientOptions,
  type Labels,
  type MountOptions,
  type ReplyStatus,
  type TruplexyChatElement,
} from '@truplexy/web';

export { truplexy, DEFAULT_LABELS, type ChatMessage, type ChatState, type ChatError, type ReplyStatus, type Labels } from '@truplexy/web';

export interface TruplexyChatProps extends Omit<MountOptions, 'target' | 'labels'> {
  /** Overrides for any UI string, for translations. */
  labels?: Partial<Labels>;
  onOpen?: () => void;
  onClose?: () => void;
  /** New assistant or team messages arrived. */
  onMessage?: (messages: ChatMessage[]) => void;
  onStatus?: (status: ReplyStatus) => void;
  onError?: (error: ChatError) => void;
  className?: string;
  style?: CSSProperties;
}

export interface TruplexyChatHandle {
  open(): void;
  close(): void;
  toggle(): void;
  send(text: string): Promise<void>;
  reset(): void;
  readonly element: TruplexyChatElement | null;
}

/**
 * The Truplexy chat widget.
 *
 * ```tsx
 * <TruplexyChat endpoint="/api/truplexy" heading="Acme support" />
 * ```
 *
 * Renders on the server as an empty `<truplexy-chat>` tag and comes alive in
 * the browser, so it's safe in Next.js server layouts.
 */
export const TruplexyChat = forwardRef<TruplexyChatHandle, TruplexyChatProps>(function TruplexyChat(props, ref) {
  const { open, labels, onOpen, onClose, onMessage, onStatus, onError, className, style, showSources, demo, storageKey, ...attrs } = props;
  const el = useRef<TruplexyChatElement>(null);
  const handlers = useRef({ onOpen, onClose, onMessage, onStatus, onError });
  handlers.current = { onOpen, onClose, onMessage, onStatus, onError };

  useImperativeHandle(
    ref,
    () => ({
      open: () => el.current?.open(),
      close: () => el.current?.close(),
      toggle: () => el.current?.toggle(),
      send: async (text: string) => el.current?.send(text),
      reset: () => el.current?.reset(),
      get element() {
        return el.current;
      },
    }),
    [],
  );

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const on = (name: string, fn: (e: CustomEvent) => void) => {
      const listener = (e: Event) => fn(e as CustomEvent);
      node.addEventListener(`truplexy:${name}`, listener);
      return () => node.removeEventListener(`truplexy:${name}`, listener);
    };
    const off = [
      on('open', () => handlers.current.onOpen?.()),
      on('close', () => handlers.current.onClose?.()),
      on('message', (e) => handlers.current.onMessage?.(e.detail.messages)),
      on('status', (e) => handlers.current.onStatus?.(e.detail.status)),
      on('error', (e) => handlers.current.onError?.(e.detail.error)),
    ];
    return () => off.forEach((f) => f());
  }, []);

  // `open` is a method on the element, so it's never passed as a JSX prop (React 19 would overwrite it).
  useEffect(() => {
    if (open !== undefined) el.current?.toggleAttribute('open', open);
  }, [open]);

  useEffect(() => {
    if (el.current && labels) el.current.labels = labels;
  }, [labels]);

  // Strings go through as attributes, which React 18 and 19 both render on the server.
  return createElement('truplexy-chat', {
    ref: el,
    ...attrs,
    'show-sources': showSources ? '' : undefined,
    demo: demo ? '' : undefined,
    'storage-key': storageKey,
    className,
    style,
    suppressHydrationWarning: true,
  });
});

const EMPTY: ChatState = { profile: null, customer: null, ticket: null, needsDetails: false, messages: [], sending: false, offerHandoff: false, handoff: false, escalated: false, unread: 0, error: null, ready: false };
const noop = () => () => {};

/**
 * The chat without any UI, for building your own.
 *
 * ```tsx
 * const chat = useTruplexyChat({ endpoint: "/api/truplexy" });
 * chat.messages.map(…); chat.send("Hi");
 * ```
 */
export function useTruplexyChat(options: ClientOptions = {}) {
  const [client, setClient] = useState<TruplexyClient | null>(null);
  const opts = useRef(options);
  opts.current = options;
  const { endpoint, storageKey } = options;

  // Created in an effect, so it never runs on the server and survives StrictMode's double mount.
  useEffect(() => {
    const c = new TruplexyClient(opts.current);
    setClient(c);
    void c.start();
    return () => c.destroy();
  }, [endpoint, storageKey]);

  const subscribe = useCallback((cb: () => void) => (client ? client.subscribe(cb) : noop()), [client]);
  const state = useSyncExternalStore(
    subscribe,
    () => client?.getState() ?? EMPTY,
    () => EMPTY,
  );

  return {
    ...state,
    send: useCallback((text: string) => client?.send(text) ?? Promise.resolve(), [client]),
    retry: useCallback((id: string) => client?.retry(id) ?? Promise.resolve(), [client]),
    /** Saves the visitor's name and email; false when they aren't usable. Then call `send()` again. */
    setCustomer: useCallback((name: string, email: string) => client?.setCustomer(name, email) ?? false, [client]),
    cancelDetails: useCallback(() => client?.cancelDetails(), [client]),
    handoff: useCallback(() => client?.handoff() ?? Promise.resolve(), [client]),
    reset: useCallback(() => client?.reset(), [client]),
    /** Whether your chat UI is visible: clears unread and polls faster while open. */
    setOpen: useCallback((open: boolean) => client?.setOpen(open), [client]),
    client,
  };
}

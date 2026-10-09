import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch, type App, type PropType } from 'vue';
import { TruplexyClient, type ChatError, type ChatMessage, type ChatState, type ClientOptions, type Labels, type ReplyStatus, type TruplexyChatElement } from '@truplexy/web';

export { truplexy, DEFAULT_LABELS, type ChatMessage, type ChatState, type ChatError, type ReplyStatus, type Labels } from '@truplexy/web';

/**
 * The Truplexy chat widget.
 *
 * ```vue
 * <TruplexyChat endpoint="/api/truplexy" heading="Acme support" @message="onMessage" />
 * ```
 *
 * In Nuxt, wrap it in `<ClientOnly>`.
 */
export const TruplexyChat = defineComponent({
  name: 'TruplexyChat',
  props: {
    endpoint: String,
    heading: String,
    subtitle: String,
    greeting: String,
    placeholder: String,
    accent: String,
    avatar: String,
    theme: String as PropType<'light' | 'dark' | 'auto'>,
    position: String as PropType<'right' | 'left'>,
    mode: String as PropType<'floating' | 'inline'>,
    /** Opens or closes the chat when it changes. Leave unset to let the visitor decide. */
    open: { type: Boolean, default: undefined },
    showSources: Boolean,
    demo: Boolean,
    storageKey: String,
    /** `off` skips asking for the visitor's name and email. */
    details: String as PropType<'ask' | 'off'>,
    labels: Object as PropType<Partial<Labels>>,
  },
  emits: {
    open: () => true,
    close: () => true,
    message: (_messages: ChatMessage[]) => true,
    status: (_status: ReplyStatus) => true,
    error: (_error: ChatError) => true,
  },
  setup(props, { emit, expose }) {
    const el = ref<TruplexyChatElement>();
    const off: (() => void)[] = [];

    onMounted(() => {
      const node = el.value!;
      const on = (name: string, fn: (e: CustomEvent) => void) => {
        const listener = (e: Event) => fn(e as CustomEvent);
        node.addEventListener(`truplexy:${name}`, listener);
        off.push(() => node.removeEventListener(`truplexy:${name}`, listener));
      };
      on('open', () => emit('open'));
      on('close', () => emit('close'));
      on('message', (e) => emit('message', e.detail.messages));
      on('status', (e) => emit('status', e.detail.status));
      on('error', (e) => emit('error', e.detail.error));
      watch(
        () => props.open,
        (open) => open !== undefined && node.toggleAttribute('open', open),
        { immediate: true },
      );
      watch(
        () => props.labels,
        (labels) => labels && (node.labels = labels),
        { immediate: true, deep: true },
      );
    });
    onBeforeUnmount(() => off.forEach((f) => f()));

    expose({
      open: () => el.value?.open(),
      close: () => el.value?.close(),
      toggle: () => el.value?.toggle(),
      send: (text: string) => el.value?.send(text),
      reset: () => el.value?.reset(),
      element: el,
    });

    return () =>
      h('truplexy-chat', {
        ref: el,
        endpoint: props.endpoint,
        heading: props.heading,
        subtitle: props.subtitle,
        greeting: props.greeting,
        placeholder: props.placeholder,
        accent: props.accent,
        avatar: props.avatar,
        theme: props.theme,
        position: props.position,
        mode: props.mode,
        'show-sources': props.showSources ? '' : undefined,
        demo: props.demo ? '' : undefined,
        'storage-key': props.storageKey,
        details: props.details,
      });
  },
});

/** `app.use(TruplexyPlugin)` registers `<TruplexyChat>` everywhere. */
export const TruplexyPlugin = {
  install(app: App) {
    app.component('TruplexyChat', TruplexyChat);
  },
};

const EMPTY: ChatState = { profile: null, customer: null, ticket: null, needsDetails: false, messages: [], sending: false, offerHandoff: false, handoff: false, escalated: false, unread: 0, error: null, ready: false };

/**
 * The chat without any UI, for building your own.
 *
 * ```ts
 * const { state, send } = useTruplexyChat({ endpoint: "/api/truplexy" });
 * ```
 */
export function useTruplexyChat(options: ClientOptions = {}) {
  const state = shallowRef<ChatState>(EMPTY);
  let client: TruplexyClient | undefined;
  let unsubscribe = () => {};

  onMounted(() => {
    client = new TruplexyClient(options);
    unsubscribe = client.subscribe((s) => (state.value = s));
    state.value = client.getState();
    void client.start();
  });
  onBeforeUnmount(() => {
    unsubscribe();
    client?.destroy();
  });

  return {
    state,
    send: (text: string) => client?.send(text) ?? Promise.resolve(),
    retry: (id: string) => client?.retry(id) ?? Promise.resolve(),
    /** Saves the visitor's name and email; false when they aren't usable. Then call `send()` again. */
    setCustomer: (name: string, email: string) => client?.setCustomer(name, email) ?? false,
    cancelDetails: () => client?.cancelDetails(),
    handoff: () => client?.handoff() ?? Promise.resolve(),
    reset: () => client?.reset(),
    /** Whether your chat UI is visible: clears unread and polls faster while open. */
    setOpen: (open: boolean) => client?.setOpen(open),
  };
}

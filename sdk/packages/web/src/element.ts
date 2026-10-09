import { TruplexyClient } from './client';
import { demoTransport } from './demo';
import { WORDMARK_ON_DARK, WORDMARK_ON_LIGHT } from './brand';
import { DEFAULT_LABELS, type Labels } from './labels';
import { renderMarkdown } from './markdown';
import { STYLES } from './styles';
import type { ChatMessage, ChatState } from './types';

export const TAG = 'truplexy-chat';

/** Where "Powered by Truplexy" links to; the UTM tags show widget referrals in the site's analytics. */
export const BRAND_URL = 'https://zenovasolution.xyz/?utm_source=chat-widget&utm_medium=referral';

const ICONS = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.5-5.2A8.5 8.5 0 1 1 21 12z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><rect x="4" y="7" width="16" height="12" rx="4"/><path d="M9 13h.01M15 13h.01"/></svg>',
};

/** Attributes the element reads. Everything is optional. */
export const ATTRIBUTES = [
  'endpoint',
  'heading',
  'subtitle',
  'greeting',
  'placeholder',
  'accent',
  'avatar',
  'theme',
  'position',
  'mode',
  'open',
  'show-sources',
  'demo',
  'storage-key',
  'details',
] as const;

// Server rendering has no HTMLElement; the class is only defined in browsers.
const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

/**
 * `<truplexy-chat endpoint="/api/truplexy"></truplexy-chat>`
 *
 * A floating chat button and panel (or, with `mode="inline"`, a chat box in
 * the page) that talks to your server route. Events bubble out of the shadow
 * root: `truplexy:open`, `truplexy:close`, `truplexy:message`,
 * `truplexy:status`, `truplexy:error`.
 */
export class TruplexyChatElement extends Base {
  static get observedAttributes() {
    return ATTRIBUTES;
  }

  private _client?: TruplexyClient;
  private _labels: Partial<Labels> = {};
  private unsubscribe: (() => void)[] = [];
  private nodes = new Map<string, HTMLElement>();
  private built = false;
  private $!: {
    root: ShadowRoot;
    launcher: HTMLButtonElement;
    badge: HTMLElement;
    panel: HTMLElement;
    avatar: HTMLElement;
    title: HTMLElement;
    subtitle: HTMLElement;
    restart: HTMLButtonElement;
    close: HTMLButtonElement;
    log: HTMLElement;
    greeting: HTMLElement;
    typing: HTMLElement;
    notice: HTMLElement;
    actions: HTMLElement;
    handoff: HTMLButtonElement;
    details: HTMLFormElement;
    detailsTitle: HTMLElement;
    detailsHint: HTMLElement;
    detailsName: HTMLInputElement;
    detailsEmail: HTMLInputElement;
    detailsError: HTMLElement;
    detailsStart: HTMLButtonElement;
    detailsCancel: HTMLButtonElement;
    form: HTMLFormElement;
    input: HTMLTextAreaElement;
    send: HTMLButtonElement;
    brand: HTMLAnchorElement;
  };

  /** The headless client behind the widget, for advanced use. */
  get client(): TruplexyClient | undefined {
    return this._client;
  }

  /** Overrides for any UI string (see DEFAULT_LABELS). The `heading`, `subtitle`, `greeting` and `placeholder` attributes win. */
  get labels(): Partial<Labels> {
    return this._labels;
  }
  set labels(value: Partial<Labels>) {
    this._labels = { ...value };
    if (this.built) this.renderChrome();
  }

  get isOpen(): boolean {
    return this.getAttribute('mode') === 'inline' || this.hasAttribute('open');
  }

  open(): void {
    this.toggleAttribute('open', true);
  }
  close(): void {
    this.toggleAttribute('open', false);
  }
  toggle(): void {
    this.toggleAttribute('open');
  }
  /** Opens the chat and sends `text` as the visitor. */
  async send(text: string): Promise<void> {
    this.open();
    await this.connect().send(text);
  }
  /** Forgets the conversation; the next message starts a new one. */
  reset(): void {
    this._client?.reset();
  }

  connectedCallback() {
    if (!this.built) this.build();
    this.connect();
    this.renderChrome();
    this.syncOpen(false);
  }

  disconnectedCallback() {
    this.teardown();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (!this.built || old === value) return;
    if (name === 'endpoint' || name === 'demo' || name === 'storage-key' || name === 'details') {
      if (this.isConnected) {
        this.teardown();
        this.connect();
      }
    } else if (name === 'open') {
      this.syncOpen(true);
    } else {
      this.renderChrome();
      if (this._client && (name === 'show-sources' || name === 'mode')) this.render(this._client.getState());
    }
  }

  /* ---------------------------------------------------------------- */

  private label<K extends keyof Labels>(key: K): string {
    // `heading`, not `title`: a title attribute would show as a tooltip over the whole widget.
    const attr = key === 'title' ? this.getAttribute('heading') : key === 'subtitle' || key === 'greeting' || key === 'placeholder' ? this.getAttribute(key) : null;
    // Without your own title, the header shows the business's name from Truplexy.
    const profile = key === 'title' ? this.profileTitle() : undefined;
    return attr ?? this._labels[key] ?? profile ?? DEFAULT_LABELS[key];
  }

  private shownProfile: ChatState['profile'] = null;

  private profileTitle(): string | undefined {
    const p = this._client?.getState().profile;
    return p?.business?.name?.trim() || p?.bot?.name?.trim() || undefined;
  }

  /** The header picture: the `avatar` attribute, else the business logo, else the bot's picture. */
  private avatarUrl(): string | undefined {
    const p = this._client?.getState().profile;
    return this.getAttribute('avatar') || p?.business?.logo_url || p?.bot?.avatar_url || undefined;
  }

  private connect(): TruplexyClient {
    if (this._client) return this._client;
    const demo = this.hasAttribute('demo');
    const endpoint = this.getAttribute('endpoint') || undefined;
    // details="off" skips the name and email form.
    const details = this.getAttribute('details') === 'off' ? ('off' as const) : ('ask' as const);
    const client = new TruplexyClient(
      demo
        ? { transport: demoTransport(), store: false, details }
        : { endpoint, storageKey: this.getAttribute('storage-key') || undefined, details },
    );
    this._client = client;
    this.nodes.clear();
    this.$.log.replaceChildren(this.$.greeting);
    this.unsubscribe = [
      client.subscribe((s) => {
        // The profile arrives after the first render: redraw the header with it.
        if (s.profile !== this.shownProfile) {
          this.shownProfile = s.profile;
          this.renderChrome();
        }
        this.render(s);
      }),
      client.on('message', (messages) => this.fire('message', { messages })),
      client.on('status', (status) => this.fire('status', { status })),
      client.on('error', (error) => this.fire('error', { error })),
    ];
    client.setOpen(this.isOpen);
    this.render(client.getState());
    void client.start();
    return client;
  }

  private teardown() {
    this.unsubscribe.forEach((u) => u());
    this.unsubscribe = [];
    this._client?.destroy();
    this._client = undefined;
  }

  private fire(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(`truplexy:${name}`, { detail, bubbles: true, composed: true }));
  }

  private build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLES}</style>
<button class="launcher" part="launcher" type="button" aria-expanded="false" aria-controls="panel">${ICONS.chat.replace('<svg', '<svg class="i-chat"')}${ICONS.close.replace('<svg', '<svg class="i-close"')}<span class="badge" hidden></span></button>
<section class="panel" id="panel" part="panel" role="dialog" aria-labelledby="title" hidden>
  <header part="header">
    <div class="avatar" aria-hidden="true"></div>
    <div class="heading"><h2 class="title" id="title"></h2><p class="subtitle"></p></div>
    <button class="icon restart" type="button" hidden>${ICONS.restart}</button>
    <button class="icon close" type="button">${ICONS.close}</button>
  </header>
  <div class="log" part="log" role="log" aria-live="polite" tabindex="0">
    <div class="msg assistant greeting"><div class="bubble"></div></div>
  </div>
  <div class="msg assistant typing" hidden><div class="bubble"><span class="dots"><i></i><i></i><i></i></span></div></div>
  <p class="notice" role="status" hidden></p>
  <div class="actions" hidden><button class="handoff" part="handoff" type="button"></button></div>
  <form class="details" part="details" hidden novalidate>
    <p class="details-title"></p>
    <p class="details-hint"></p>
    <input class="details-name" name="name" type="text" autocomplete="name" maxlength="80" required>
    <input class="details-email" name="email" type="email" autocomplete="email" maxlength="254" required>
    <p class="details-error" role="alert" hidden></p>
    <div class="details-buttons"><button class="details-cancel" type="button"></button><button class="details-start" type="submit"></button></div>
  </form>
  <form class="composer" part="composer">
    <textarea rows="1" maxlength="4000" enterkeyhint="send"></textarea>
    <button class="send" type="submit" disabled>${ICONS.send}</button>
  </form>
  <a class="brand" href="${BRAND_URL}" target="_blank" rel="noopener"></a>
</section>`;
    const q = <T extends Element>(s: string) => root.querySelector(s) as unknown as T;
    this.$ = {
      root,
      launcher: q('.launcher'),
      badge: q('.badge'),
      panel: q('.panel'),
      avatar: q('.avatar'),
      title: q('.title'),
      subtitle: q('.subtitle'),
      restart: q('.restart'),
      close: q('.close'),
      log: q('.log'),
      greeting: q('.greeting'),
      typing: q('.typing'),
      notice: q('.notice'),
      actions: q('.actions'),
      handoff: q('.handoff'),
      details: q('.details'),
      detailsTitle: q('.details-title'),
      detailsHint: q('.details-hint'),
      detailsName: q('.details-name'),
      detailsEmail: q('.details-email'),
      detailsError: q('.details-error'),
      detailsStart: q('.details-start'),
      detailsCancel: q('.details-cancel'),
      form: q('.composer'),
      input: q('textarea'),
      send: q('.send'),
      brand: q('.brand'),
    };
    // The typing indicator lives in the log, after the messages.
    this.$.log.append(this.$.typing);

    this.$.launcher.addEventListener('click', () => this.toggle());
    this.$.close.addEventListener('click', () => {
      this.close();
      this.$.launcher.focus();
    });
    this.$.restart.addEventListener('click', () => this.reset());
    this.$.handoff.addEventListener('click', () => void this._client?.handoff());
    this.$.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.getAttribute('mode') !== 'inline') {
        this.close();
        this.$.launcher.focus();
      }
    });
    this.$.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.$.details.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitDetails();
    });
    this.$.detailsCancel.addEventListener('click', () => this.cancelDetails());
    this.$.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.submit();
      }
    });
    this.$.input.addEventListener('input', () => {
      this.grow();
      this.$.send.disabled = !this.$.input.value.trim() || Boolean(this._client?.getState().sending);
    });
    this.built = true;
  }

  private submit() {
    const text = this.$.input.value.trim();
    const client = this.connect();
    if (!text || client.getState().sending) return;
    this.$.input.value = '';
    this.grow();
    this.$.send.disabled = true;
    void client.send(text);
    // A new conversation first asks who is writing; the message waits for the answer.
    if (client.getState().needsDetails) this.pendingText = text;
  }

  private pendingText = '';
  private askedDetails = false;

  private submitDetails() {
    const $ = this.$;
    const client = this.connect();
    if (!client.setCustomer($.detailsName.value, $.detailsEmail.value)) {
      $.detailsError.textContent = this.label('invalidDetails');
      $.detailsError.hidden = false;
      ($.detailsName.value.trim() ? $.detailsEmail : $.detailsName).focus();
      return;
    }
    $.detailsError.hidden = true;
    const text = this.pendingText;
    this.pendingText = '';
    if (text) void client.send(text);
  }

  private cancelDetails() {
    this._client?.cancelDetails();
    this.$.input.value = this.pendingText;
    this.pendingText = '';
    this.grow();
    this.$.send.disabled = !this.$.input.value.trim();
    this.$.input.focus();
  }

  private grow() {
    const el = this.$.input;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 128)}px`;
  }

  /** Reflects the `open` attribute onto the panel, the client and events. */
  private syncOpen(announce: boolean) {
    const open = this.isOpen;
    this.$.panel.hidden = !open;
    this.$.launcher.setAttribute('aria-expanded', String(open));
    this.$.launcher.setAttribute('aria-label', this.label(open ? 'close' : 'open'));
    this._client?.setOpen(open);
    if (open) {
      this.scrollToEnd();
      if (announce && this.getAttribute('mode') !== 'inline') {
        requestAnimationFrame(() => this.$.input.focus({ preventScroll: true }));
      }
    }
    if (announce) this.fire(open ? 'open' : 'close', null);
  }

  /** Header, labels, colours: everything that doesn't depend on the conversation. */
  private renderChrome() {
    const $ = this.$;
    $.title.textContent = this.label('title');
    const subtitle = this.label('subtitle');
    $.subtitle.textContent = subtitle;
    $.subtitle.hidden = !subtitle;
    const avatar = this.avatarUrl();
    if (avatar) {
      const img = document.createElement('img');
      img.src = avatar;
      img.alt = '';
      img.onerror = () => ($.avatar.innerHTML = ICONS.bot);
      $.avatar.replaceChildren(img);
    } else $.avatar.innerHTML = ICONS.bot;
    const greeting = this.label('greeting');
    $.greeting.hidden = !greeting;
    $.greeting.firstElementChild!.innerHTML = renderMarkdown(greeting);
    $.input.placeholder = this.label('placeholder');
    $.input.setAttribute('aria-label', this.label('placeholder'));
    $.send.setAttribute('aria-label', this.label('send'));
    $.close.setAttribute('aria-label', this.label('close'));
    $.restart.setAttribute('aria-label', this.label('newConversation'));
    $.restart.title = this.label('newConversation');
    $.handoff.textContent = this.label('handoff');
    $.detailsTitle.textContent = this.label('detailsTitle');
    $.detailsHint.textContent = this.label('detailsHint');
    $.detailsName.placeholder = this.label('name');
    $.detailsName.setAttribute('aria-label', this.label('name'));
    $.detailsEmail.placeholder = this.label('email');
    $.detailsEmail.setAttribute('aria-label', this.label('email'));
    $.detailsStart.textContent = this.label('startChat');
    $.detailsCancel.textContent = this.label('cancel');
    // The wordmark takes the place of the name in any language: "Powered by [Truplexy]".
    const [before, ...after] = this.label('poweredBy').split('Truplexy');
    const logo = (variant: 'light' | 'dark', { src, width, height }: typeof WORDMARK_ON_LIGHT) => {
      const img = document.createElement('img');
      img.className = `wordmark-on-${variant}`;
      img.src = src;
      img.width = width / 2;
      img.height = height / 2;
      img.alt = 'Truplexy';
      return img;
    };
    $.brand.replaceChildren(before, ...(after.length ? [logo('light', WORDMARK_ON_LIGHT), logo('dark', WORDMARK_ON_DARK), after.join('Truplexy')] : []));
    $.launcher.setAttribute('aria-label', this.label(this.isOpen ? 'close' : 'open'));
    const accent = this.getAttribute('accent');
    if (accent) this.style.setProperty('--truplexy-accent', accent);
    else this.style.removeProperty('--truplexy-accent');
  }

  private render(state: ChatState) {
    if (!this.built) return;
    const $ = this.$;
    const nearEnd = $.log.scrollHeight - $.log.scrollTop - $.log.clientHeight < 80;
    const lastCount = this.nodes.size;

    // Keyed by content, so a message keeps its node when its local ID becomes the server's.
    const seen = new Map<string, number>();
    const next = new Map<string, HTMLElement>();
    let anchor: Element = $.greeting;
    for (const m of state.messages) {
      const base = `${m.role}|${m.agent ?? ''}|${m.content}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const key = `${base}|${n}`;
      const node = this.nodes.get(key) ?? this.createMessage(m);
      this.updateMessage(node, m);
      next.set(key, node);
      if (anchor.nextElementSibling !== node) anchor.after(node);
      anchor = node;
    }
    for (const [key, node] of this.nodes) if (!next.has(key)) node.remove();
    this.nodes = next;
    $.log.append($.typing);

    $.typing.hidden = !state.sending || state.escalated;
    $.restart.hidden = state.messages.length === 0;
    $.actions.hidden = !state.offerHandoff;
    $.handoff.disabled = state.sending;
    const notice = state.escalated ? this.label('escalated') : state.handoff ? this.label('handoffDone') : '';
    $.notice.textContent = notice;
    $.notice.hidden = !notice;
    $.send.disabled = !$.input.value.trim() || state.sending;
    // Name and email replace the message box until the visitor has given them.
    $.details.hidden = !state.needsDetails;
    $.form.hidden = state.needsDetails;
    if (state.needsDetails && !this.askedDetails) requestAnimationFrame(() => $.detailsName.focus({ preventScroll: true }));
    this.askedDetails = state.needsDetails;
    $.badge.hidden = state.unread === 0 || this.isOpen;
    $.badge.textContent = state.unread > 9 ? '9+' : String(state.unread);

    const last = state.messages[state.messages.length - 1];
    if (nearEnd || state.sending || (next.size > lastCount && last?.role === 'user')) this.scrollToEnd();
  }

  private createMessage(m: ChatMessage): HTMLElement {
    const node = document.createElement('div');
    node.setAttribute('part', `message ${m.role}`);
    node.className = `msg ${m.role}${m.agent ? ' agent' : ''}`;
    if (m.agent) {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = `${m.agent} · ${this.label('team')}`;
      node.append(who);
    }
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (m.role === 'user') bubble.textContent = m.content;
    else bubble.innerHTML = renderMarkdown(m.content); // escaped by renderMarkdown
    node.append(bubble);
    return node;
  }

  private updateMessage(node: HTMLElement, m: ChatMessage) {
    node.classList.toggle('pending', Boolean(m.pending));
    node.querySelector('.failed')?.remove();
    node.querySelector('.sources')?.remove();
    const sources = this.hasAttribute('show-sources') ? (m.sources ?? []).filter((s) => s.url && /^https?:\/\//.test(s.url)) : [];
    if (sources.length) {
      const list = document.createElement('ul');
      list.className = 'sources';
      list.setAttribute('aria-label', this.label('sources'));
      for (const s of sources.slice(0, 4)) {
        const a = document.createElement('a');
        a.href = s.url!;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = s.section ? `${s.title} · ${s.section}` : s.title;
        const li = document.createElement('li');
        li.append(a);
        list.append(li);
      }
      node.append(list);
    }
    if (m.error) {
      const row = document.createElement('div');
      row.className = 'failed';
      row.setAttribute('role', 'alert');
      const text = document.createElement('span');
      text.textContent = `${this.label('notSent')} ${m.error.message}`;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = this.label('retry');
      retry.addEventListener('click', () => void this._client?.retry(m.id));
      row.append(text, retry);
      node.append(row);
    }
  }

  private scrollToEnd() {
    const log = this.$.log;
    requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
  }
}

/** Registers `<truplexy-chat>`. Runs on import; safe to call again and on the server. */
export function defineTruplexyChat(tag = TAG): void {
  if (typeof window === 'undefined' || !window.customElements || customElements.get(tag)) return;
  customElements.define(tag, tag === TAG ? TruplexyChatElement : class extends TruplexyChatElement {});
}

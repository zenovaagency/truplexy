/**
 * Shadow DOM styles. Every colour and size is a custom property the host page can override on `truplexy-chat`.
 *
 * Motion (described here because comments inside the stylesheet ship in the bundle): the launcher pops in whenever
 * it is shown, springs when pressed, and swaps its icons by spinning the old one out fast and the new one in. The
 * window is closed by default and grows out of the launcher's centre (29px in from the side, 43px below the window)
 * when `data-state="open"` is set; element.ts hides it once it has faded out. Suggested questions rise in one after
 * another. Reduced motion keeps only the fades.
 *
 * The message box is one rounded field with the send button inside it. Focus draws an accent ring on the field's
 * border, with no glow. A team member's reply uses the same card as the assistant's; only its name line differs.
 */
export const STYLES = /* css */ `
:host {
  --tx-accent: var(--truplexy-accent, #2338e6);
  --tx-accent-ink: var(--truplexy-accent-ink, #ffffff);
  --tx-bg: var(--truplexy-background, #ffffff);
  --tx-surface: var(--truplexy-surface, #f4f5fa);
  --tx-ink: var(--truplexy-ink, #0e1222);
  --tx-muted: var(--truplexy-muted, #5a6080);
  --tx-line: var(--truplexy-line, #e3e6f0);
  --tx-danger: var(--truplexy-danger, #c2410c);
  --tx-radius: var(--truplexy-radius, 18px);
  --tx-font: var(--truplexy-font, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);
  --tx-width: var(--truplexy-width, 380px);
  --tx-height: var(--truplexy-height, 600px);
  --tx-x: var(--truplexy-offset-x, 20px);
  --tx-y: var(--truplexy-offset-y, 20px);
  --tx-z: var(--truplexy-z-index, 2147483000);
  --tx-shadow: 0 24px 60px -12px rgb(14 18 34 / 0.28), 0 4px 14px rgb(14 18 34 / 0.08);
  --tx-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --tx-out: cubic-bezier(0.16, 1, 0.3, 1);
  all: initial;
  font-family: var(--tx-font);
  color: var(--tx-ink);
  font-size: 15px;
  line-height: 1.45;
}
:host([hidden]) { display: none !important; }
/* Held back until the profile (with the business's look) arrives, so the window doesn't jump. */
:host([data-tx-pending]) .launcher { display: none; }
:host([data-tx-theme='dark']) {
  --tx-bg: var(--truplexy-background, #121624);
  --tx-surface: var(--truplexy-surface, #1d2234);
  --tx-ink: var(--truplexy-ink, #eef0f8);
  --tx-muted: var(--truplexy-muted, #a2a8c3);
  --tx-line: var(--truplexy-line, #2b3148);
  --tx-danger: var(--truplexy-danger, #fb923c);
}
@media (prefers-color-scheme: dark) {
  :host([data-tx-theme='auto']) {
    --tx-bg: var(--truplexy-background, #121624);
    --tx-surface: var(--truplexy-surface, #1d2234);
    --tx-ink: var(--truplexy-ink, #eef0f8);
    --tx-muted: var(--truplexy-muted, #a2a8c3);
    --tx-line: var(--truplexy-line, #2b3148);
    --tx-danger: var(--truplexy-danger, #fb923c);
  }
}
*, *::before, *::after { box-sizing: border-box; }
button, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--tx-accent); outline-offset: 2px; }
[hidden] { display: none !important; }

.launcher {
  position: fixed; bottom: var(--tx-y); right: var(--tx-x); z-index: var(--tx-z);
  width: 58px; height: 58px; border-radius: 50%; border: 0; padding: 0;
  display: grid; place-items: center;
  background: var(--tx-accent); color: var(--tx-accent-ink);
  box-shadow: var(--tx-shadow);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.35s var(--tx-spring), box-shadow 0.25s ease;
  animation: tx-pop 0.45s var(--tx-spring) backwards;
}
@media (hover: hover) {
  .launcher:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 28px 64px -12px rgb(14 18 34 / 0.34), 0 6px 18px rgb(14 18 34 / 0.12); }
}
.launcher:active { transform: scale(0.92); transition-duration: 0.08s; }
.launcher svg { width: 26px; height: 26px; grid-area: 1 / 1; transition: opacity 0.2s ease 0.04s, transform 0.4s var(--tx-spring) 0.04s; }
:host(:not([open])) .launcher .i-close, :host([open]) .launcher .i-chat { opacity: 0; transform: rotate(-90deg) scale(0.4); transition: opacity 0.12s ease-in, transform 0.15s ease-in; }
:host([open]) .launcher .i-chat { transform: rotate(90deg) scale(0.4); }
:host([data-tx-position='left']) .launcher { right: auto; left: var(--tx-x); }
.badge {
  position: absolute; top: -2px; right: -2px; min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 10px; background: var(--tx-danger); color: #fff;
  font-size: 12px; font-weight: 700; line-height: 20px; text-align: center;
  border: 2px solid var(--tx-bg);
  animation: tx-pop 0.35s var(--tx-spring) backwards;
}
@keyframes tx-pop { from { opacity: 0; transform: scale(0.4); } }

.panel {
  position: fixed; z-index: var(--tx-z);
  bottom: calc(var(--tx-y) + 72px); right: var(--tx-x);
  width: min(var(--tx-width), calc(100vw - 2 * var(--tx-x)));
  height: min(var(--tx-height), calc(100vh - var(--tx-y) - 100px));
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--tx-bg); border: 1px solid var(--tx-line); border-radius: var(--tx-radius);
  box-shadow: var(--tx-shadow);
  transform-origin: calc(100% - 29px) calc(100% + 43px);
  opacity: 0; transform: translateY(12px) scale(0.9); pointer-events: none;
  transition: opacity 0.16s ease-in, transform 0.18s ease-in;
}
.panel[data-state='open'] {
  opacity: 1; transform: none; pointer-events: auto;
  transition: opacity 0.2s ease, transform 0.4s var(--tx-out);
}
:host([data-tx-position='left']) .panel { right: auto; left: var(--tx-x); transform-origin: 29px calc(100% + 43px); }

:host([mode='inline']) { display: block; }
:host([mode='inline']) .launcher { display: none; }
:host([mode='inline']) .panel {
  position: relative; inset: auto; width: 100%; height: var(--tx-height);
  box-shadow: none; transition: none;
}

header {
  display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 18px;
  background: var(--tx-accent); color: var(--tx-accent-ink);
}
.avatar {
  flex: none; width: 38px; height: 38px; border-radius: 50%; overflow: hidden;
  display: grid; place-items: center; background: rgb(255 255 255 / 0.18);
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar svg { width: 20px; height: 20px; }
.heading { flex: 1; min-width: 0; }
.title { margin: 0; font-size: 16px; font-weight: 700; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subtitle { margin: 2px 0 0; font-size: 13px; opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon {
  flex: none; width: 34px; height: 34px; border: 0; border-radius: 10px; padding: 0;
  display: grid; place-items: center; background: transparent; color: inherit; opacity: 0.85;
}
.icon:hover { background: rgb(255 255 255 / 0.16); opacity: 1; }
.icon svg { width: 18px; height: 18px; }
:host([mode='inline']) .close { display: none; }

.log {
  flex: 1; overflow-y: auto; overscroll-behavior: contain;
  padding: 18px 16px 8px; display: flex; flex-direction: column; gap: 10px;
  scrollbar-width: thin;
  transition: opacity 0.3s ease 0.06s, transform 0.4s var(--tx-out) 0.06s;
}
.panel:not([data-state='open']) .log { opacity: 0; transform: translateY(8px); transition: 0s 0.2s; }
.msg { display: flex; flex-direction: column; max-width: 86%; gap: 4px; }
.msg.user { align-self: flex-end; align-items: flex-end; }
.msg.assistant { align-self: flex-start; }
.who { font-size: 12px; font-weight: 600; color: var(--tx-muted); padding: 0 4px; }
.bubble {
  padding: 10px 14px; border-radius: 16px; overflow-wrap: anywhere;
  background: var(--tx-surface); color: var(--tx-ink);
}
.user .bubble { background: var(--tx-accent); color: var(--tx-accent-ink); border-bottom-right-radius: 6px; white-space: pre-wrap; }
.assistant .bubble { border-bottom-left-radius: 6px; }
.msg.notice-line { align-self: center; max-width: 92%; padding: 2px 8px; font-size: 12px; text-align: center; color: var(--tx-muted); }
.pending .bubble { opacity: 0.65; }
.bubble p { margin: 0; }
.bubble p + p, .bubble p + ul, .bubble p + ol, .bubble ul + p, .bubble ol + p, .bubble pre + p, .bubble p + pre { margin-top: 8px; }
.bubble ul, .bubble ol { margin: 0; padding-left: 20px; }
.bubble li + li { margin-top: 2px; }
.bubble a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.bubble code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; padding: 1px 5px; border-radius: 5px; background: rgb(127 127 127 / 0.15); }
.bubble pre { margin: 0; padding: 10px; border-radius: 10px; overflow-x: auto; background: rgb(127 127 127 / 0.12); }
.bubble pre code { padding: 0; background: none; }
.sources { margin: 2px 0 0; padding: 0 4px; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; }
.sources a { color: var(--tx-muted); border: 1px solid var(--tx-line); border-radius: 999px; padding: 2px 9px; text-decoration: none; }
.sources a:hover { color: var(--tx-ink); border-color: var(--tx-muted); }
.failed { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--tx-danger); padding: 0 4px; }
.failed button { border: 0; background: none; padding: 0; font-weight: 700; color: inherit; text-decoration: underline; }
.dots { display: inline-flex; gap: 4px; padding: 4px 0; }
.dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--tx-muted); animation: tx-dot 1.2s infinite ease-in-out; }
.dots i:nth-child(2) { animation-delay: 0.15s; }
.dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes tx-dot { 0%, 60%, 100% { opacity: 0.3; transform: none; } 30% { opacity: 1; transform: translateY(-3px); } }

.notice { margin: 0 16px 8px; padding: 9px 12px; border-radius: 12px; font-size: 13px; color: var(--tx-muted); background: var(--tx-surface); text-align: center; }
.actions { display: flex; justify-content: center; padding: 0 16px 8px; }
.handoff {
  border: 1px solid var(--tx-accent); color: var(--tx-accent); background: transparent;
  border-radius: 999px; padding: 7px 16px; font-size: 14px; font-weight: 600;
}
.handoff:hover { background: var(--tx-accent); color: var(--tx-accent-ink); }
.handoff:disabled { opacity: 0.5; cursor: default; }

.details { display: grid; gap: 8px; padding: 12px 16px 10px; border-top: 1px solid var(--tx-line); }
.details[hidden], .composer[hidden], .closed[hidden] { display: none; }
.closed { display: grid; gap: 10px; justify-items: center; padding: 12px 16px 10px; border-top: 1px solid var(--tx-line); }
.closed p { margin: 0; font-size: 13px; color: var(--tx-muted); text-align: center; }
.closed-new {
  border: 0; background: var(--tx-accent); color: var(--tx-accent-ink); cursor: pointer;
  border-radius: 999px; padding: 9px 18px; min-height: 40px; font-size: 14px; font-weight: 600;
}
.closed-new:hover { filter: brightness(1.08); }
.details p { margin: 0; }
.details-title { font-weight: 600; }
.details-hint { font-size: 13px; color: var(--tx-muted); }
.details input {
  border: 1px solid var(--tx-line); border-radius: 12px; padding: 10px 14px; min-height: 44px;
  font: inherit; color: inherit; background: var(--tx-bg); outline: none;
  transition: border-color 0.2s ease;
}
.details input:focus { border-color: var(--tx-accent); }
.details input::placeholder { color: var(--tx-muted); }
.details-error { font-size: 13px; color: #c0362c; }
.details-buttons { display: flex; justify-content: flex-end; gap: 8px; }
.details-buttons button { border-radius: 999px; padding: 8px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
.details-cancel { border: 1px solid var(--tx-line); background: transparent; color: var(--tx-muted); }
.details-start { border: 0; background: var(--tx-accent); color: var(--tx-accent-ink); }
.composer { padding: 6px 12px 8px; }
.brand {
  display: flex; align-items: center; justify-content: center; gap: 5px;
  padding: 2px 12px 9px; font-size: 11px; line-height: 1.4;
  color: var(--tx-muted); text-decoration: none;
}
.brand img { display: block; height: 16px; width: auto; opacity: 0.85; transition: opacity 0.15s; }
.brand:hover, .brand:focus-visible { color: var(--tx-ink); }
.brand:hover img, .brand:focus-visible img { opacity: 1; }
/* Dark-text wordmark on light themes, light-text wordmark on dark ones. */
.wordmark-on-dark { display: none !important; }
:host([data-tx-theme='dark']) .wordmark-on-light { display: none !important; }
:host([data-tx-theme='dark']) .wordmark-on-dark { display: block !important; }
@media (prefers-color-scheme: dark) {
  :host([data-tx-theme='auto']) .wordmark-on-light { display: none !important; }
  :host([data-tx-theme='auto']) .wordmark-on-dark { display: block !important; }
}
.field {
  display: flex; align-items: flex-end; gap: 6px; padding: 4px 4px 4px 16px;
  border-radius: 24px; background: var(--tx-surface);
  box-shadow: inset 0 0 0 1px var(--tx-line);
  transition: background-color 0.2s ease, box-shadow 0.2s ease;
}
.field:focus-within {
  background: var(--tx-bg);
  box-shadow: inset 0 0 0 1.5px var(--tx-accent);
}
.field textarea {
  flex: 1; min-width: 0; resize: none; border: 0; margin: 0; padding: 8px 0;
  min-height: 38px; max-height: 128px; line-height: 1.4;
  background: transparent; outline: none; scrollbar-width: thin;
}
textarea::placeholder { color: var(--tx-muted); }
.send {
  flex: none; width: 38px; height: 38px; border: 0; border-radius: 50%; padding: 0;
  display: grid; place-items: center; background: var(--tx-accent); color: var(--tx-accent-ink);
  box-shadow: 0 2px 8px -2px rgb(14 18 34 / 0.3);
  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.35s var(--tx-spring);
}
@media (hover: hover) { .send:not(:disabled):hover { filter: brightness(1.1); } }
.send:not(:disabled):active { transform: scale(0.9); transition-duration: 0.08s; }
.send:disabled { background: var(--tx-line); color: var(--tx-muted); box-shadow: none; transform: scale(0.9); cursor: default; }
.send svg { width: 18px; height: 18px; }
.suggestions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; padding: 2px 14px 6px; }
.chip {
  max-width: 100%; border: 1px solid var(--tx-line); border-radius: 999px; padding: 7px 13px;
  border-color: color-mix(in srgb, var(--tx-accent) 30%, var(--tx-line));
  background: var(--tx-bg); background: color-mix(in srgb, var(--tx-accent) 6%, var(--tx-bg));
  font-size: 13.5px; font-weight: 500; line-height: 1.3; text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.3s var(--tx-spring);
  animation: tx-rise 0.4s var(--tx-out) calc(var(--i, 0) * 50ms + 120ms) backwards;
}
@media (hover: hover) { .chip:hover { background: var(--tx-accent); border-color: var(--tx-accent); color: var(--tx-accent-ink); } }
.chip:active { transform: scale(0.96); }
@keyframes tx-rise { from { opacity: 0; transform: translateY(6px); } }

@media (max-width: 480px) {
  :host(:not([mode='inline'])) .panel {
    inset: 0; width: 100%; height: 100%; max-height: none; border-radius: 0; border: 0;
    transform: translateY(24px);
  }
  :host(:not([mode='inline'])) .panel[data-state='open'] { transform: none; }
  :host([open]:not([mode='inline'])) .launcher { display: none; }
  textarea, .details input { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .launcher, .launcher svg, .badge, .panel, .log, .send, .chip { transform: none !important; }
  .dots i { animation: none !important; }
}
`;

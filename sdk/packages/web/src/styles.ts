/** Shadow DOM styles. Every colour and size is a custom property the host page can override on `truplexy-chat`. */
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
  all: initial;
  font-family: var(--tx-font);
  color: var(--tx-ink);
  font-size: 15px;
  line-height: 1.45;
}
:host([hidden]) { display: none !important; }
:host([theme='dark']) {
  --tx-bg: var(--truplexy-background, #121624);
  --tx-surface: var(--truplexy-surface, #1d2234);
  --tx-ink: var(--truplexy-ink, #eef0f8);
  --tx-muted: var(--truplexy-muted, #a2a8c3);
  --tx-line: var(--truplexy-line, #2b3148);
  --tx-danger: var(--truplexy-danger, #fb923c);
}
@media (prefers-color-scheme: dark) {
  :host([theme='auto']) {
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
  transition: transform 0.18s ease;
}
.launcher:hover { transform: scale(1.06); }
.launcher svg { width: 26px; height: 26px; grid-area: 1 / 1; transition: opacity 0.18s, transform 0.18s; }
.launcher .i-close { opacity: 0; transform: rotate(-45deg); }
:host([open]) .launcher .i-chat { opacity: 0; transform: rotate(45deg); }
:host([open]) .launcher .i-close { opacity: 1; transform: none; }
:host([position='left']) .launcher { right: auto; left: var(--tx-x); }
.badge {
  position: absolute; top: -2px; right: -2px; min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 10px; background: var(--tx-danger); color: #fff;
  font-size: 12px; font-weight: 700; line-height: 20px; text-align: center;
  border: 2px solid var(--tx-bg);
}

.panel {
  position: fixed; z-index: var(--tx-z);
  bottom: calc(var(--tx-y) + 72px); right: var(--tx-x);
  width: min(var(--tx-width), calc(100vw - 2 * var(--tx-x)));
  height: min(var(--tx-height), calc(100vh - var(--tx-y) - 100px));
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--tx-bg); border: 1px solid var(--tx-line); border-radius: var(--tx-radius);
  box-shadow: var(--tx-shadow);
  transform-origin: bottom right;
  animation: tx-in 0.2s ease;
}
:host([position='left']) .panel { right: auto; left: var(--tx-x); transform-origin: bottom left; }
@keyframes tx-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } }

:host([mode='inline']) { display: block; }
:host([mode='inline']) .launcher { display: none; }
:host([mode='inline']) .panel {
  position: relative; inset: auto; width: 100%; height: var(--tx-height);
  box-shadow: none; animation: none;
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
}
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
.agent .bubble { box-shadow: inset 3px 0 0 var(--tx-accent); }
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

.composer { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid var(--tx-line); }
textarea {
  flex: 1; resize: none; border: 1px solid var(--tx-line); border-radius: 14px;
  padding: 10px 14px; max-height: 128px; min-height: 44px; line-height: 1.4;
  background: var(--tx-bg); outline: none;
}
textarea:focus { border-color: var(--tx-accent); }
textarea::placeholder { color: var(--tx-muted); }
.send {
  flex: none; width: 44px; height: 44px; border: 0; border-radius: 50%; padding: 0;
  display: grid; place-items: center; background: var(--tx-accent); color: var(--tx-accent-ink);
}
.send:disabled { opacity: 0.45; cursor: default; }
.send svg { width: 20px; height: 20px; }

@media (max-width: 480px) {
  :host(:not([mode='inline'])) .panel {
    inset: 0; width: 100%; height: 100%; max-height: none; border-radius: 0; border: 0;
  }
  :host([open]:not([mode='inline'])) .launcher { display: none; }
  textarea { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .panel, .launcher, .launcher svg, .dots i { animation: none !important; transition: none !important; }
}
`;

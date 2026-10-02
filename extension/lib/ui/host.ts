import { UI_ATTR } from "../messages";
import { INTER, LORA } from "./fonts";

// Grain: warm-tinted fractal noise, 180px tile, 3.5% opacity (the app's --grain).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .33 0 0 0 0 .18 0 0 0 1.4 -.2'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E\")";

const CSS = `
/* The host lives in the page, so page rules can reach it: inner !important beats theirs. */
:host {
  all: initial !important;
  position: fixed !important; left: 24px !important; bottom: 24px !important; z-index: 2147483647 !important;
  display: block !important;
  --surface: #F4EFE6; --ink: #2B2420; --ink-quiet: #8A7F72; --ink-faint: #C4BAA8; --margin-text: #A89F94;
  --sans: "${INTER}", system-ui, -apple-system, "Segoe UI", sans-serif;
  --serif: "${LORA}", Georgia, serif;
}
.stack { display: flex; flex-direction: column-reverse; align-items: flex-start; gap: 10px;
  font: 13px/1.3 var(--sans); letter-spacing: -0.01em; color: var(--ink); }
.paper { position: relative; box-sizing: border-box; background-color: var(--surface); background-image: ${GRAIN};
  background-size: 180px 180px; box-shadow: 0 10px 30px rgba(43,36,32,.14), 0 1px 3px rgba(43,36,32,.08); }
.text { font: inherit; letter-spacing: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer;
  color: var(--ink); text-decoration: none; }
.text:focus-visible { outline: none; text-decoration: underline; text-underline-offset: 0.2em; text-decoration-color: var(--ink-faint); }

.trigger { padding: 8px 12px; }
.toast { padding: 10px 14px; display: flex; gap: 12px; align-items: baseline; max-width: 320px; }

.overlay { width: min(320px, calc(100vw - 32px)); padding: 20px 22px 18px;
  animation: arrive 200ms ease both; transition: opacity 400ms ease; }
.overlay[data-phase="leaving"] { opacity: 0; }
.outline { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.outline .long { fill: var(--ink-faint); opacity: .45; }
.outline .short { fill: var(--ink-faint); }

.content { position: relative; display: flex; flex-direction: column; transition: opacity 300ms ease; }
.overlay[data-phase="confirm"] .content, .overlay[data-phase="leaving"] .content { opacity: 0; pointer-events: none; }
.who { display: flex; flex-direction: column; gap: 3px; min-width: 0; margin-bottom: 18px; }
.name { font-size: 14px; font-weight: 600; color: var(--ink); }
.headline { font-size: 13px; color: var(--ink-quiet); }
.note { display: block; width: 100%; box-sizing: border-box; min-height: 72px; margin: 0; padding: 0; border: 0; outline: none;
  background: transparent; resize: none; font: italic 15px/1.6 var(--serif); letter-spacing: 0.01em; color: var(--ink); caret-color: var(--ink); }
.note::placeholder { color: var(--ink-quiet); opacity: 1; }
.actions { display: flex; align-items: baseline; gap: 36px; margin-top: 14px; }
.skip { color: var(--margin-text); }
.error { margin-top: 10px; color: var(--ink-quiet); }
.content[aria-busy="true"] .text { cursor: default; color: var(--margin-text); }

.confirmed { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 0 22px;
  font: italic 14px/1.6 var(--serif); letter-spacing: 0.01em; color: var(--ink-quiet); text-align: center;
  animation: arrive 300ms ease 200ms both; }

@media (max-width: 600px) {
  :host { left: 16px !important; bottom: 16px !important; }
  .overlay, .toast { width: calc(100vw - 32px); max-width: none; }
}

@keyframes arrive { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .overlay, .content, .confirmed { animation: none; transition: none; }
}
`;

let stack: HTMLElement | null = null;

/** A fixed bottom-left container inside a shadow root, isolated from LinkedIn's CSS. */
export function uiStack(): HTMLElement {
  if (stack?.isConnected) return stack;

  // A custom tag, so the page's div and span rules never match the host itself.
  const host = document.createElement("flaneur-ui");
  host.setAttribute(UI_ATTR, "");
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS;
  stack = document.createElement("div");
  stack.className = "stack";
  shadow.append(style, stack);
  document.body.append(host);
  return stack;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

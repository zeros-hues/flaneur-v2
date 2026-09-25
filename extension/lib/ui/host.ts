import { UI_ATTR } from "../messages";

const CSS = `
:host { all: initial; }
.stack { display: flex; flex-direction: column-reverse; align-items: flex-start; gap: 8px;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f1d1a; }
.panel { background: #fbfaf7; border: 1px solid #d9d4ca; border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,.14); }
.trigger { font: inherit; padding: 6px 12px; border-radius: 999px; cursor: pointer;
  background: #fbfaf7; border: 1px solid #d9d4ca; color: inherit; }
.trigger:hover { background: #f1eee7; }
.overlay { width: 280px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.overlay header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
.overlay textarea { font: inherit; resize: vertical; min-height: 54px; padding: 6px 8px;
  border: 1px solid #d9d4ca; border-radius: 6px; background: #fff; color: inherit; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.status { color: #6b655c; }
.primary { font: inherit; padding: 5px 12px; border-radius: 6px; border: 0; cursor: pointer;
  background: #2f4a3a; color: #fff; }
.primary:disabled { opacity: .5; cursor: default; }
.close { font: inherit; background: none; border: 0; cursor: pointer; color: #6b655c; padding: 0 4px; }
.toast { padding: 8px 10px; display: flex; gap: 10px; align-items: center; }
.toast button { font: inherit; background: none; border: 0; color: #2f4a3a; cursor: pointer;
  text-decoration: underline; padding: 0; }
@media (prefers-color-scheme: dark) {
  .stack { color: #ece8e1; }
  .panel, .trigger { background: #26241f; border-color: #45413a; }
  .trigger:hover { background: #312e28; }
  .overlay textarea { background: #1c1a17; border-color: #45413a; }
  .status, .close { color: #a8a298; }
  .primary { background: #7fa68c; color: #14130f; }
  .toast button { color: #9fc4ab; }
}
`;

let stack: HTMLElement | null = null;

/** A fixed bottom-left container inside a shadow root, isolated from LinkedIn's CSS. */
export function uiStack(): HTMLElement {
  if (stack?.isConnected) return stack;

  const host = document.createElement("div");
  host.setAttribute(UI_ATTR, "");
  host.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:2147483647;";
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

import { h, uiStack } from "./host";

/** Mounts the small capture button. Returns a function that removes it. */
export function mountTrigger(label: string, onClick: () => void): () => void {
  const button = h("button", "trigger", label);
  button.type = "button";
  button.addEventListener("click", onClick);
  uiStack().prepend(button); // stack is column-reverse, so first child sits at the bottom
  return () => button.remove();
}

import { h, uiStack } from "./host";

export interface ToastAction {
  label: string;
  run: () => void;
}

/** A plain line on paper, with an optional text action (Retry on a failed capture). */
export function showToast(text: string, action?: ToastAction): void {
  const toast = h("div", "paper toast");
  toast.setAttribute("role", "status");
  toast.append(h("span", "", text));

  if (action) {
    const button = h("button", "text", action.label);
    button.type = "button";
    button.addEventListener("click", () => {
      toast.remove();
      action.run();
    });
    toast.append(button);
  }

  uiStack().append(toast);
  setTimeout(() => toast.remove(), action ? 8_000 : 2_500);
}

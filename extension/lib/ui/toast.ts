import { h, uiStack } from "./host";

export interface ToastAction {
  label: string;
  run: () => void;
}

export function showToast(text: string, action?: ToastAction): void {
  const toast = h("div", "panel toast");
  toast.setAttribute("role", "status");
  toast.append(h("span", "", text));

  if (action) {
    const button = h("button", "", action.label);
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

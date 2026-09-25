import { h, uiStack } from "./host";

export interface OverlayOptions {
  heading: string;
  /** Resolves once the capture has been handed off; throw to show an error. */
  onSubmit: (note: string | null) => Promise<void>;
  onCancel: () => void;
}

const CONFIRM_MS = 700;
let isOpen = false;

export function isOverlayOpen(): boolean {
  return isOpen;
}

export function openCaptureOverlay(options: OverlayOptions): void {
  if (isOpen) return;
  isOpen = true;

  const form = h("form", "panel overlay");
  const header = h("header", "");
  const close = h("button", "close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Cancel capture");
  header.append(h("span", "", options.heading), close);

  const textarea = h("textarea", "");
  textarea.placeholder = "why'd this catch your eye";
  textarea.setAttribute("aria-label", "Note");

  const status = h("span", "status");
  status.setAttribute("role", "status");
  const submit = h("button", "primary", "Capture");
  submit.type = "submit";
  const row = h("div", "row");
  row.append(status, submit);
  form.append(header, textarea, row);

  let settled = false;
  const dismiss = () => {
    form.remove();
    isOpen = false;
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    options.onCancel();
    dismiss();
  };

  close.addEventListener("click", cancel);
  form.addEventListener("keydown", (event) => {
    event.stopPropagation(); // keep LinkedIn's shortcuts out of the textarea
    if (event.key === "Escape") cancel();
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) form.requestSubmit();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (settled) return;
    settled = true;
    submit.disabled = true;
    textarea.disabled = true;
    status.textContent = "Capturing…";

    const note = textarea.value.trim();
    options.onSubmit(note === "" ? null : note).then(
      () => {
        status.textContent = "Captured";
        setTimeout(dismiss, CONFIRM_MS);
      },
      (error: unknown) => {
        settled = false;
        submit.disabled = false;
        textarea.disabled = false;
        status.textContent = error instanceof Error ? error.message : "Capture failed";
      },
    );
  });

  uiStack().append(form); // column-reverse: later children sit above the trigger
  textarea.focus();
}

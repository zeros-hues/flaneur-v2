import { registerFonts } from "./fonts";
import { h, uiStack } from "./host";
import type { Subject } from "./identity";
import { inkOutline } from "./outline";

export interface OverlayOptions {
  /** Who is being captured; shown only when the page provided it. */
  subject: Subject | null;
  /** Resolves once the capture has been handed off (never waits on the server); throw to show an error. */
  onSubmit: (note: string | null) => Promise<void>;
  onCancel: () => void;
}

// Success: the content dissolves (300ms), the confirmation holds (1.2s), the overlay dissolves (400ms).
const CONTENT_OUT_MS = 300;
const HOLD_MS = 1_200;
const LEAVE_MS = 400;

let isOpen = false;

export function isOverlayOpen(): boolean {
  return isOpen;
}

export function openCaptureOverlay(options: OverlayOptions): void {
  if (isOpen) return;
  isOpen = true;
  registerFonts();

  const overlay = h("form", "paper overlay");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "capture to flaneur");
  overlay.dataset.phase = "open";

  const content = h("div", "content");
  if (options.subject) {
    const who = h("div", "who");
    who.append(h("span", "name", options.subject.name));
    if (options.subject.headline) who.append(h("span", "headline", options.subject.headline));
    content.append(who);
  }

  const note = h("textarea", "note");
  note.rows = 3;
  note.placeholder = "why'd this catch your eye";
  note.spellcheck = false;
  note.setAttribute("aria-label", "Note");

  const capture = h("button", "text", "capture");
  capture.type = "submit";
  const skip = h("button", "text skip", "skip");
  skip.type = "button";
  const actions = h("div", "actions");
  actions.append(capture, skip);
  const error = h("p", "error");
  error.setAttribute("role", "status");
  error.hidden = true;
  content.append(note, actions, error);
  overlay.append(inkOutline(overlay), content);

  let settled = false;
  const remove = () => {
    overlay.remove();
    isOpen = false;
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    options.onCancel();
    remove();
  };

  skip.addEventListener("click", cancel);
  overlay.addEventListener("keydown", (event) => {
    event.stopPropagation(); // keep LinkedIn's shortcuts out of the textarea
    if (event.key === "Escape") cancel();
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      overlay.requestSubmit();
    }
  });

  overlay.addEventListener("submit", (event) => {
    event.preventDefault();
    if (settled) return;
    settled = true;
    content.setAttribute("aria-busy", "true");
    note.readOnly = true;
    error.hidden = true;

    const written = note.value.trim();
    options.onSubmit(written === "" ? null : written).then(
      () => {
        const confirmed = h("p", "confirmed", written ? "added to your city" : "added to your city, quietly");
        confirmed.setAttribute("aria-live", "polite");
        overlay.append(confirmed);
        overlay.dataset.phase = "confirm";
        setTimeout(() => (overlay.dataset.phase = "leaving"), CONTENT_OUT_MS + HOLD_MS);
        setTimeout(remove, CONTENT_OUT_MS + HOLD_MS + LEAVE_MS);
      },
      (reason: unknown) => {
        // The plain error, and the same action again to retry.
        settled = false;
        content.removeAttribute("aria-busy");
        note.readOnly = false;
        error.textContent = reason instanceof Error ? reason.message : "Capture failed";
        error.hidden = false;
        capture.textContent = "retry";
      },
    );
  });

  uiStack().append(overlay); // column-reverse: later children sit above the trigger
  note.focus();
}

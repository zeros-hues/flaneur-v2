import { CAPTURED_ATTR, isPostMenuClicked } from "../lib/messages";
import { serialise } from "../lib/serialise";
import { isOverlayOpen, openCaptureOverlay } from "../lib/ui/overlay";
import { showToast } from "../lib/ui/toast";
import { findPostUrn } from "../lib/urn";
import { deliver, extensionVersion } from "./deliver";

// Feed cards and profile activity cards both render as this listitem.
const POST_SELECTOR = '[role="listitem"][componentkey^="update-card-focus"]';

let lastTarget: Element | null = null;
// Survives the virtualised feed unmounting and remounting a card.
const handledKeys = new Set<string>();

function release(container: Element, key: string): void {
  container.removeAttribute(CAPTURED_ATTR);
  handledKeys.delete(key);
}

function captureAt(target: Element | null): void {
  if (isOverlayOpen()) return;
  const container = target?.closest(POST_SELECTOR) ?? null;
  if (!container) {
    showToast("Right-click inside a post to capture it");
    return;
  }

  const urn = findPostUrn(container);
  const key = urn ?? container.getAttribute("componentkey") ?? "";
  if (container.hasAttribute(CAPTURED_ATTR) || handledKeys.has(key)) {
    showToast("Already captured");
    return;
  }
  container.setAttribute(CAPTURED_ATTR, "pending");
  handledKeys.add(key);

  // Serialise now: the card may be unmounted while the note is typed.
  const html = serialise(container);
  const sourceUrl = location.href;

  openCaptureOverlay({
    heading: "Capture post",
    onCancel: () => release(container, key),
    onSubmit: async (note) => {
      const payload = { type: "post" as const, sourceUrl, html, note, urn, extensionVersion: extensionVersion() };
      void deliver(payload, (ok) => {
        if (ok) container.setAttribute(CAPTURED_ATTR, "done");
        else release(container, key);
      });
    },
  });
}

export function initPostCapture(): void {
  // The one delegated listener: remembers what was right-clicked for the menu click.
  document.addEventListener(
    "contextmenu",
    (event) => {
      const origin = event.composedPath()[0];
      lastTarget = origin instanceof Element ? origin : null;
    },
    { capture: true },
  );

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isPostMenuClicked(message)) captureAt(lastTarget);
    return false;
  });
}

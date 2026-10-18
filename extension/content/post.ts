import { isPostMenuClicked,type CapturePayload } from "../lib/messages";
import { serialise } from "../lib/serialise";
import { postSubject } from "../lib/ui/identity";
import { isOverlayOpen, openCaptureOverlay } from "../lib/ui/overlay";
import { showToast } from "../lib/ui/toast";
import { findPostUrn } from "../lib/urn";
import { deliver, extensionVersion,captureIdentity } from "./deliver";

// Feed cards and profile activity cards both render as this listitem.
const POST_SELECTOR = '[role="listitem"][componentkey^="update-card-focus"]';

let lastTarget: Element | null = null;

function captureAt(target: Element | null): void {
  if (isOverlayOpen()) return;
  const container = target?.closest(POST_SELECTOR) ?? null;
  if (!container) {
    showToast("Right-click inside a post to capture it");
    return;
  }

  const urn = findPostUrn(container);

  // Serialise now: the card may be unmounted while the note is typed.
  const html = serialise(container);
  const sourceUrl = location.href;
  const identity=captureIdentity();let pending:CapturePayload|null=null;

  openCaptureOverlay({
    subject: postSubject(container),
    onCancel: () => {},
    onSubmit: async (note) => {
      pending??={...identity,type:"post",sourceUrl,html,note,urn,extensionVersion:extensionVersion()};
      return deliver(pending);
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

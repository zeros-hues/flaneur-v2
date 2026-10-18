import { serialise } from "../lib/serialise";
import { profileSubject } from "../lib/ui/identity";
import { isOverlayOpen, openCaptureOverlay } from "../lib/ui/overlay";
import { mountTrigger } from "../lib/ui/trigger";
import { deliver, extensionVersion,captureIdentity } from "./deliver";
import type { CapturePayload } from "../lib/messages";

const PROFILE_PATH = /^\/in\/[^/]+/;
const ROUTE_POLL_MS = 1_000;

// Present on both the profile page and /details/* pages in captured HTML.
function findProfileRoot(): Element | null {
  return (
    document.querySelector('main#workspace section[aria-label="Primary content"]') ??
    document.querySelector("main#workspace") ??
    document.querySelector("main")
  );
}

function startCapture(): void {
  if (isOverlayOpen()) return;

  let pending:CapturePayload|null=null;
  const sourceUrl=location.origin+location.pathname;

  openCaptureOverlay({
    subject: profileSubject(),
    context:"Saves the content currently loaded here. Load more yourself, then save again for a fuller capture.",
    onCancel: () => {},
    onSubmit: async (note) => {
      if(pending)return deliver(pending);
      if(location.origin+location.pathname!==sourceUrl)throw new Error("The page changed. Cancel this capture and open Save on the current page.");
      const root = findProfileRoot();
      if (!root) throw new Error("Couldn't find the profile content");
      pending={
        ...captureIdentity(),
        type: "profile",
        sourceUrl: location.origin + location.pathname,
        html: serialise(root),
        note,
        urn: null,
        extensionVersion: extensionVersion(),
      };return deliver(pending);
    },
  });
}

/** LinkedIn is a SPA, so the trigger follows the route rather than the page load. */
export function initProfileCapture(): void {
  let unmount: (() => void) | null = null;

  const sync = () => {
    const onProfile = PROFILE_PATH.test(location.pathname);
    if (onProfile && !unmount) unmount = mountTrigger("Save", startCapture);
    if (!onProfile && unmount) {
      unmount();
      unmount = null;
    }
  };

  sync();
  setInterval(sync, ROUTE_POLL_MS);
}

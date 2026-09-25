import { scrollThrough } from "../lib/scroll";
import { serialise } from "../lib/serialise";
import { isOverlayOpen, openCaptureOverlay } from "../lib/ui/overlay";
import { mountTrigger } from "../lib/ui/trigger";
import { deliver, extensionVersion } from "./deliver";

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

  // Scroll while the note is being typed so submitting rarely has to wait.
  const scrolling = new AbortController();
  const scrolled = scrollThrough(scrolling.signal);

  openCaptureOverlay({
    heading: "Capture profile",
    onCancel: () => scrolling.abort(),
    onSubmit: async (note) => {
      await scrolled;
      const root = findProfileRoot();
      if (!root) throw new Error("Couldn't find the profile content");
      void deliver({
        type: "profile",
        sourceUrl: location.origin + location.pathname,
        html: serialise(root),
        note,
        urn: null,
        extensionVersion: extensionVersion(),
      });
    },
  });
}

/** LinkedIn is a SPA, so the trigger follows the route rather than the page load. */
export function initProfileCapture(): void {
  let unmount: (() => void) | null = null;

  const sync = () => {
    const onProfile = PROFILE_PATH.test(location.pathname);
    if (onProfile && !unmount) unmount = mountTrigger("Capture", startCapture);
    if (!onProfile && unmount) {
      unmount();
      unmount = null;
    }
  };

  sync();
  setInterval(sync, ROUTE_POLL_MS);
}

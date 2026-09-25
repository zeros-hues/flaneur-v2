import type { CapturePayload, CaptureRequest, CaptureResult } from "../lib/messages";
import { showToast } from "../lib/ui/toast";

export const extensionVersion = (): string => chrome.runtime.getManifest().version;

/**
 * Hands the payload to the background worker, which owns the secret and the network.
 * The overlay confirms before this settles; failures surface as a toast with Retry.
 */
export async function deliver(
  payload: CapturePayload,
  onSettled?: (ok: boolean) => void,
): Promise<void> {
  const request: CaptureRequest = { kind: "capture", payload };
  let result: CaptureResult;
  try {
    result = await chrome.runtime.sendMessage<CaptureRequest, CaptureResult>(request);
  } catch {
    result = { ok: false, error: "extension was reloaded, refresh the page" };
  }

  onSettled?.(result.ok);
  if (!result.ok) {
    showToast(`Couldn't save capture (${result.error})`, {
      label: "Retry",
      run: () => void deliver(payload, onSettled),
    });
  }
}

import {
  isCaptureRequest,
  POST_MENU_ID,
  type CapturePayload,
  type CaptureResult,
  type PostMenuClicked,
} from "./lib/messages";
import { readSecret } from "./lib/secret";

chrome.runtime.onInstalled.addListener(() => {
  void readSecret().then((secret) => {
    if (!secret) void chrome.runtime.openOptionsPage();
  });
  chrome.contextMenus.create({
    id: POST_MENU_ID,
    title: "Capture this post to Flaneur",
    contexts: ["all"],
    documentUrlPatterns: ["https://www.linkedin.com/*"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== POST_MENU_ID || tab?.id === undefined) return;
  const message: PostMenuClicked = { kind: "post-menu-clicked" };
  chrome.tabs.sendMessage(tab.id, message, { frameId: info.frameId }).catch(() => {
    // Content script not present (tab opened before install); nothing to capture.
  });
});

async function send(payload: CapturePayload): Promise<CaptureResult> {
  const secret = await readSecret();
  if (!secret) {
    void chrome.runtime.openOptionsPage();
    return { ok: false, error: "set the capture secret in the extension options" };
  }
  try {
    const response = await fetch(new URL("/api/capture", __APP_URL__), {
      method: "POST",
      headers: { "content-type": "application/json", "x-capture-secret": secret },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) return { ok: false, error: "the capture secret was rejected; check the extension options" };
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const body: unknown = await response.json().catch(() => null);
    const summary =
      typeof body === "object" && body !== null && "summary" in body && typeof body.summary === "string"
        ? body.summary
        : null;
    return { ok: true, summary };
  } catch {
    return { ok: false, error: "network error" };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isCaptureRequest(message)) return false;
  void send(message.payload).then(sendResponse);
  return true; // keep the channel open for the async response
});

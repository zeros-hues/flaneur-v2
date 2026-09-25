import { APP_URL, CAPTURE_SECRET } from "./config";
import {
  isCaptureRequest,
  POST_MENU_ID,
  type CapturePayload,
  type CaptureResult,
  type PostMenuClicked,
} from "./lib/messages";

chrome.runtime.onInstalled.addListener(() => {
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
  try {
    const response = await fetch(new URL("/api/capture", APP_URL), {
      method: "POST",
      headers: { "content-type": "application/json", "x-capture-secret": CAPTURE_SECRET },
      body: JSON.stringify(payload),
    });
    return response.ok ? { ok: true } : { ok: false, error: `HTTP ${response.status}` };
  } catch {
    return { ok: false, error: "network error" };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isCaptureRequest(message)) return false;
  void send(message.payload).then(sendResponse);
  return true; // keep the channel open for the async response
});

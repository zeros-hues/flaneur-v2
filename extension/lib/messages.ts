export const POST_MENU_ID = "flaneur-capture-post";

/** Marks our injected UI so it is never serialised. */
export const UI_ATTR = "data-flaneur-ui";
/** Marks post containers already handled ("pending" | "done"). Stripped from serialised output. */
export const CAPTURED_ATTR = "data-flaneur-captured";

export interface CapturePayload {
  type: "profile" | "post";
  sourceUrl: string;
  html: string;
  note: string | null;
  urn: string | null;
  extensionVersion: string;
}

export interface CaptureRequest {
  kind: "capture";
  payload: CapturePayload;
}

export interface PostMenuClicked {
  kind: "post-menu-clicked";
}

export type CaptureResult = { ok: true } | { ok: false; error: string };

function hasKind(message: unknown, kind: string): boolean {
  return typeof message === "object" && message !== null && "kind" in message && message.kind === kind;
}

export const isCaptureRequest = (message: unknown): message is CaptureRequest =>
  hasKind(message, "capture");

export const isPostMenuClicked = (message: unknown): message is PostMenuClicked =>
  hasKind(message, "post-menu-clicked");

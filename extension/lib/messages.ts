export const POST_MENU_ID = "flaneur-capture-post";

/** Marks our injected UI so it is never serialised. */
export const UI_ATTR = "data-flaneur-ui";
/** Legacy marker stripped from serialised output; no longer suppresses repeat saves. */
export const CAPTURED_ATTR = "data-flaneur-captured";

export interface CapturePayload {
  requestId: string;
  clientCapturedAt: string;
  type: "profile" | "post" | "article";
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

export type CaptureResult = { ok:true;requestId:string;state:"queued"|"blocked"|"failed"|"saved"|"unknown";processing?:string;code?:string|null }|{ok:false;error:string};

function hasKind(message: unknown, kind: string): boolean {
  return typeof message === "object" && message !== null && "kind" in message && message.kind === kind;
}

export const isPostMenuClicked = (message: unknown): message is PostMenuClicked =>
  hasKind(message, "post-menu-clicked");

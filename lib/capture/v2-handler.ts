import { CaptureConflict, captureV2 } from "./v2-contract";
import { saveCaptureV2, type CaptureStore } from "./v2-save";
import { CAPTURE_V2_REQUEST_BYTES } from "./v2-limits";

async function boundedJson(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > CAPTURE_V2_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_JSON");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > CAPTURE_V2_REQUEST_BYTES) { await reader.cancel(); throw new Error("REQUEST_TOO_LARGE"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

const response = (body: unknown, status: number) => Response.json(body, { status, headers: {
  "cache-control": "no-store", "vary": "x-capture-secret", "x-content-type-options": "nosniff",
} });

// The separate v2 route supplies its explicit activation gate. No parsing/provider work occurs here.
export function captureV2Handler(store: CaptureStore, authorised: (secret: string | null) => boolean,
  options: { enabled?: () => boolean } = {}) {
  return async (request: Request): Promise<Response> => {
    try { if (!authorised(request.headers.get("x-capture-secret"))) return response({ error: "unauthorised" }, 401); }
    catch { return response({ error: "capture_unavailable" }, 503); }
    if (options.enabled && !options.enabled()) return response({ error: "capture_v2_disabled" }, 503);
    const contentType = request.headers.get("content-type");
    if (contentType && contentType.split(";",1)[0]!.trim().toLowerCase() !== "application/json")
      return response({ error: "invalid_capture" }, 415);
    let input: unknown;
    try { input = await boundedJson(request); }
    catch (error) { return response({ error: "invalid_capture" },
      error instanceof Error && error.message === "REQUEST_TOO_LARGE" ? 413 : 400); }
    const parsed = captureV2.safeParse(input);
    if (!parsed.success) return response({ error: "invalid_capture" }, 400);
    try {
      return response(await saveCaptureV2(store, parsed.data), 200);
    } catch (error) {
      return response({ error: error instanceof CaptureConflict ? "request_payload_conflict" : "capture_unavailable" },
        error instanceof CaptureConflict ? 409 : 503);
    }
  };
}

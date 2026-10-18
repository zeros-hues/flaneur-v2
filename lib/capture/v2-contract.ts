import { createHash } from "node:crypto";
import { z } from "zod";
import { canonical } from "../migration/batch";
import { CAPTURE_V2_HTML_BYTES } from "./v2-limits";

const validText = (value: string) => !value.includes("\0") &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);

const linkedinUrl = z.url().max(8_000).refine(validText).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password &&
    (url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com"));
}, "must be a credential-free HTTPS LinkedIn URL");

// Source-neutral envelope; the first released adapter remains explicitly LinkedIn-only.
export const captureV2 = z.strictObject({
  version: z.literal(2), requestId: z.uuid().transform(value => value.toLowerCase()), adapterId: z.literal("linkedin"),
  kind: z.enum(["profile_page", "social_post"]), sourceUrl: linkedinUrl,
  html: z.string().min(1).max(CAPTURE_V2_HTML_BYTES).refine(validText).refine((html) => Buffer.byteLength(html, "utf8") <= CAPTURE_V2_HTML_BYTES,
    "captured HTML exceeds UTF-8 byte limit"), reasonForNoticing: z.string().min(1).max(5_000).refine(validText).nullable(),
  urn: z.string().max(256).regex(/^urn:li:[A-Za-z]+:\d+$/).nullable(),
  extensionVersion: z.string().min(1).max(32).refine(validText), clientCapturedAt: z.iso.datetime({ offset: true }),
}).refine((body) => body.kind !== "profile_page" || body.urn === null,
  { message: "profile capture must not supply a post URN", path: ["urn"] });
export type CaptureV2 = z.infer<typeof captureV2>;
export type ProcessingState = "queued" | "leased" | "succeeded" | "failed" | "superseded" | "quarantined";
export type CaptureAcknowledgment = { version: 2; requestId: string; snapshotId: string;
  encounterId: string; state: "saved"; processing: ProcessingState; replayed: boolean };

export function captureFingerprint(body: CaptureV2): string {
  return createHash("sha256").update(canonical(body)).digest("hex");
}

export class CaptureConflict extends Error {
  constructor() { super("CAPTURE_REQUEST_PAYLOAD_CONFLICT"); }
}

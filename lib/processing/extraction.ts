import { createHash } from "node:crypto";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { normalizeCapture } from "../retrieval/normalize";
import { extractProfileFields, type ExtractedField } from "../retrieval/fields";
import type { Representation } from "../retrieval/representation";
import { parseFingerprint } from "./parse-input";
import type { Lease } from "./worker";

export interface ExtractionSnapshot {
  id: string; contentGzip: Buffer; contentHash: string; sourceUrl: string; adapterId: string;
  kind: "profile_page" | "social_post";
  /** Supplied by an identity resolver; apply must revalidate this proof, never trust old person projection. */
  subject: { personId: string; identityObservationId: string } | null;
}
export interface ExtractionResult {
  snapshotId: string; inputFingerprint: string; representation: Representation | null;
  fields: ExtractedField[]; subject: ExtractionSnapshot["subject"];
  state: "extracted" | "unresolved" | "quarantined";
  omittedCount: number; code: "NORMALIZATION_FAILED" | null;
}
const decompress = promisify(gunzip);
export function extractionProcessor(read: (snapshotId: string) => Promise<ExtractionSnapshot>) {
  return async (lease: Lease, renew: () => Promise<boolean>) => {
    if (lease.kind !== "parse") throw new Error("INVALID_EXTRACTION_JOB");
    const loaded = await read(lease.snapshotId);
    const snapshot = { ...loaded, contentGzip: Buffer.from(loaded.contentGzip),
      subject: loaded.subject ? { ...loaded.subject } : null };
    if (snapshot.id !== lease.snapshotId || snapshot.adapterId !== "linkedin" ||
        parseFingerprint({ contentHash: snapshot.contentHash, sourceUrl: snapshot.sourceUrl,
          adapterId: snapshot.adapterId, kind: snapshot.kind,
          identityObservationId: snapshot.subject?.identityObservationId ?? null }) !== lease.inputFingerprint)
      throw new Error("EXTRACTION_INPUT_MISMATCH");
    const bytes = await decompress(snapshot.contentGzip, { maxOutputLength: 10_000_000 });
    if (createHash("sha256").update(bytes).digest("hex") !== snapshot.contentHash)
      throw new Error("SNAPSHOT_HASH_MISMATCH");
    const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!await renew()) throw new Error("EXTRACTION_LEASE_LOST");
    const base = { snapshotId: snapshot.id, inputFingerprint: lease.inputFingerprint, subject: snapshot.subject };
    let source: Representation;
    try { source = normalizeCapture(snapshot.id, snapshot.kind, html); }
    catch {
      const result: ExtractionResult = { ...base, representation: null, fields: [], state: "quarantined",
        omittedCount: 0, code: "NORMALIZATION_FAILED" };
      return { result, outcome: "quarantined" as const };
    }
    const extracted = snapshot.kind === "profile_page" && snapshot.subject
      ? extractProfileFields(html, source, snapshot.subject.personId, lease.inputFingerprint) : { fields: [], omitted: [] };
    const result: ExtractionResult = { ...base, representation: source, fields: extracted.fields,
      state: snapshot.subject ? "extracted" : "unresolved", omittedCount: extracted.omitted.length, code: null };
    return { result, outcome: "succeeded" as const };
  };
}

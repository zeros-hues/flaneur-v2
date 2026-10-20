import type { Evidence } from "./evidence";
import { representation, sameRepresentation, type Representation } from "./representation";
import { parseFingerprint, normalizerVersion } from "../processing/parse-input";

/** SQL has checked active canonical source/Encounter links and a succeeded current-head job. */
export interface CapturedSourceRow extends Representation {
  artifactId: string; encounterId: string; sourceUrl: string; contentHash: string;
  adapterId: string; kind: "profile_page" | "social_post" | "article"; fingerprint: string;
}
export function capturedSourceEvidence(row: CapturedSourceRow, identityObservationId: string | null): Evidence[] {
  if (!((row.adapterId === "linkedin" && row.kind !== "article") || (row.adapterId === "web" && row.kind === "article")) || row.normalizerVersion !== `${normalizerVersion(row.kind)}:${row.kind}` ||
      !row.text.trim() || parseFingerprint({ ...row, identityObservationId }) !== row.fingerprint ||
      !sameRepresentation(row, representation(row.snapshotId, row.normalizerVersion, row.text))) return [];
  let sourceUrl: string | undefined;
  try {
    const url = new URL(row.sourceUrl);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) sourceUrl = url.href;
  } catch { /* Retain the captured text without an unsafe external link. */ }
  return [row.artifactId, row.encounterId].map(objectId => ({
    id: `captured-source:${row.id}:object:${objectId}`, objectId, text: row.text,
    layer: "source", verified: true,
    // Verified means an exact quote of this captured representation, not external factual truth.
    provenance: { snapshotId: row.snapshotId, representationId: row.id,
      startCodepoint: 0, endCodepoint: Array.from(row.text).length,
      supportStatus: "captured_text", ...(sourceUrl ? { sourceUrl } : {}) },
  }));
}

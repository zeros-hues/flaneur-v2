import { createHash } from "node:crypto";
import { migrationId } from "../migration/identity";
import { verifiedExcerpt } from "./evidence";

export interface Representation {
  id: string;
  snapshotId: string;
  normalizerVersion: string;
  text: string;
  textHash: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PostgreSQL UTF-8 cannot store NUL or lone UTF-16 surrogates.
const postgresText = (text: string) => !text.includes("\0") &&
  Array.from(text).every((point) => !/^[\uD800-\uDFFF]$/.test(point));

/** Input is adapter-produced plaintext. This function does not assert HTML extraction correctness. */
export function representation(snapshotId: string, normalizerVersion: string, text: string): Representation {
  if (!uuid.test(snapshotId) || !normalizerVersion.trim() || !postgresText(text) || !postgresText(normalizerVersion))
    throw new Error("INVALID_REPRESENTATION");
  const canonicalId = snapshotId.toLowerCase();
  return {
    id: migrationId(`representation:v1:${JSON.stringify([canonicalId, normalizerVersion])}`),
    snapshotId: canonicalId, normalizerVersion, text,
    textHash: createHash("sha256").update(text, "utf8").digest("hex"),
  };
}

export function locateText(source: Representation, evidence: { id: string; snapshotId: string | null; excerpt: string | null },
  start: number, end: number, quote: string) {
  if (!uuid.test(evidence.id) || source.snapshotId !== evidence.snapshotId?.toLowerCase() ||
      evidence.excerpt !== quote || !verifiedExcerpt(source.text, start, end, quote))
    throw new Error("INVALID_TEXT_EVIDENCE");
  return { evidenceId: evidence.id.toLowerCase(), representationId: source.id, start, end, quote };
}

/** Same snapshot/version with changed plaintext is a conflict, never an update. */
export function sameRepresentation(existing: Representation, proposed: Representation): boolean {
  return existing.id === proposed.id && existing.snapshotId === proposed.snapshotId &&
    existing.normalizerVersion === proposed.normalizerVersion && existing.text === proposed.text &&
    existing.textHash === proposed.textHash;
}

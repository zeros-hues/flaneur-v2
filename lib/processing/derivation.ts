import { z } from "zod";
import type { ExtractionResult } from "./extraction";
import type { Lease } from "./worker";

const bindingSchema = z.object({ observationId: z.uuid(), snapshotId: z.uuid(), identityObservationId: z.uuid(),
  jobId: z.uuid(), representationId: z.uuid(), inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
export type DerivationBinding = z.infer<typeof bindingSchema>;

/** Static provenance only. Current-head eligibility is a separate retrieval check. */
export function extractionBindings(lease: Lease, result: ExtractionResult): DerivationBinding[] {
  if (lease.kind !== "parse" || result.snapshotId !== lease.snapshotId || result.inputFingerprint !== lease.inputFingerprint)
    throw new Error("EXTRACTION_OUTPUT_MISMATCH");
  if (!result.fields.length) return [];
  if (result.state !== "extracted" || !result.subject || result.representation?.snapshotId !== lease.snapshotId)
    throw new Error("INVALID_DERIVATION_OUTPUT");
  const ids = new Set<string>();
  return result.fields.map((field) => {
    if (field.subjectId !== result.subject!.personId || ids.has(field.observationId)) throw new Error("INVALID_DERIVATION_FIELD");
    ids.add(field.observationId);
    return bindingSchema.parse({ observationId: field.observationId, snapshotId: lease.snapshotId,
      identityObservationId: result.subject!.identityObservationId, jobId: lease.jobId,
      representationId: result.representation!.id, inputFingerprint: lease.inputFingerprint });
  });
}

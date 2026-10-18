import { z } from "zod";
import { inputFingerprint } from "../processing/fingerprint";

const schema = z.object({ requestId: z.uuid(), observationId: z.uuid() }).strict();
export interface ObservationArchive { key: string; fingerprint: string; observationId: string }
export interface ArchiveTransaction {
  receipt(key: string): Promise<{ fingerprint: string; archivedAt: string } | null>;
  observation(id: string): Promise<{ active: boolean; identityProof: boolean; relationshipReview?:boolean } | null>;
  archive(id: string): Promise<string>;
  invalidate(decisionId: string): Promise<void>;
  insertReceipt(request: ObservationArchive): Promise<void>;
}
export interface ArchiveStore {
  transaction<T>(observationId: string, work: (tx: ArchiveTransaction) => Promise<T>): Promise<T>;
}

/** Explicit user archive, retaining original text/evidence. Future caller authenticates. */
export async function archiveObservation(raw: unknown, store: ArchiveStore) {
  const parsed = schema.parse(raw), observationId = parsed.observationId.toLowerCase();
  const request: ObservationArchive = { key: `observation-archive:${parsed.requestId.toLowerCase()}`,
    observationId, fingerprint: inputFingerprint({ operation: "archive-observation-v1", observation_id: observationId }, {}) };
  return store.transaction(observationId, async (tx) => {
    const replay = await tx.receipt(request.key);
    if (replay) {
      if (replay.fingerprint !== request.fingerprint) throw new Error("ARCHIVE_REQUEST_CONFLICT");
      return { observationId, archivedAt: replay.archivedAt, replayed: true };
    }
    const observation = await tx.observation(observationId);
    if (!observation?.active) throw new Error("ARCHIVE_OBSERVATION_UNAVAILABLE");
    if (observation.identityProof) throw new Error("IDENTITY_REVIEW_REQUIRED");
    if (observation.relationshipReview) throw new Error('RELATIONSHIP_REVIEW_REQUIRED');
    const archivedAt = await tx.archive(observationId);
    await tx.invalidate(request.key);
    await tx.insertReceipt(request);
    return { observationId, archivedAt, replayed: false };
  });
}

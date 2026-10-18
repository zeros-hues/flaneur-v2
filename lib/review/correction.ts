import { z } from "zod";
import { migrationId } from "../migration/identity";
import type { ObservationRejection, ReviewTransaction, ReviewStore } from "./rejection";

const text = z.string().max(20000).refine((value) => value.trim().length > 0 && !value.includes("\0") &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value), "Invalid authored text");
const schema = z.object({ requestId: z.uuid(), observationId: z.uuid(), bodyText: text,
  comment: z.string().max(2000).nullable().optional() }).strict();
export interface ObservationCorrection extends ObservationRejection { replacementId: string; bodyText: string }
export interface CorrectionTransaction extends ReviewTransaction {
  correctionReceipt(id: string): Promise<ObservationCorrection | null>;
  insertReplacement(review: ObservationCorrection): Promise<void>;
  insertCorrectionReview(review: ObservationCorrection): Promise<void>;
}
export interface CorrectionStore extends ReviewStore {
  transaction<T>(observationId: string, work: (tx: CorrectionTransaction) => Promise<T>): Promise<T>;
}

/** Explicit authored correction. Never relabel or overwrite the original assertion. Caller authenticates. */
export async function correctObservation(raw: unknown, store: CorrectionStore) {
  const parsed = schema.parse(raw), requestId = parsed.requestId.toLowerCase();
  const review: ObservationCorrection = { id: migrationId(`observation-correction:${requestId}:review`),
    replacementId: migrationId(`observation-correction:${requestId}:replacement`),
    observationId: parsed.observationId.toLowerCase(), bodyText: parsed.bodyText, comment: parsed.comment ?? null };
  return store.transaction(review.observationId, async (tx) => {
    const replay = await tx.correctionReceipt(review.id);
    if (replay) {
      if (replay.observationId !== review.observationId || replay.bodyText !== review.bodyText ||
          replay.comment !== review.comment || replay.replacementId !== review.replacementId) throw new Error("REVIEW_REQUEST_CONFLICT");
      return { review: replay, replayed: true };
    }
    const observation = await tx.observation(review.observationId);
    if (!observation?.active) throw new Error("REVIEW_OBSERVATION_UNAVAILABLE");
    if (observation.identityProof) throw new Error("IDENTITY_REVIEW_REQUIRED");
    if (observation.relationshipReview) throw new Error('RELATIONSHIP_REVIEW_REQUIRED');
    await tx.insertReplacement(review);
    await tx.insertCorrectionReview(review);
    await tx.invalidate(review);
    return { review, replayed: false };
  });
}

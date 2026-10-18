import { z } from "zod";
import { migrationId } from "../migration/identity";

const schema = z.object({ requestId: z.uuid(), observationId: z.uuid(), comment: z.string().max(2000).nullable().optional() }).strict();
export interface ObservationRejection { id: string; observationId: string; comment: string | null }
export interface ReviewTransaction {
  receipt(id: string): Promise<ObservationRejection | null>;
  observation(id: string): Promise<{ layer: string; active: boolean; identityProof: boolean; relationshipReview?:boolean; bodyText?: string } | null>;
  insertReview(review: ObservationRejection): Promise<void>;
  invalidate(review: ObservationRejection): Promise<void>;
}
export interface ReviewStore {
  transaction<T>(observationId: string, work: (tx: ReviewTransaction) => Promise<T>): Promise<T>;
}
/** Prepared explicit User review. The future caller must authenticate; model output never invokes this. */
export async function rejectObservation(raw: unknown, store: ReviewStore) {
  const parsed = schema.parse(raw);
  const review = { id: migrationId(`observation-rejection:${parsed.requestId.toLowerCase()}`),
    observationId: parsed.observationId.toLowerCase(), comment: parsed.comment ?? null };
  return store.transaction(review.observationId, async (tx) => {
    const replay = await tx.receipt(review.id);
    if (replay) {
      if (replay.observationId !== review.observationId || replay.comment !== review.comment) throw new Error("REVIEW_REQUEST_CONFLICT");
      return { review: replay, replayed: true };
    }
    const observation = await tx.observation(review.observationId);
    if (!observation?.active) throw new Error("REVIEW_OBSERVATION_UNAVAILABLE");
    if (observation.identityProof) throw new Error("IDENTITY_REVIEW_REQUIRED");
    if (observation.relationshipReview) throw new Error('RELATIONSHIP_REVIEW_REQUIRED');
    if (!["source", "extracted", "inferred"].includes(observation.layer)) throw new Error("REVIEW_AUTHORED_TEXT_REQUIRES_REVISION");
    await tx.insertReview(review);
    await tx.invalidate(review);
    return { review, replayed: false };
  });
}

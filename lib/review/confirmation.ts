import { z } from "zod";
import { migrationId } from "../migration/identity";
import type { ObservationCorrection, CorrectionStore, CorrectionTransaction } from "./correction";

const schema = z.object({ requestId: z.uuid(), observationId: z.uuid(),
  comment: z.string().max(2000).nullable().optional() }).strict();
export interface ConfirmationTransaction extends CorrectionTransaction {
  confirmationReceipt(id: string): Promise<ObservationCorrection | null>;
  insertConfirmationReplacement(review: ObservationCorrection): Promise<void>;
  insertConfirmationReview(review: ObservationCorrection): Promise<void>;
}
export interface ConfirmationStore extends CorrectionStore {
  transaction<T>(observationId: string, work: (tx: ConfirmationTransaction) => Promise<T>): Promise<T>;
}

/** Explicit User confirmation. Caller authenticates; text comes from the immutable stored assertion. */
export async function confirmObservation(raw: unknown, store: ConfirmationStore) {
  const parsed = schema.parse(raw), requestId = parsed.requestId.toLowerCase();
  const identity = { id: migrationId(`observation-confirmation:${requestId}:review`),
    replacementId: migrationId(`observation-confirmation:${requestId}:replacement`),
    observationId: parsed.observationId.toLowerCase(), comment: parsed.comment ?? null };
  return store.transaction(identity.observationId, async (tx) => {
    const replay = await tx.confirmationReceipt(identity.id);
    if (replay) {
      if (replay.observationId !== identity.observationId || replay.comment !== identity.comment ||
          replay.replacementId !== identity.replacementId) throw new Error("REVIEW_REQUEST_CONFLICT");
      return { review: replay, replayed: true };
    }
    const observation = await tx.observation(identity.observationId);
    if (!observation?.active) throw new Error("REVIEW_OBSERVATION_UNAVAILABLE");
    if (observation.identityProof) throw new Error("IDENTITY_REVIEW_REQUIRED");
    if (observation.relationshipReview) throw new Error('RELATIONSHIP_REVIEW_REQUIRED');
    if (!["source", "extracted", "inferred"].includes(observation.layer)) throw new Error("REVIEW_AUTHORED_TEXT_REQUIRES_REVISION");
    const bodyText = observation.bodyText;
    if (typeof bodyText !== "string" || !bodyText.trim() || bodyText.length > 20000 || bodyText.includes("\0") ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(bodyText))
      throw new Error("REVIEW_CONFIRMATION_TEXT_UNSUPPORTED");
    const review = { ...identity, bodyText };
    await tx.insertConfirmationReplacement(review);
    await tx.insertConfirmationReview(review);
    await tx.invalidate(review);
    return { review, replayed: false };
  });
}

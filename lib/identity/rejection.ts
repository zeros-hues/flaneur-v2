import { z } from "zod";
import { migrationId } from "../migration/identity";
import { parseFingerprint } from "../processing/parse-input";

const requestSchema = z.object({ requestId: z.uuid(), snapshotId: z.uuid(), observationId: z.uuid(),
  comment: z.string().max(2000).nullable().optional() }).strict();
export interface IdentityRejection { id: string; snapshotId: string; observationId: string; comment: string | null }
export interface RejectionTransaction {
  receipt(id: string): Promise<IdentityRejection | null>;
  activeProofIds(): Promise<string[]>;
  snapshot(): Promise<{ contentHash: string; sourceUrl: string; adapterId: string; kind: "profile_page" | "social_post" } | null>;
  /** Append review and invalidate recorded non-User dependencies of snapshot identities. */
  insertReview(review: IdentityRejection): Promise<void>;
  queueParse(fingerprint: string): Promise<void>;
}
export interface RejectionStore {
  /** All affected object/parse scope locks precede memory graph; review/invalidation/head/job commit or roll back together. */
  transaction<T>(snapshotId: string, work: (tx: RejectionTransaction) => Promise<T>): Promise<T>;
}

/** Prepared explicit User rejection only. Authentication belongs to the future caller. */
export async function rejectProfileIdentity(raw: unknown, store: RejectionStore) {
  const parsed = requestSchema.parse(raw);
  const review: IdentityRejection = { id: migrationId(`identity-rejection:${parsed.requestId.toLowerCase()}`),
    snapshotId: parsed.snapshotId.toLowerCase(), observationId: parsed.observationId.toLowerCase(), comment: parsed.comment ?? null };
  return store.transaction(review.snapshotId, async (tx) => {
    const replay = await tx.receipt(review.id);
    if (replay) {
      if (replay.snapshotId !== review.snapshotId || replay.observationId !== review.observationId || replay.comment !== review.comment)
        throw new Error("IDENTITY_REVIEW_REQUEST_CONFLICT");
      return { review: replay, replayed: true };
    }
    const snapshot = await tx.snapshot();
    if (!snapshot || snapshot.kind !== "profile_page" || snapshot.adapterId !== "linkedin")
      throw new Error("IDENTITY_SNAPSHOT_UNSUPPORTED");
    const active = await tx.activeProofIds();
    if (active.length !== 1 || active[0] !== review.observationId) throw new Error("IDENTITY_REVIEW_STALE_OR_AMBIGUOUS");
    await tx.insertReview(review);
    // Null proof changes the desired head and fences all prior queued/leased parse work atomically.
    await tx.queueParse(parseFingerprint({ ...snapshot, identityObservationId: null }));
    return { review, replayed: false };
  });
}

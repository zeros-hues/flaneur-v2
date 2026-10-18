import { z } from "zod";
import { migrationId } from "../migration/identity";
import { parseFingerprint } from "../processing/parse-input";

const inputSchema = z.object({ requestId: z.uuid(), snapshotId: z.uuid(), personId: z.uuid() }).strict();
export interface Confirmation { requestId: string; snapshotId: string; personId: string }
export interface IdentityProof { id: string; snapshotId: string; personId: string; supersedesId: string | null }
export interface IdentityTransaction {
  confirmation(requestId: string): Promise<IdentityProof | null>;
  snapshot(): Promise<{ contentHash: string; sourceUrl: string; adapterId: string; kind: "profile_page" | "social_post" } | null>;
  canonicalPerson(personId: string): Promise<boolean>;
  currentProof(): Promise<IdentityProof | null>;
  noticedPeople(): Promise<string[]>;
  /** Append proof and invalidate recorded non-User dependencies of earlier snapshot identities. */
  insertProof(proof: IdentityProof, requestId: string, creation?:{name:string}): Promise<void>;
  linkPerson(personId: string): Promise<void>;
  queueParse(fingerprint: string): Promise<void>;
}
export interface IdentityStore {
  /** Locks all affected object/parse scopes before memory graph; proof/link/invalidation/head/job commit together. */
  transaction<T>(snapshotId: string, work: (tx: IdentityTransaction) => Promise<T>): Promise<T>;
}

/** Caller must authenticate an explicit user selection. This is never invoked from model output. */
export async function confirmProfileIdentity(raw: unknown, store: IdentityStore) {
  const parsed = inputSchema.parse(raw);
  const input: Confirmation = { requestId: parsed.requestId.toLowerCase(), snapshotId: parsed.snapshotId.toLowerCase(),
    personId: parsed.personId.toLowerCase() };
  return store.transaction(input.snapshotId, async (tx) => {
    const replay = await tx.confirmation(input.requestId);
    if (replay) {
      if (replay.snapshotId !== input.snapshotId || replay.personId !== input.personId) throw new Error("IDENTITY_REQUEST_CONFLICT");
      // Replaying a historical confirmation never resets the current head or queues older work.
      return { proof: replay, replayed: true };
    }
    const snapshot = await tx.snapshot();
    if (!snapshot || snapshot.kind !== "profile_page" || snapshot.adapterId !== "linkedin") throw new Error("IDENTITY_SNAPSHOT_UNSUPPORTED");
    if (!await tx.canonicalPerson(input.personId)) throw new Error("IDENTITY_PERSON_UNAVAILABLE");
    const prior = await tx.currentProof();
    const linked = await tx.noticedPeople();
    if (linked.some((id) => id !== input.personId) || (prior && prior.personId !== input.personId))
      throw new Error("IDENTITY_REASSIGNMENT_REQUIRES_REVIEW");
    const proof: IdentityProof = { id: migrationId(`identity-confirmation:${input.requestId}`),
      snapshotId: input.snapshotId, personId: input.personId, supersedesId: prior?.id ?? null };
    await tx.insertProof(proof, input.requestId);
    await tx.linkPerson(input.personId);
    await tx.queueParse(parseFingerprint({ ...snapshot, identityObservationId: proof.id }));
    return { proof, replayed: false };
  });
}

/** Suggestions only. Names, URLs and unreviewed source keys never silently merge/resolve people. */
export function identitySuggestions(candidates: { personId: string; exactKey: boolean; verified: boolean; active: boolean }[]) {
  const ids = [...new Set(candidates.filter((candidate) => candidate.exactKey && candidate.verified && candidate.active)
    .map((candidate) => candidate.personId))].sort();
  return { state: ids.length > 1 ? "conflict" as const : ids.length ? "candidate" as const : "unresolved" as const, personIds: ids };
}

import { z } from "zod";
import { inputFingerprint } from "../processing/fingerprint";

const schema = z.object({ requestId: z.uuid(), personId: z.uuid() }).strict();
export interface PersonArchive { key: string; fingerprint: string; personId: string }
export interface PersonArchiveTransaction {
  receipt(key: string): Promise<{ fingerprint: string; archivedAt: string } | null>;
  available(personId: string): Promise<boolean>;
  archive(personId: string): Promise<string>;
  invalidate(decisionId: string): Promise<void>;
  insertReceipt(request: PersonArchive): Promise<void>;
}
export interface PersonArchiveStore {
  transaction<T>(personId: string, work: (tx: PersonArchiveTransaction) => Promise<T>): Promise<T>;
}

/** Explicit User action only. Archive retains original data; future caller authenticates. */
export async function archivePerson(raw: unknown, store: PersonArchiveStore) {
  const parsed = schema.parse(raw), personId = parsed.personId.toLowerCase();
  const request = { key: `person-archive:${parsed.requestId.toLowerCase()}`, personId,
    fingerprint: inputFingerprint({ operation: "archive-person-v1", person_id: personId }, {}) };
  return store.transaction(personId, async (tx) => {
    const receipt = await tx.receipt(request.key);
    if (receipt) {
      if (receipt.fingerprint !== request.fingerprint) throw new Error("ARCHIVE_REQUEST_CONFLICT");
      return { personId, archivedAt: receipt.archivedAt, replayed: true };
    }
    if (!await tx.available(personId)) throw new Error("ARCHIVE_PERSON_UNAVAILABLE");
    const archivedAt = await tx.archive(personId);
    await tx.invalidate(request.key);
    await tx.insertReceipt(request);
    return { personId, archivedAt, replayed: false };
  });
}

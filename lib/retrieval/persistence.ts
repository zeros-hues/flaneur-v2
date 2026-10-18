import { locateText, representation, sameRepresentation, type Representation } from "./representation";

export type TextLocator = ReturnType<typeof locateText>;
export interface EvidenceTransaction {
  findRepresentation(snapshotId: string, version: string): Promise<Representation | null>;
  insertRepresentation(value: Representation): Promise<void>;
  findSupport(id: string): Promise<{ id: string; snapshotId: string | null; excerpt: string | null } | null>;
  findLocator(id: string): Promise<TextLocator | null>;
  insertLocator(value: TextLocator): Promise<void>;
}
export interface EvidenceStore {
  /** Atomic and serialized for the supplied snapshot/version, including concurrent retries. */
  transaction<T>(snapshotId: string, version: string, work: (tx: EvidenceTransaction) => Promise<T>): Promise<T>;
}
export interface EvidenceWrite {
  snapshotId: string; normalizerVersion: string; text: string;
  locators: { evidenceId: string; start: number; end: number; quote: string }[];
}
const sameLocator = (a: TextLocator, b: TextLocator) => a.evidenceId === b.evidenceId &&
  a.representationId === b.representationId && a.start === b.start && a.end === b.end && a.quote === b.quote;

/** Never correct an existing representation/locator by overwriting it. */
export async function persistEvidence(input: EvidenceWrite, store: EvidenceStore) {
  const proposed = representation(input.snapshotId, input.normalizerVersion, input.text);
  const requestedLocators = input.locators.map((item) => ({ ...item, evidenceId: item.evidenceId.toLowerCase() }))
    .sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  if (requestedLocators.some((item) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item.evidenceId)))
    throw new Error("INVALID_TEXT_EVIDENCE");
  return store.transaction(proposed.snapshotId, proposed.normalizerVersion, async (tx) => {
    const existing = await tx.findRepresentation(proposed.snapshotId, proposed.normalizerVersion);
    if (existing && !sameRepresentation(existing, proposed)) throw new Error("REPRESENTATION_CONFLICT");
    if (!existing) await tx.insertRepresentation(proposed);
    const locators: TextLocator[] = [];
    // Stable lock order across different representation versions avoids overlapping locator deadlocks.
    for (const item of requestedLocators) {
      const support = await tx.findSupport(item.evidenceId);
      if (!support) throw new Error("EVIDENCE_NOT_FOUND");
      const locator = locateText(proposed, support, item.start, item.end, item.quote);
      const previous = await tx.findLocator(locator.evidenceId);
      if (previous && !sameLocator(previous, locator)) throw new Error("LOCATOR_CONFLICT");
      if (!previous) await tx.insertLocator(locator);
      locators.push(locator);
    }
    return { representation: proposed, locators };
  });
}

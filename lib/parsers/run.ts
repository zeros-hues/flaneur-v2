import { and, eq, isNull } from "drizzle-orm";
import { note, person, quarantine, snapshot } from "@/db/schema";
import { mergeArtifact } from "@/lib/merge-artifact";
import { mergeProfile, type MergeDiff, type SnapshotRef, type Tx } from "@/lib/merge";
import { CanaryError, markSuspect, suspectState } from "./canary";
import { adapterFor } from "./index";
import type { ParsedArtifact, ParsedProfile, SourceAdapter } from "./types";
import { validateArtifact, validateProfile, type ValidationFailure } from "./validate";

export interface StoredSnapshot extends SnapshotRef {
  sourceUrl: string;
  captureType: "profile" | "post";
}

export type ParseResult =
  | { status: "merged"; diff: MergeDiff }
  | { status: "quarantined"; reason: string }
  | { status: "suspect"; missing: string[]; summary: string };

/** How a canary miss is handled: live captures record it; reparse aborts the whole run. */
export type CanaryMode = "mark" | "throw";

async function quarantineSnapshot(
  tx: Tx,
  snap: StoredSnapshot,
  adapter: SourceAdapter | null,
  failure: ValidationFailure,
): Promise<ParseResult> {
  await tx.insert(quarantine).values({
    snapshotId: snap.id,
    adapterId: adapter?.id ?? "none",
    parserVersion: adapter?.version ?? "none",
    reason: failure.reason,
    details: failure.details,
  });
  console.warn(`[parser] snapshot ${snap.id} quarantined: ${failure.reason}`);
  return { status: "quarantined", reason: failure.reason };
}

const suspectResult = (missing: string[]): ParseResult => ({
  status: "suspect",
  missing,
  summary: `Saved, but the parser looks broken (missing: ${missing.join(", ")}). Nothing was merged.`,
});

/**
 * Parses one stored snapshot and merges it into the graph, all inside `tx`.
 * Validation failures go to quarantine and never reach person/role/organisation/artifact.
 */
export async function processSnapshot(
  tx: Tx,
  snap: StoredSnapshot,
  html: string,
  canaryMode: CanaryMode,
): Promise<ParseResult> {
  const adapter = adapterFor(snap.sourceUrl);
  if (!adapter) return quarantineSnapshot(tx, snap, null, { reason: "no adapter for url", details: { url: snap.sourceUrl } });

  const suspect = await suspectState(tx, adapter);
  if (suspect) return suspectResult(suspect.missing);

  const kind = adapter.classify(snap.sourceUrl, snap.captureType);
  if (kind.kind === "unsupported") return quarantineSnapshot(tx, snap, adapter, { reason: kind.reason, details: {} });

  let parsed: ParsedProfile | ParsedArtifact;
  try {
    parsed = kind.kind === "profile" ? adapter.parseProfile(html, snap.sourceUrl) : adapter.parseArtifact(html, snap.sourceUrl);
  } catch (error) {
    if (error instanceof CanaryError) {
      if (canaryMode === "throw") throw error;
      await markSuspect(tx, adapter, error, snap.id);
      return suspectResult(error.missing);
    }
    const message = error instanceof Error ? error.message : String(error);
    return quarantineSnapshot(tx, snap, adapter, { reason: `parser error: ${message}`, details: {} });
  }
  console.info(`[parser] ${adapter.version} ${snap.id} strategies ${JSON.stringify(parsed.strategies)}`);

  let diff: MergeDiff;
  let sections: string[];
  if ("profileUrl" in parsed) {
    const [known] = await tx.select({ id: person.id }).from(person).where(eq(person.profileUrl, parsed.profileUrl));
    const failure = validateProfile(parsed, { personExists: known !== undefined });
    if (failure) return quarantineSnapshot(tx, snap, adapter, failure);
    diff = await mergeProfile(tx, parsed, snap);
    const present = {
      topcard: parsed.topcard !== null,
      about: parsed.about !== undefined,
      experience: parsed.experience !== undefined,
      education: parsed.education !== undefined,
      skills: parsed.skills !== undefined,
    };
    sections = Object.entries(present).filter(([, has]) => has).map(([name]) => name);
  } else {
    const failure = validateArtifact(parsed);
    if (failure) return quarantineSnapshot(tx, snap, adapter, failure);
    diff = await mergeArtifact(tx, parsed, snap);
    sections = ["post"];
  }

  await tx
    .update(snapshot)
    .set({ parserVersion: adapter.version, sectionsCovered: sections, personId: diff.personId, artifactId: diff.artifactId })
    .where(eq(snapshot.id, snap.id));

  // Attach notes written with this capture to what it resolved to. Note bodies are never touched.
  if (diff.personId) {
    await tx.update(note).set({ personId: diff.personId }).where(and(eq(note.snapshotId, snap.id), isNull(note.personId)));
  }
  if (diff.artifactId) {
    await tx.update(note).set({ artifactId: diff.artifactId }).where(and(eq(note.snapshotId, snap.id), isNull(note.artifactId)));
  }
  return { status: "merged", diff };
}

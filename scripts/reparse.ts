// Re-runs the current parser over every stored snapshot and rebuilds all derived rows.
// One transaction: either the whole graph is rebuilt, or nothing changes.
import { gunzipSync } from "node:zlib";
import { and, asc, count, eq, isNotNull, isNull, or } from "drizzle-orm";
import {
  artifact,
  education,
  headlineHistory,
  note,
  organisation,
  person,
  quarantine,
  role,
  schedule,
  sectionCoverage,
  skill,
  snapshot,
} from "@/db/schema";
import { db } from "@/lib/db";
import { ADAPTERS, adapterFor } from "@/lib/parsers";
import { CanaryError, markSuspect, suspectState } from "@/lib/parsers/canary";
import { processSnapshot, type StoredSnapshot } from "@/lib/parsers/run";

async function preconditions(): Promise<string | null> {
  for (const adapter of ADAPTERS) {
    const suspect = await suspectState(db, adapter);
    if (suspect) {
      return `${adapter.version} is marked suspect (${suspect.reason}). Fix the parser and bump its version first.`;
    }
  }
  // Rebuilding recreates person/artifact ids; only notes tied to a snapshot can be re-linked.
  const [unlinkable] = await db
    .select({ n: count() })
    .from(note)
    .where(and(isNull(note.snapshotId), or(isNotNull(note.personId), isNotNull(note.artifactId))));
  if (unlinkable && unlinkable.n > 0) {
    return `${unlinkable.n} note(s) are attached to a person or post without a snapshot and would lose that link.`;
  }
  return null;
}

async function main(): Promise<void> {
  const blocked = await preconditions();
  if (blocked) {
    console.error(`reparse refused: ${blocked}`);
    process.exitCode = 1;
    return;
  }

  const snaps: StoredSnapshot[] = await db
    .select({ id: snapshot.id, sourceUrl: snapshot.sourceUrl, captureType: snapshot.captureType, capturedAt: snapshot.capturedAt })
    .from(snapshot)
    .orderBy(asc(snapshot.capturedAt), asc(snapshot.id));

  const tally = new Map<string, number>();
  let current: StoredSnapshot | undefined;

  try {
    await db.transaction(async (tx) => {
      // Spaced-repetition state is user data, not derived: carry it across by post URN.
      const kept = await tx
        .select({ urn: artifact.urn, s: schedule })
        .from(schedule)
        .innerJoin(artifact, eq(schedule.artifactId, artifact.id))
        .where(isNotNull(artifact.urn));

      for (const table of [quarantine, headlineHistory, role, sectionCoverage, education, skill, artifact, person, organisation]) {
        await tx.delete(table);
      }

      for (const snap of snaps) {
        current = snap;
        const [row] = await tx.select({ gz: snapshot.contentGzip }).from(snapshot).where(eq(snapshot.id, snap.id));
        if (!row) continue;
        const result = await processSnapshot(tx, snap, gunzipSync(row.gz).toString("utf8"), "throw");
        const key = result.status === "quarantined" ? `quarantined: ${result.reason}` : result.status;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }

      let restored = 0;
      for (const { urn, s } of kept) {
        if (!urn) continue;
        const [a] = await tx.select({ id: artifact.id }).from(artifact).where(eq(artifact.urn, urn));
        if (!a) continue;
        await tx.insert(schedule).values({ ...s, artifactId: a.id });
        restored++;
      }
      if (kept.length) console.log(`schedules restored: ${restored}/${kept.length}`);
    });
  } catch (error) {
    if (error instanceof CanaryError && current) {
      const adapter = adapterFor(current.sourceUrl);
      if (adapter) await markSuspect(db, adapter, error, current.id);
      console.error(`reparse aborted, nothing written: canaries missing on snapshot ${current.id} (${error.missing.join(", ")})`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  console.log(`reparsed ${snaps.length} snapshot(s)`);
  for (const [key, n] of [...tally].sort()) console.log(`  ${n}\t${key}`);
}

try {
  await main();
} finally {
  await db.$client.end();
}

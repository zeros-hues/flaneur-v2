import { and, eq } from "drizzle-orm";
import { parserHealth } from "@/db/schema";
import type { Db } from "@/lib/db";
import type { Doc } from "./dom";
import type { SourceAdapter } from "./types";

export interface Canary {
  name: string;
  /** Any one selector matching counts as present. */
  selectors: string[];
}

/** A page the adapter claims to understand is missing elements every such page must have. */
export class CanaryError extends Error {
  constructor(readonly missing: string[]) {
    super(`canaries missing: ${missing.join(", ")}`);
    this.name = "CanaryError";
  }
}

export function requireCanaries(doc: Doc, canaries: Canary[]): void {
  const missing = canaries
    .filter((c) => !c.selectors.some((s) => doc.querySelector(s) !== null))
    .map((c) => c.name);
  if (missing.length > 0) throw new CanaryError(missing);
}

type Executor = Pick<Db, "select" | "insert">;

export interface SuspectState {
  reason: string | null;
  missing: string[];
  since: Date;
}

/** Suspect state for the adapter's current version. A new parser version starts clean. */
export async function suspectState(
  exec: Executor,
  adapter: SourceAdapter,
): Promise<SuspectState | null> {
  const [row] = await exec
    .select()
    .from(parserHealth)
    .where(
      and(
        eq(parserHealth.adapterId, adapter.id),
        eq(parserHealth.parserVersion, adapter.version),
        eq(parserHealth.suspect, true),
      ),
    );
  return row ? { reason: row.reason, missing: row.missingCanaries, since: row.since } : null;
}

export async function markSuspect(
  exec: Executor,
  adapter: SourceAdapter,
  error: CanaryError,
  snapshotId: string,
): Promise<void> {
  const values = {
    parserVersion: adapter.version,
    suspect: true,
    reason: error.message,
    missingCanaries: error.missing,
    snapshotId,
    since: new Date(),
  };
  await exec
    .insert(parserHealth)
    .values({ adapterId: adapter.id, ...values })
    .onConflictDoUpdate({ target: parserHealth.adapterId, set: values });
  console.error(`[parser] ${adapter.id}@${adapter.version} marked SUSPECT: ${error.message}`);
}

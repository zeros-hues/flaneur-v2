export type Lease = { jobId: string; token: string; inputFingerprint: string; snapshotId: string;
  kind: "parse" | "enrich" | "index"; expiresAt: number };
export type ProcessingOutcome = "succeeded" | "quarantined";
export interface JobStore<Result> {
  claim(now: number, durationMs: number): Promise<Lease | null>;
  renew(lease: Lease, durationMs: number): Promise<boolean>;
  // Validate token, expiry and current input, then apply outputs and complete atomically.
  complete(lease: Lease, result: Result, outcome: ProcessingOutcome, now: number): Promise<boolean>;
  fail(lease: Lease, code: string, now: number): Promise<boolean>;
}

export async function workOne<Result>(store: JobStore<Result>,
  process: (lease: Lease, renew: () => Promise<boolean>) => Promise<{ result: Result; outcome: ProcessingOutcome }>,
  clock: () => number = Date.now, durationMs = 60_000) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("INVALID_LEASE_DURATION");
  const lease = await store.claim(clock(), durationMs);
  if (!lease) return "idle";
  try {
    const processed = await process(lease, () => store.renew(lease, durationMs));
    return await store.complete(lease, processed.result, processed.outcome, clock()) ? processed.outcome : "stale";
  }
  catch { return await store.fail(lease, "PROCESSING_FAILED", clock()) ? "retry_or_failed" : "stale"; }
}

import { createHash } from "node:crypto";

export type MigrationRow = { table: string; key: Record<string, unknown>; values: Record<string, unknown> };
export type MigrationBatch = { key: string; fingerprint: string; rows: MigrationRow[] };
export interface BatchTransaction {
  receipt(key: string): Promise<string | null>;
  ensure(row: MigrationRow): Promise<void>;
  commitReceipt(key: string, fingerprint: string): Promise<void>;
}
export interface BatchStore {
  transaction<T>(work: (tx: BatchTransaction) => Promise<T>): Promise<T>;
}
export function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export function batch(key: string, rows: MigrationRow[]): MigrationBatch {
  return { key, rows, fingerprint: createHash("sha256").update(canonical(rows)).digest("hex") };
}
export async function writeBatch(store: BatchStore, input: MigrationBatch): Promise<"committed" | "already_committed"> {
  if (batch(input.key, input.rows).fingerprint !== input.fingerprint) throw new Error("PHASE1_INVALID_BATCH_HASH");
  return store.transaction(async (tx) => {
    const receipt = await tx.receipt(input.key);
    if (receipt !== null) {
      if (receipt !== input.fingerprint) throw new Error("PHASE1_CHECKPOINT_CONFLICT");
      return "already_committed";
    }
    for (const row of input.rows) await tx.ensure(row);
    await tx.commitReceipt(input.key, input.fingerprint);
    return "committed";
  });
}

import { canonical, type MigrationBatch, type MigrationRow } from "./batch";

// Injected read interface; no connection or side effects. Intended for future target checks.
export async function reconcileBatches(batches: MigrationBatch[], read: (row: MigrationRow) => Promise<Record<string, unknown> | null>) {
  const report = { expected: 0, matched: 0, missing: 0, conflicting: 0 };
  for (const b of batches) {
    for (const row of b.rows) {
      report.expected++;
      const actual = await read(row);
      if (!actual) { report.missing++; continue; }
      const fields = { ...row.values, ...row.key };
      if (Object.entries(fields).some(([key, value]) => canonical(actual[key]) !== canonical(value))) report.conflicting++;
      else report.matched++;
    }
  }
  return report;
}

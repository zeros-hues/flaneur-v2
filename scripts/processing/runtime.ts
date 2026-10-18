import type postgres from "postgres";
import { postgresExtraction } from "../../lib/processing/postgres-extraction";
import { runProcessingBatch,type BatchOptions } from "../../lib/processing/batch";
export { validateBatchOptions } from "../../lib/processing/batch";
export async function runParseBatch(connection:ReturnType<typeof postgres>,options:BatchOptions) {
  const {store,process}=postgresExtraction(connection);
  return runProcessingBatch(store,process,options);
}

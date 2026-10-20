import type postgres from 'postgres';
import { captureActivation } from '../../lib/capture/activation';
import { readExtractionTransaction } from '../../lib/processing/postgres-extraction';
import { extractionProcessor } from '../../lib/processing/extraction';
import { applyExtraction } from '../../lib/processing/apply-extraction';
import { postgresJobs } from '../../lib/processing/postgres-jobs';
import { runProcessingBatch, type BatchOptions } from '../../lib/processing/batch';
import { captureSemanticWorker, scheduleCaptureSemantics, type CaptureProviders } from '../../lib/processing/capture-semantic';

/** Only post-activation V2 request snapshots; never drains the general/historical queue. */
export async function runCaptureCycle(connection: ReturnType<typeof postgres>,
  env: Record<string, string | undefined>, providers: CaptureProviders, options: BatchOptions) {
  const policy = captureActivation(env);
  if (!policy.enabled || !policy.since) throw new Error('CONTROLLED_CAPTURE_NOT_ENABLED');
  const rows = await connection.begin('isolation level repeatable read read only', async sql => {
    await sql`set local statement_timeout='10s'`;
    return sql<{ snapshotId: string; sourceUrl: string }[]>`select snapshot_id as "snapshotId",source_url as "sourceUrl"
      from public.capture_request where received_at>=${policy.since}::timestamptz order by received_at,id limit 1001`;
  });
  if (rows.length > 1000) throw new Error('CONTROLLED_CAPTURE_WINDOW_LIMIT');
  const snapshots = rows.filter(row => policy.accepts(row.sourceUrl)).map(row => row.snapshotId);
  if (!snapshots.length) return { snapshots: 0, parse: null, semantic: null };
  const parse = await runProcessingBatch(postgresJobs(connection, applyExtraction, ['parse'], snapshots),
    extractionProcessor(snapshotId => connection.begin('isolation level repeatable read read only',
      sql => readExtractionTransaction(sql, snapshotId))), options);
  for (const snapshot of snapshots) await connection.begin('isolation level read committed', async sql => {
    await sql`set local statement_timeout='15s'`;
    await sql`set local lock_timeout='5s'`;
    await scheduleCaptureSemantics(sql, snapshot);
  });
  const semantic = captureSemanticWorker(connection, snapshots, providers);
  return { snapshots: snapshots.length, parse,
    semantic: await runProcessingBatch(semantic.store, semantic.process, options) };
}

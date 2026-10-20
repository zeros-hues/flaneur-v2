import type postgres from 'postgres';
export async function readCaptureProgress(tx: postgres.TransactionSql, snapshotId: string) {
  const [request] = await tx`select exists(select 1 from public.snapshot newer
      join public.capture_request next on next.snapshot_id=newer.id
      where newer.artifact_id=source.artifact_id and (next.received_at,newer.id)>(request.received_at,source.id)) as newer
    from public.capture_request request join public.snapshot source on source.id=request.snapshot_id where source.id=${snapshotId}`;
  if (!request) return null;
  const jobs = await tx<{ kind: 'parse' | 'index' | 'enrich'; state: string }[]>`select j.kind,j.state
    from public.processing_job j join public.processing_head h on h.scope_key=j.scope_key and h.input_fingerprint=j.input_fingerprint
    where j.snapshot_id=${snapshotId}`;
  return { newer: request.newer === true, jobs };
}

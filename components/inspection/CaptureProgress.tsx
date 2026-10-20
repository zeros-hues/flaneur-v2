import { sql } from '@/lib/db';
import { captureReadiness } from '@/lib/capture/readiness';
import { readCaptureProgress } from '@/lib/capture/readiness-postgres';

/** Parent source page has already required the owner session. Never exposes provider errors. */
export async function CaptureProgress({ snapshotId }: { snapshotId: string }) {
  try {
    const data = await sql.begin('isolation level repeatable read read only', async tx => {
      await tx`set local statement_timeout='5s'`;
      return readCaptureProgress(tx, snapshotId);
    });
    if (!data) return null;
    return <p className="quiet small" role="status">{data.newer ? 'Saved. A newer capture represents this source.' :
      captureReadiness(Object.fromEntries(data.jobs.map(row => [row.kind, row.state])))}</p>;
  } catch { return <p className="quiet small" role="status">Saved source. Processing status is unavailable.</p>; }
}

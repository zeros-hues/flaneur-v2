import type postgres from "postgres";
import type { CaptureStore } from "./v2-save";
import type { ProcessingState } from "./v2-contract";
import { parseFingerprint } from "../processing/parse-input";
import { captureSourcePlan,SOURCE_RESOLUTION_VERSION } from "./source-plan";
import { resolveCaptureSource } from "./postgres-source";

// Injectable store for the explicitly gated v2 endpoint. Never creates a pool.
export function postgresCaptureStore(connection: ReturnType<typeof postgres>): CaptureStore {
  return { async transaction(requestId, work) {
    const result = await connection.begin("isolation level read committed", async (sql) => {
      await sql`set local statement_timeout = '20s'`;
      await sql`set local lock_timeout = '5s'`;
      await sql`select pg_advisory_xact_lock(hashtextextended(${`capture-v2:${requestId}`}, 0))`;
      const output = await work({
        async findRequest(id) {
          const rows = await sql`select r.payload_hash, r.snapshot_id, r.encounter_id, j.state
            from public.capture_request r join public.processing_job j on j.id = r.job_id where r.id = ${id}`;
          const r = rows[0];
          return r ? { payloadHash: r.payload_hash, snapshotId: r.snapshot_id,
            encounterId: r.encounter_id, processing: r.state as ProcessingState } : null;
        },
        async storeCapture(c) {
          const type = c.body.kind === "profile_page" ? "profile" : "post";
          const plan=captureSourcePlan(c.body,c.snapshotId),sourceUrl=plan.sourceUrl;
          const resolved=await resolveCaptureSource(sql,plan,c.receivedAt);
          const scope = `parse:snapshot:${c.snapshotId}`;
          const fingerprint = parseFingerprint({ contentHash: c.contentHash, sourceUrl,
            kind: c.body.kind, adapterId: c.body.adapterId });
          await sql`insert into public.snapshot (id, artifact_id, capture_type, source_url, content_gzip, content_hash,
            adapter_id, extension_version, parser_version, captured_at)
            values (${c.snapshotId}, ${resolved.artifactId}, ${type}, ${sourceUrl}, ${c.contentGzip}, ${c.contentHash},
              ${c.body.adapterId}, ${c.body.extensionVersion}, 'pending-v2', ${c.body.clientCapturedAt}::text::timestamptz)`;
          await sql`insert into public.encounter (id, kind, occurred_at, recorded_at, snapshot_id, source_context)
            values (${c.encounterId}, 'captured', ${c.body.clientCapturedAt}::text::timestamptz, ${c.receivedAt}, ${c.snapshotId},
              ${sql.json({ source_url: c.body.sourceUrl, adapter_id: c.body.adapterId,
                client_clock_unverified: true, client_captured_at: c.body.clientCapturedAt, request_id: c.body.requestId,
                source_resolution:{version:SOURCE_RESOLUTION_VERSION,basis:plan.basis,state:resolved.state,
                  reason:resolved.reason??plan.reason,artifact_id:resolved.artifactId},recorded_post_urn:c.body.urn })})`;
          if(resolved.artifactId)await sql`insert into public.encounter_object(encounter_id,object_id,relation)
            values(${c.encounterId},${resolved.artifactId},'source')`;
          if (c.reasonId && c.body.reasonForNoticing !== null) {
            await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text,
              recorded_at, support_status, origin_key) values (${c.reasonId}, ${c.encounterId},
              'user', 'reason_for_noticing', ${c.body.reasonForNoticing}, ${c.receivedAt},
              'verified', ${`capture:${c.body.requestId}:user-reason`})`;
          }
          await sql`insert into public.processing_head (scope_key, input_fingerprint)
            values (${scope}, ${fingerprint})`;
          await sql`insert into public.processing_job (id, snapshot_id, kind, scope_key, input_fingerprint)
            values (${c.jobId}, ${c.snapshotId}, 'parse', ${scope}, ${fingerprint})`;
          await sql`insert into public.capture_request (id, adapter_id, source_url, payload_hash, snapshot_id,
            encounter_id, job_id, received_at) values (${c.body.requestId}, ${c.body.adapterId},
              ${c.body.sourceUrl}, ${c.payloadHash}, ${c.snapshotId}, ${c.encounterId}, ${c.jobId}, ${c.receivedAt})`;
        },
      });
      return { output };
    });
    return result.output;
  } };
}

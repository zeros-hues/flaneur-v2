import type postgres from "postgres";
import type { RejectionStore } from "./rejection";
import { enqueueInTransaction } from "../processing/enqueue";
import { withDependencyTransaction, snapshotIdentityRoots, invalidateDependencies } from "../processing/postgres-dependencies";
import {syncReviewedProfile} from '../relationships/profile-store';

/** Prepared only. No route, connection creation, credentials, or automatic invocation. */
export function postgresRejectionStore(connection: ReturnType<typeof postgres>): RejectionStore {
  return { async transaction(snapshotId, work) {
    return withDependencyTransaction(connection, (sql) => snapshotIdentityRoots(sql, snapshotId),
      [`parse:snapshot:${snapshotId}`], async (sql, dependencies) => {
      const result = await work({
        async receipt(id) {
          const rows = await sql`select v.observation_id, v.comment, v.decision,
            o.structured_value->>'identity_for_snapshot' as snapshot_id from public.observation_review v
            join public.observation o on o.id = v.observation_id where v.id = ${id}`;
          const row = rows[0];
          if (row && row.decision !== 'rejected') throw new Error("IDENTITY_REVIEW_REQUEST_CONFLICT");
          return row ? { id, observationId: row.observation_id, snapshotId: row.snapshot_id, comment: row.comment } : null;
        },
        async snapshot() {
          const rows = await sql`select content_hash, source_url, adapter_id, capture_type from public.snapshot where id = ${snapshotId} for share`;
          const row = rows[0];
          return row?.content_hash ? { contentHash: row.content_hash, sourceUrl: row.source_url, adapterId: row.adapter_id,
            kind: row.capture_type === "profile" ? "profile_page" as const : "social_post" as const } : null;
        },
        async activeProofIds() {
          const rows = await sql`select o.id from public.observation o join public.object_ref r on r.id = o.id
            join public.object_ref p on p.id = o.subject_id
            where o.field_key = 'identity_for_snapshot' and o.structured_value->>'identity_for_snapshot' = ${snapshotId}
              and o.support_status = 'verified' and o.truth_layer in ('user','source','extracted')
              and r.archived_at is null and p.archived_at is null and p.kind = 'person'
              and not exists (select 1 from public.object_alias a where a.former_object_id in (o.id, o.subject_id))
              and not exists (select 1 from public.observation_review v where v.observation_id = o.id)
              and not exists (select 1 from public.observation n where n.supersedes_id = o.id) for share of o, r, p`;
          return rows.map((row) => row.id as string);
        },
        async insertReview(review) {
          await sql`insert into public.observation_review (id, observation_id, decision, replacement_observation_id, comment)
            values (${review.id}, ${review.observationId}, 'rejected', null, ${review.comment})`;
          await invalidateDependencies(sql, dependencies, review.id);
        },
        async queueParse(fingerprint) {
          await enqueueInTransaction(sql, { snapshotId, targetId: null, kind: "parse", fingerprint });
          await syncReviewedProfile(sql,snapshotId);
        },
      });
      return result;
    });
  } };
}

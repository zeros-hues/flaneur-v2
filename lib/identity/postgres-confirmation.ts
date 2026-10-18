import type postgres from "postgres";
import type { IdentityProof, IdentityStore } from "./confirmation";
import { enqueueInTransaction } from "../processing/enqueue";
import { withDependencyTransaction, snapshotIdentityRoots, invalidateDependencies } from "../processing/postgres-dependencies";
import { capturedProfileTransaction } from "./captured-profile";
import type { PersonCreationStore, PersonCreationReceipt } from "./creation";
import { sourceNeutralPeople } from "./creation-readiness";
import type { DependencyContext } from "../processing/postgres-dependencies";
import type { PersonCreationTransaction } from "./creation";
import {syncReviewedProfile} from '../relationships/profile-store';

/** Prepared only: requires a supplied connection and explicit user-confirmation caller; no live imports. */
export function postgresIdentityStore(connection: ReturnType<typeof postgres>): PersonCreationStore & IdentityStore {
  return { async transaction(snapshotId, work) {
    return withDependencyTransaction(connection, (sql) => snapshotIdentityRoots(sql, snapshotId),
      [`parse:snapshot:${snapshotId}`], async (sql, dependencies) => {
      return work(identityTransaction(sql,dependencies,snapshotId));
    });
  } };
}
/** Caller already owns processing scopes and the memory graph lock. Never begins a nested transaction. */
export function identityTransaction(sql:postgres.TransactionSql,dependencies:DependencyContext,snapshotId:string):PersonCreationTransaction{
 return {
        async confirmation(requestId) {
          const rows = await sql`select id, subject_id, supersedes_id, structured_value->>'identity_for_snapshot' as snapshot_id,
            structured_value ? 'person_creation_name' or structured_value ? 'identity_reassignment' as creation
            from public.observation where origin_key = ${`identity-confirmation:${requestId}`}`;
          const row = rows[0];
          if(row?.creation)throw new Error('IDENTITY_REQUEST_CONFLICT');
          return row ? { id: row.id, snapshotId: row.snapshot_id, personId: row.subject_id, supersedesId: row.supersedes_id } : null;
        },
        async snapshot() {
          const capture=await capturedProfileTransaction(sql,snapshotId);
          if(!capture?.available)throw new Error("IDENTITY_CAPTURE_UNAVAILABLE");
          const rows = await sql`select content_hash, source_url, adapter_id, capture_type from public.snapshot where id = ${snapshotId} for share`;
          const row = rows[0];
          return row?.content_hash ? { contentHash: row.content_hash, sourceUrl: row.source_url, adapterId: row.adapter_id,
            kind: row.capture_type === "profile" ? "profile_page" as const : "social_post" as const } : null;
        },
        async canonicalPerson(id) {
          const rows = await sql`select id from public.object_ref r where id = ${id} and kind = 'person' and archived_at is null
            and not exists (select 1 from public.object_alias a where a.former_object_id = r.id) for share of r`;
          return rows.length === 1;
        },
        async currentProof() {
          const rows = await sql`select o.id, o.subject_id, o.supersedes_id from public.observation o
            join public.object_ref r on r.id = o.id join public.object_ref p on p.id = o.subject_id
            where o.structured_value->>'identity_for_snapshot' = ${snapshotId} and o.field_key = 'identity_for_snapshot'
            and o.support_status = 'verified' and o.truth_layer in ('user','source','extracted') and r.archived_at is null
            and p.archived_at is null and p.kind = 'person'
            and not exists (select 1 from public.object_alias a where a.former_object_id in (o.id, o.subject_id))
            and not exists (select 1 from public.observation_review v where v.observation_id = o.id)
            and not exists (select 1 from public.observation n where n.supersedes_id = o.id) for share of o, r`;
          if (rows.length > 1) throw new Error("IDENTITY_PROOF_CONFLICT");
          const row = rows[0];
          return row ? { id: row.id, snapshotId, personId: row.subject_id, supersedesId: row.supersedes_id } : null;
        },
        async noticedPeople() {
          const rows = await sql`select distinct x.object_id from public.encounter_object x
            join public.encounter e on e.id = x.encounter_id join public.object_ref r on r.id = x.object_id
            where e.snapshot_id = ${snapshotId} and x.relation = 'noticed' and r.kind = 'person'`;
          return rows.map((row) => row.object_id as string);
        },
        async creationReceipt(requestId):Promise<PersonCreationReceipt|null>{
          const [row]=await sql`select id,subject_id,supersedes_id,structured_value from public.observation
            where origin_key=${`identity-confirmation:${requestId}`}`;
          if(!row)return null;
          if(typeof row.structured_value.person_creation_name!=='string')throw new Error('IDENTITY_REQUEST_CONFLICT');
          return {proof:{id:row.id,personId:row.subject_id,snapshotId:row.structured_value.identity_for_snapshot,
            supersedesId:row.supersedes_id},name:row.structured_value.person_creation_name};
        },
        sourceNeutralPeople:()=>sourceNeutralPeople(sql),
        async createPerson(id,name){
          await sql`insert into public.person(id,name,profile_url,first_captured_at)
            select ${id},${name},null,coalesce(request.received_at,e.recorded_at)
            from public.encounter e left join public.capture_request request on request.encounter_id=e.id
            where e.snapshot_id=${snapshotId} and e.kind='captured'`;
        },
        async insertProof(proof: IdentityProof, requestId, creation) {
          await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, structured_value,
            field_key, support_status, origin_key, supersedes_id) values (${proof.id}, ${proof.personId}, 'user', 'fact',
              ${creation?`Created ${creation.name} and confirmed this captured profile belongs to them.`:'Confirmed this captured profile belongs to the selected person.'},
              ${sql.json({ identity_for_snapshot: snapshotId, confirmation_request_id: requestId,
                ...(creation?{person_creation_name:creation.name}:{}) })},
              'identity_for_snapshot', 'verified', ${`identity-confirmation:${requestId}`}, ${proof.supersedesId})`;
          await invalidateDependencies(sql, dependencies, proof.id);
        },
        async linkPerson(personId) {
          const encounters = await sql`select id from public.encounter where snapshot_id = ${snapshotId} and kind = 'captured' for update`;
          if (encounters.length !== 1) throw new Error("IDENTITY_ENCOUNTER_UNAVAILABLE");
          await sql`insert into public.encounter_object (encounter_id, object_id, relation)
            values (${encounters[0]!.id}, ${personId}, 'noticed') on conflict do nothing`;
        },
        async queueParse(fingerprint) {
          await enqueueInTransaction(sql, { snapshotId, targetId: null, kind: "parse", fingerprint });
          await syncReviewedProfile(sql,snapshotId);
        },
 };
}

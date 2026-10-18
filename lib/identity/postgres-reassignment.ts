import type postgres from 'postgres';
import {migrationId} from '../migration/identity';
import {withDependencyTransaction,snapshotIdentityRoots,invalidateDependencies} from '../processing/postgres-dependencies';
import {identityTransaction} from './postgres-confirmation';
import {reassignmentInput,type IdentityReassignmentStore} from './reassignment';

export function postgresIdentityReassignmentStore(connection:ReturnType<typeof postgres>):IdentityReassignmentStore{
 return {transaction(snapshotId,people,work){
  return withDependencyTransaction(connection,sql=>snapshotIdentityRoots(sql,snapshotId),
   [`parse:snapshot:${snapshotId}`,...people.flatMap(id=>[`enrich:object:${id}`,`index:object:${id}`])],async(sql,dependencies)=>work({
    ...identityTransaction(sql,dependencies,snapshotId),
    async receipt(requestId){
     const [row]=await sql`select id,subject_id,supersedes_id,structured_value from public.observation
       where origin_key=${`identity-confirmation:${requestId}`}`;
     if(!row)return null;
     const parsed=reassignmentInput.safeParse(row.structured_value.identity_reassignment);
     if(!parsed.success)throw new Error('IDENTITY_REQUEST_CONFLICT');
     return {proof:{id:row.id,personId:row.subject_id,snapshotId:row.structured_value.identity_for_snapshot,supersedesId:row.supersedes_id},decision:parsed.data};
    },
    async insertReassignment(proof,decision){
     await sql`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,field_key,support_status,origin_key)
      values(${proof.id},${proof.personId},'user','fact','Reviewed reassignment of this captured profile to the selected person.',
       ${sql.json({identity_for_snapshot:snapshotId,confirmation_request_id:decision.requestId,identity_reassignment:decision})},
       'identity_for_snapshot','verified',${`identity-confirmation:${decision.requestId}`})`;
     await sql`insert into public.observation_review(id,observation_id,decision,replacement_observation_id,comment)
      values(${migrationId(`identity-reassignment-review:${decision.requestId}`)},${decision.fromObservationId},'rejected',null,${decision.reason})`;
     await invalidateDependencies(sql,dependencies,proof.id);
    },
    async replacePersonLink(fromPersonId,personId){
     const [encounter]=await sql`select id from public.encounter where snapshot_id=${snapshotId} and kind='captured' for update`;
     if(!encounter)throw new Error('IDENTITY_ENCOUNTER_UNAVAILABLE');
     const removed=await sql`delete from public.encounter_object where encounter_id=${encounter.id} and object_id=${fromPersonId} and relation='noticed' returning object_id`;
     if(removed.length!==1)throw new Error('IDENTITY_REVIEW_STALE_OR_AMBIGUOUS');
     await sql`insert into public.encounter_object(encounter_id,object_id,relation)values(${encounter.id},${personId},'noticed')`;
    },
   }));
 }};
}

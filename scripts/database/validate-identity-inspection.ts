import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { inspectIdentitiesTransaction, postgresIdentityInspectionReader } from "../../lib/identity/postgres-inspection";
import { confirmProfileIdentity } from "../../lib/identity/confirmation";
import { rejectProfileIdentity } from "../../lib/identity/rejection";
import { postgresIdentityStore } from "../../lib/identity/postgres-confirmation";
import { postgresRejectionStore } from "../../lib/identity/postgres-rejection";
import { markValidationStage } from "./validation-stage";

export async function validateIdentityInspection(connection: Connection) {
  markValidationStage("captured_identity_inspection"); let checks=0;
  assert.equal(await postgresIdentityInspectionReader(connection)(randomUUID()),null); checks++;
  const rollback=new Error("IDENTITY_INSPECTION_FIXTURE_ROLLBACK");
  try {
    await connection.begin("isolation level read committed",async sql=>{
      await sql`set local statement_timeout = '20s'`;
      const person=randomUUID(),other=randomUUID(),snapshot=randomUUID(),legacy=randomUUID(),encounter=randomUUID();
      for(const id of [person,other]) await sql`insert into public.person(id,profile_url,name)
        values(${id},${`https://www.linkedin.com/in/identity-inspection-${id}/`},'Identity inspection fixture')`;
      const content='Identity inspection fixture';
      await sql`insert into public.snapshot(id,capture_type,source_url,content_gzip,content_hash,adapter_id,parser_version)
        values(${snapshot},'profile','https://www.linkedin.com/in/identity-inspection-fixture/',${gzipSync(content)},
          ${createHash('sha256').update(content).digest('hex')},'linkedin','fixture'),
        (${legacy},'profile','javascript:invalid',${gzipSync(content)},null,null,'fixture')`;
      await sql`insert into public.encounter(id,kind,occurred_at,snapshot_id)
        values(${encounter},'captured',now(),${snapshot}),(${randomUUID()},'captured',now(),${legacy})`;
      await sql`insert into public.encounter_object(encounter_id,object_id,relation)
        select id,${person},'noticed' from public.encounter where snapshot_id in (${snapshot},${legacy})`;
      const read=async()=> (await inspectIdentitiesTransaction(sql,person)).page!;
      const initial=await read(), unresolved=initial.captures.find(row=>row.snapshotId===snapshot)!;
      assert.equal(initial.captures.length,2); assert.equal(unresolved.state,'unresolved'); checks+=2;
      assert.deepEqual(unresolved.actions,{confirm:true,reject:false}); checks++;
      const old=initial.captures.find(row=>row.snapshotId===legacy)!;
      assert.equal(old.state,'unsupported'); assert.equal(old.sourceUrl,null); checks+=2;
      const target=fixtureConnection(sql),confirmations=postgresIdentityStore(target),rejections=postgresRejectionStore(target);
      const request={requestId:randomUUID(),snapshotId:snapshot,personId:person};
      const confirmed=await confirmProfileIdentity(request,confirmations);
      const current=(await read()).captures.find(row=>row.snapshotId===snapshot)!;
      assert.equal(current.proof!.id,confirmed.proof.id); assert.equal(current.proof!.layer,'user'); checks+=2;
      assert.equal(current.actions.reject,true); checks++;
      await rejectProfileIdentity({requestId:randomUUID(),snapshotId:snapshot,observationId:confirmed.proof.id},rejections);
      assert.equal((await read()).captures.find(row=>row.snapshotId===snapshot)!.state,'unresolved'); checks++;
      await confirmProfileIdentity(request,confirmations);
      assert.equal((await read()).captures.find(row=>row.snapshotId===snapshot)!.proof,null); checks++;
      await confirmProfileIdentity({...request,requestId:randomUUID()},confirmations);
      await sql`insert into public.encounter_object(encounter_id,object_id,relation) values(${encounter},${other},'noticed')`;
      const conflict=(await read()).captures.find(row=>row.snapshotId===snapshot)!;
      assert.equal(conflict.state,'conflict'); assert.equal(conflict.actions.confirm,false); assert.equal(conflict.actions.reject,true); checks+=3;
      await sql`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,field_key,support_status)
        values(${randomUUID()},${other},'user','fact','Conflicting fixture identity',
          jsonb_build_object('identity_for_snapshot',${snapshot}::text),'identity_for_snapshot','verified')`;
      const ambiguous=(await read()).captures.find(row=>row.snapshotId===snapshot)!;
      assert.equal(ambiguous.proof,null); assert.equal(ambiguous.actions.reject,false); checks+=2;
      const second=(await inspectIdentitiesTransaction(sql,person,initial.captures[0]!.snapshotId)).page!;
      assert.equal(second.captures.length,1); assert.equal(second.captures[0]!.snapshotId,initial.captures[1]!.snapshotId); checks+=2;
      await sql`update public.object_ref set archived_at=now() where id=${person}`;
      assert.equal((await read()).captures.every(row=>!row.actions.confirm && !row.actions.reject),true); checks++;
      throw rollback;
    });
  }catch(error){if(error!==rollback)throw error;}
  return checks;
}

import assert from "node:assert/strict";
import { createHash,randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fixtureConnection,type Connection } from "./fixture-connection";
import { memoryQuery } from "../../lib/query/memory";
import { memoryLabelsInTransaction } from "../../lib/query/postgres-labels";
import { readRetrievalTransaction,postgresRetrievalReader } from "../../lib/retrieval/postgres-reader";
import { createUserNote } from "../../lib/notes/authoring";
import { postgresUserNoteStore } from "../../lib/notes/postgres-authoring";
import { correctObservation } from "../../lib/review/correction";
import { postgresReviewStore } from "../../lib/review/postgres-rejection";
import { archivePerson } from "../../lib/review/person-archive";
import { postgresPersonArchiveStore } from "../../lib/review/postgres-person-archive";
import { markValidationStage } from "./validation-stage";
export async function validateMemoryQuery(connection:Connection){
  markValidationStage("live_memory_query");let checks=0;
  const read=await postgresRetrievalReader(connection).read({mode:"recall",objectKinds:["person"],terms:[randomUUID()],constraints:[]});
  assert.equal(Array.isArray(read),false);checks++;
  const rollback=new Error("MEMORY_QUERY_FIXTURE_ROLLBACK");
  try{await connection.begin("isolation level read committed",async sql=>{
    await sql`set local statement_timeout = '20s'`;
    const person=randomUUID(),other=randomUUID(),snapshot=randomUUID(),source=randomUUID(),school=randomUUID(),representation=randomUUID(),evidence=randomUUID();
    const token=`recallfixture${randomUUID().replaceAll('-','')}`,legacyToken=`legacyfixture${randomUUID().replaceAll('-','')}`,legacyId=randomUUID();
    for(const id of [person,other])await sql`insert into public.person(id,profile_url,name)values(${id},${`https://www.linkedin.com/in/recall-${id}/`},'Memory query fixture')`;
    await sql`insert into public.snapshot(id,capture_type,source_url,content_gzip,parser_version)
      values(${snapshot},'profile','https://example.test/memory-query-source',${gzipSync('EPFL')},'fixture')`;
    await sql`insert into public.snapshot_representation(id,snapshot_id,normalizer_version,text,text_hash)
      values(${representation},${snapshot},'memory-fixture','EPFL',${createHash('sha256').update('EPFL').digest('hex')})`;
    await sql`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status)
      values(${source},${person},'source','fact','EPFL','verified')`;
    await sql`insert into public.observation_evidence(id,observation_id,snapshot_id,excerpt,support_role,evidence_version)
      values(${evidence},${source},${snapshot},'EPFL','supports','fixture')`;
    await sql`insert into public.text_evidence(evidence_id,representation_id,start_codepoint,end_codepoint,quote)values(${evidence},${representation},0,4,'EPFL')`;
    await sql`insert into public.education(id,person_id,school,sort_index)values(${school},${person},'EPFL',0)`;
    await sql`insert into public.education_observation(education_id,observation_id,field_key)values(${school},${source},'school')`;
    await sql`insert into public.note(id,person_id,body)values(${legacyId},${other},${`  ${legacyToken} retained User words  `})`;
    const target=fixtureConnection(sql),note=await createUserNote({requestId:randomUUID(),personId:person,body:`  ${token} User words  `},postgresUserNoteStore(target));
    const run=async(term:string,constraints:{field:string;value:string}[]=[])=>memoryQuery(term,'2026-10-13T00:00:00Z',{
      planner:{plan:async()=>JSON.stringify({mode:'recall',objectKinds:['person'],terms:[term],constraints,encounteredBetween:null,ambiguities:[],interpretation:'Synthetic recall'})},
      reader:{read:async request=>(await readRetrievalTransaction(sql,request)).output},labels:ids=>memoryLabelsInTransaction(sql,ids),
    });
    const result=await run(token,[{field:'school',value:'EPFL'}]);
    assert.equal(result.state,'matches');assert.equal(result.items.length,1);assert.equal(result.items[0]!.id,person);checks+=3;
    assert.equal(result.items[0]!.uncertain,false);checks++;
    assert.ok(result.items[0]!.evidence.some(item=>item.provenance?.observationId===note.note.id&&item.layer==='user'));checks++;
    assert.ok(result.items[0]!.evidence.some(item=>item.provenance?.sourceUrl==='https://example.test/memory-query-source'&&item.verified));checks++;
    const prior=await run(legacyToken);assert.equal(prior.items[0]!.id,other);
    assert.equal(prior.items[0]!.evidence[0]!.provenance!.legacyNoteId,legacyId);checks+=2;
    // A legacy snapshot note must not fall back to its Person after its Encounter is archived.
    const encounter=randomUUID(),contextNote=randomUUID(),contextToken=`contextfixture${randomUUID().replaceAll('-','')}`;
    await sql`insert into public.object_ref(id,kind)values(${encounter},'encounter')`;
    await sql`insert into public.encounter(id,kind,occurred_at,snapshot_id)values(${encounter},'captured',now(),${snapshot})`;
    await sql`insert into public.encounter_object(encounter_id,object_id,relation)values(${encounter},${person},'noticed')`;
    await sql`insert into public.note(id,person_id,snapshot_id,body)values(${contextNote},${person},${snapshot},${contextToken})`;
    assert.equal((await run(contextToken)).items[0]!.id,person);checks++;
    await sql`update public.object_ref set archived_at=now() where id=${encounter}`;
    assert.equal((await run(contextToken)).items.length,0);checks++;
    await correctObservation({requestId:randomUUID(),observationId:note.note.id,bodyText:'New revision words'},postgresReviewStore(target));
    assert.equal((await run(token)).items.length,0);checks++;
    await archivePerson({requestId:randomUUID(),personId:other},postgresPersonArchiveStore(target));
    assert.equal((await run(legacyToken)).items.length,0);checks++;
    const [retained]=await sql`select body from public.note where id=${legacyId}`;
    assert.equal(retained!.body,`  ${legacyToken} retained User words  `);checks++;
    throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
  return checks;
}

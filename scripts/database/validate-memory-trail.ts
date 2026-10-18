import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readTrailTransaction,trailReader } from "../../lib/trail/postgres";
import type { Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";

export async function validateMemoryTrail(connection:Connection) {
  markValidationStage("person_concept_trail");let checks=0;
  assert.equal(await trailReader(connection)("concept",randomUUID()),null);checks++;
  const rollback=new Error("MEMORY_TRAIL_ROLLBACK");
  try{await connection.begin("isolation level read committed",async tx=>{
    await tx`set local statement_timeout = '20s'`;
    const person=randomUUID(),concept=randomUUID(),inferred=randomUUID(),artifact=randomUUID(),observation=randomUUID();
    await tx`insert into public.person(id,profile_url,name)values(${person},${`https://example.test/person/${person}`},'Trail Person')`;
    await tx`insert into public.concept(id,label,kind,document_frequency)values(${concept},'Trail Idea','topic',999999),(${inferred},'Inferred Idea','topic',999999)`;
    await tx`insert into public.artifact(id,type,source_url,person_id,body_text,captured_at)values(${artifact},'article','https://example.test/article',${person},'<script>😀 source</script>','2026-01-01T00:00:00.123456Z')`;
    await tx`insert into public.concept_link(concept_id,artifact_id,source)values(${concept},${artifact},'hashtag'),(${inferred},${artifact},'inferred')`;
    await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status)
      values(${observation},${concept},'user','note','  My exact idea 😀  ','verified')`;
    const encounters:string[]=[];
    for(let i=0;i<22;i++) {
      const encounter=randomUUID();encounters.push(encounter);
      await tx`insert into public.object_ref(id,kind)values(${encounter},'encounter')`;
      await tx`insert into public.encounter(id,kind,occurred_at,explicit_context_text)
        values(${encounter},'captured',${`2026-01-${String(i+1).padStart(2,'0')}T00:00:00.123456Z`}::text::timestamptz,${i===21?'  exact context 😀  ':null})`;
      await tx`insert into public.encounter_object(encounter_id,object_id,relation)values(${encounter},${person},'noticed'),(${encounter},${artifact},'source')`;
    }
    const first=(await readTrailTransaction(tx,"person",person))!;
    markValidationStage("trail_person_chronology");
    assert.equal(first.encounters.length,20);checks++;
    markValidationStage("trail_person_latest_id");assert.equal(first.encounters[0]!.id,encounters[21]);checks++;
    markValidationStage("trail_person_exact_context");assert.equal(first.encounters[0]!.context,'  exact context 😀  ');checks++;
    markValidationStage("trail_person_exact_timestamp");assert.equal(first.encounters[0]!.occurredAt,'2026-01-22T00:00:00.123456Z');checks++;
    const older=(await readTrailTransaction(tx,"person",person,{encounters:first.nextEncounter!}))!;
    markValidationStage("trail_person_pagination");
    assert.deepEqual(older.encounters.map(e=>e.id),[encounters[1],encounters[0]]);assert.equal(older.nextEncounter,null);checks+=2;
    assert.equal(first.artifacts[0]!.association,'legacy_person');assert.equal(first.artifacts[0]!.capturedAt,'2026-01-01T00:00:00.123456Z');checks+=2;
    const ideas=(await readTrailTransaction(tx,"concept",concept))!;
    markValidationStage("trail_concept_provenance");
    assert.equal(ideas.artifacts[0]!.association,'hashtag');assert.equal(ideas.encounters[0]!.direct,false);checks+=2;
    assert.equal(ideas.encounters[0]!.links.find(link=>link.id===person)!.relation,'noticed');checks++;
    assert.equal(ideas.observationPage!.observations[0]!.bodyText,'  My exact idea 😀  ');checks++;
    assert.equal((await readTrailTransaction(tx,"concept",inferred))!.artifacts[0]!.association,'inferred');checks++;
    assert.equal(await readTrailTransaction(tx,"concept",person),null);checks++;
    await tx`insert into public.encounter_object(encounter_id,object_id,relation)values(${encounters[20]!},${concept},'related')`;
    assert.equal((await readTrailTransaction(tx,"concept",concept))!.encounters[1]!.direct,true);checks++;
    await tx`update public.object_ref set archived_at=now() where id=${person}`;
    markValidationStage("trail_archived_person_independence");
    const independent=(await readTrailTransaction(tx,"concept",concept))!;
    assert.equal(independent.artifacts.length,1);assert.equal(independent.encounters[0]!.links.some(link=>link.id===person),false);checks+=2;
    assert.equal((await readTrailTransaction(tx,"person",person))!.archived,true);checks++;
    await tx`update public.object_ref set archived_at=now() where id=${encounters[21]!}`;
    markValidationStage("trail_archived_encounter");
    assert.equal((await readTrailTransaction(tx,"person",person))!.encounters[0]!.id,encounters[20]);checks++;
    await tx`update public.object_ref set archived_at=now() where id=${artifact}`;
    markValidationStage("trail_archived_artifact");
    const hidden=(await readTrailTransaction(tx,"concept",concept))!;
    assert.equal(hidden.artifacts.length,0);assert.equal(hidden.encounters.length,1);checks+=2;
    assert.equal(hidden.encounters[0]!.direct,true);checks++;
    markValidationStage("trail_artifact_pagination_and_aliases");
    const added:string[]=[];
    for(let i=0;i<22;i++) {
      const item=randomUUID();added.push(item);
      await tx`insert into public.artifact(id,type,source_url,body_text,captured_at)
        values(${item},'project','https://example.test/project','Saved project','2026-02-01T00:00:00.123456Z')`;
      await tx`insert into public.concept_link(concept_id,artifact_id,source)values(${concept},${item},'inferred')`;
    }
    const artifacts=(await readTrailTransaction(tx,"concept",concept))!;
    const rest=(await readTrailTransaction(tx,"concept",concept,{artifacts:artifacts.nextArtifact!}))!;
    assert.equal(artifacts.artifacts.length,20);assert.equal(rest.artifacts.length,2);checks+=2;
    assert.deepEqual([...artifacts.artifacts,...rest.artifacts].map(item=>item.id),added.sort().reverse());checks++;
    assert.equal(rest.nextArtifact,null);checks++;
    const former=randomUUID();
    await tx`insert into public.concept(id,label,kind)values(${former},'Former idea','topic')`;
    await tx`insert into public.object_alias(former_object_id,canonical_object_id,decision_observation_id)values(${former},${concept},${observation})`;
    assert.equal(await readTrailTransaction(tx,"concept",former),null);checks++;
    await tx`update public.object_ref set archived_at=now() where id=${concept}`;
    assert.equal((await readTrailTransaction(tx,"concept",concept))!.archived,true);checks++;
    await tx`set constraints all immediate`;checks++;
    throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
  return checks;
}

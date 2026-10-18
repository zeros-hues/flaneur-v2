import assert from "node:assert/strict";
import { createHash,randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { memoryInspectionReader,inspectMemoryTransaction,inspectSnapshotTransaction,snapshotBytesTransaction } from "../../lib/inspection/postgres";
import type { Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";
export async function validateMemoryInspection(connection:Connection){
 markValidationStage("artifact_encounter_inspection");let checks=0;const reader=memoryInspectionReader(connection);
 assert.equal(await reader.detail("artifact",randomUUID()),null);assert.equal(await reader.snapshot(randomUUID()),null);checks+=2;
 const rollback=new Error("MEMORY_INSPECTION_ROLLBACK");
 try{await connection.begin("isolation level read committed",async tx=>{
  await tx`set local statement_timeout = '20s'`;
  const artifact=randomUUID(),person=randomUUID(),snapshot=randomUUID(),encounter=randomUUID(),observation=randomUUID(),representation=randomUUID(),evidence=randomUUID();
  const body="<script>window.fixture=true</script>😀\n"+"尾".repeat(10000),bytes=gzipSync(body);
  await tx`insert into public.person(id,profile_url,name)values(${person},${`https://www.linkedin.com/in/inspection-${person}/`},'Recorded Person')`;
  await tx`insert into public.artifact(id,type,source_url,body_text)values(${artifact},'article','https://example.test/article',${body})`;
  await tx`insert into public.snapshot(id,artifact_id,capture_type,source_url,content_gzip,parser_version)
   values(${snapshot},${artifact},'post','https://example.test/article',${bytes},'fixture')`;
  await tx`insert into public.object_ref(id,kind)values(${encounter},'encounter')`;
  await tx`insert into public.encounter(id,kind,occurred_at,snapshot_id,explicit_context_text,source_context)
   values(${encounter},'captured','2026-10-13T00:00:00.123456Z',${snapshot},'  Exact User context 😀  ','{"large":900719925474099312345}'::jsonb)`;
  await tx`insert into public.encounter_object(encounter_id,object_id,relation)values(${encounter},${artifact},'source'),(${encounter},${person},'noticed')`;
  await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status)values(${observation},${artifact},'source','fact','😀','verified')`;
  await tx`insert into public.snapshot_representation(id,snapshot_id,normalizer_version,text,text_hash)
   values(${representation},${snapshot},'fixture','a😀z',${createHash('sha256').update('a😀z').digest('hex')})`;
  await tx`insert into public.observation_evidence(id,observation_id,snapshot_id,excerpt,support_role,evidence_version)
   values(${evidence},${observation},${snapshot},'😀','supports','fixture')`;
  await tx`insert into public.text_evidence(evidence_id,representation_id,start_codepoint,end_codepoint,quote)values(${evidence},${representation},1,2,'😀')`;
  markValidationStage("artifact_inspection_read");
  const first=(await inspectMemoryTransaction(tx,'artifact',artifact)).detail!;
  assert.equal(first.kind,'artifact');assert.equal(first.sources[0]!.id,snapshot);assert.equal(first.encounters[0]!.id,encounter);checks+=3;
  const next=(await inspectMemoryTransaction(tx,'artifact',artifact,{offset:String(first.artifact!.nextOffset)})).detail!;
  assert.equal(first.artifact!.text!+next.artifact!.text!,body);checks++;
  assert.equal(first.observations[0]!.evidence[0]!.quoteVerified,true);checks++;
  markValidationStage("encounter_inspection_read");
  const encountered=(await inspectMemoryTransaction(tx,'encounter',encounter)).detail!;
  assert.equal(encountered.encounter!.contextText,'  Exact User context 😀  ');assert.ok(encountered.encounter!.sourceContext!.includes('900719925474099312345'));checks+=2;
  assert.equal(encountered.sources[0]!.id,snapshot);assert.equal(encountered.links.length,2);checks+=2;
  assert.equal(encountered.encounter!.occurredAt,'2026-10-13T00:00:00.123456Z');checks++;
  markValidationStage("snapshot_inspection_read");
  const captured=(await inspectSnapshotTransaction(tx,snapshot)).snapshot!;
  const capturedNext=(await inspectSnapshotTransaction(tx,snapshot,String(captured.nextOffset))).snapshot!;
  assert.equal(captured.text!+capturedNext.text!,body);checks++;
  assert.equal(captured.encounterId,encounter);assert.equal(captured.artifactId,artifact);checks+=2;
  assert.equal((await inspectSnapshotTransaction(tx,snapshot,'0',representation)).snapshot!.text,'a😀z');checks++;
  assert.deepEqual(await snapshotBytesTransaction(tx,snapshot),bytes);checks++;
  await assert.rejects(inspectSnapshotTransaction(tx,snapshot,'0',randomUUID()),/REPRESENTATION_INVALID/);checks++;
  await tx`update public.object_ref set archived_at=now() where id in (${artifact},${encounter})`;
  assert.equal((await inspectMemoryTransaction(tx,'artifact',artifact)).detail!.archived,true);
  assert.equal((await inspectMemoryTransaction(tx,'encounter',encounter)).detail!.archived,true);checks+=2;
  assert.equal((await inspectMemoryTransaction(tx,'encounter',artifact)).detail,null);checks++;
  await tx`set constraints all immediate`;checks++;
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 return checks;
}

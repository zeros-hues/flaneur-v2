import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { captureV2Handler } from "../../lib/capture/v2-handler";
import { postgresCaptureStore } from "../../lib/capture/v2-postgres";
import type { CaptureAcknowledgment,CaptureV2 } from "../../lib/capture/v2-contract";
import type { CaptureStore } from "../../lib/capture/v2-save";
import { extractionProcessor } from "../../lib/processing/extraction";
import { readExtractionTransaction } from "../../lib/processing/postgres-extraction";
import { postgresJobs } from "../../lib/processing/postgres-jobs";
import { applyExtraction } from "../../lib/processing/apply-extraction";
import { runProcessingBatch } from "../../lib/processing/batch";
import { sendV2 } from "../../extension/lib/v2-delivery";
import { drain,type OutboxItem } from "../../extension/lib/outbox";
import { fixtureConnection,type Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";

export async function validateCaptureRuntime(connection:Connection) {
  markValidationStage("capture_runtime_idle_queue");let checks=0;
  const rollback=new Error("CAPTURE_RUNTIME_ROLLBACK");
  try{await connection.begin("isolation level read committed",async tx=>{
    await tx`set local statement_timeout = '20s'`;await tx`set local lock_timeout = '5s'`;
    await tx`lock table public.processing_job in share row exclusive mode`;
    const [busy]=await tx`select count(*)::int as count from public.processing_job where state in ('queued','leased')`;
    if(busy!.count)throw Object.assign(new Error("Idle queue required"),{code:"CAPTURE_VALIDATION_QUEUE_NOT_IDLE"});
    const target=fixtureConnection(tx),store=postgresCaptureStore(target),handler=captureV2Handler(store,()=>true);
    const body:CaptureV2={version:2,requestId:randomUUID(),adapterId:"linkedin",kind:"profile_page",sourceUrl:"https://www.linkedin.com/in/capture-runtime-fixture/",
      html:'<section aria-label="Primary content"><h2>Exact 😀 source</h2><script>never run</script></section>',
      reasonForNoticing:"  Why I noticed this 😀  ",urn:null,extensionVersion:"fixture",clientCapturedAt:"2026-10-17T00:00:00.123456Z"};
    const request=(payload:CaptureV2)=>new Request("https://example.test/api/capture/v2",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    markValidationStage("capture_runtime_save");
    const saved=await handler(request(body));assert.equal(saved.status,200);checks++;
    const ack=await saved.json() as CaptureAcknowledgment;
    assert.equal(ack.state,"saved");assert.equal(ack.processing,"queued");checks+=2;
    const [snapshot]=await tx`select content_gzip,to_char(captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as captured from public.snapshot where id=${ack.snapshotId}`;
    assert.equal(gunzipSync(snapshot!.content_gzip).toString('utf8'),body.html);assert.equal(snapshot!.captured,body.clientCapturedAt);checks+=2;
    const [encounter]=await tx`select source_context,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as occurred from public.encounter where id=${ack.encounterId}`;
    assert.equal(encounter!.occurred,body.clientCapturedAt);assert.equal(encounter!.source_context.client_clock_unverified,true);
    assert.equal(encounter!.source_context.client_captured_at,body.clientCapturedAt);checks+=3;
    const [reason]=await tx`select body_text,truth_layer,semantic_role from public.observation where subject_id=${ack.encounterId}`;
    assert.equal(reason!.body_text,body.reasonForNoticing);assert.equal(reason!.truth_layer,"user");assert.equal(reason!.semantic_role,"reason_for_noticing");checks+=3;
    assert.equal((await handler(request({...body,html:"changed"}))).status,409);checks++;
    assert.equal((await handler(request({...body,requestId:body.requestId.toUpperCase()}))).status,200);checks++;
    markValidationStage("capture_runtime_lost_ack_outbox");
    const records=new Map<string,OutboxItem<CaptureV2>>([[body.requestId,{requestId:body.requestId,payload:body,state:"queued",attempts:0,nextAttemptAt:0,lastErrorCode:null}]]);
    const outbox={list:async()=>[...records.values()],put:async(item:OutboxItem<CaptureV2>)=>{records.set(item.requestId,item);},remove:async(id:string)=>{records.delete(id);}};
    let lose=true;
    const transport=(async (_input:unknown,init?:RequestInit)=>{
      const result=await handler(new Request("https://example.test/api/capture/v2",init));
      if(lose){lose=false;throw new Error("LOST_SYNTHETIC_ACK");}return result;
    }) as typeof fetch;
    const delivery=(payload:CaptureV2)=>sendV2(payload,"https://example.test/api/capture/v2","synthetic",transport);
    assert.equal((await drain(outbox,delivery,0))[0]!.state,"queued");assert.equal(records.size,1);checks+=2;
    assert.equal((await drain(outbox,delivery,5000))[0]!.state,"saved");assert.equal(records.size,0);checks+=2;
    const [receipts]=await tx`select count(*)::int as count from public.capture_request where id=${body.requestId}`;
    assert.equal(receipts!.count,1);checks++;
    markValidationStage("capture_runtime_atomic_failure");
    const broken:CaptureStore={transaction:(id,work)=>store.transaction(id,inner=>work({...inner,async storeCapture(capture){await inner.storeCapture(capture);throw new Error("FIXTURE_SAVE_INTERRUPTED");}}))};
    const interrupted={...body,requestId:randomUUID()};
    assert.equal((await captureV2Handler(broken,()=>true)(request(interrupted))).status,503);checks++;
    const [partial]=await tx`select (select count(*)::int from public.capture_request where id=${interrupted.requestId}) as requests,
      (select count(*)::int from public.encounter where source_context->>'request_id'=${interrupted.requestId}) as encounters`;
    assert.equal(partial!.requests,0);assert.equal(partial!.encounters,0);checks+=2;
    const repeated=await(await handler(request({...body,requestId:randomUUID(),reasonForNoticing:null}))).json() as CaptureAcknowledgment;
    assert.notEqual(repeated.encounterId,ack.encounterId);checks++;
    const [noReason]=await tx`select count(*)::int as count from public.observation where subject_id=${repeated.encounterId}`;
    assert.equal(noReason!.count,0);checks++;
    const quarantinedBody={...body,requestId:randomUUID(),html:"<main>Missing adapter root</main>"};
    const quarantined=await(await handler(request(quarantinedBody))).json() as CaptureAcknowledgment;
    markValidationStage("capture_runtime_fenced_processing");
    const jobs=postgresJobs(target,applyExtraction,["parse"]),processor=extractionProcessor(id=>readExtractionTransaction(tx,id));
    const report=await runProcessingBatch(jobs,processor,{maxJobs:5,maxRuntimeMs:30000,leaseDurationMs:120000});
    assert.equal(report.counts.succeeded,2);assert.equal(report.counts.quarantined,1);assert.equal(report.stopped,"idle");checks+=3;
    const [normalized]=await tx`select text from public.snapshot_representation where snapshot_id=${ack.snapshotId}`;
    assert.ok(normalized!.text.includes("Exact 😀 source"));assert.equal(normalized!.text.includes("never run"),false);checks+=2;
    const replay=await(await handler(request(body))).json() as CaptureAcknowledgment;
    assert.equal(replay.processing,"succeeded");assert.equal(replay.replayed,true);assert.equal(replay.snapshotId,ack.snapshotId);checks+=3;
    assert.equal((await(await handler(request(quarantinedBody))).json()).processing,"quarantined");checks++;
    const [quarantine]=await tx`select count(*)::int as count from public.quarantine where snapshot_id=${quarantined.snapshotId}`;
    assert.equal(quarantine!.count,1);checks++;
    const [noGuessedPerson]=await tx`select count(*)::int as count from public.encounter_object x join public.object_ref r on r.id=x.object_id
      where x.encounter_id=${ack.encounterId} and r.kind='person'`;
    assert.equal(noGuessedPerson!.count,0);checks++;
    await tx`set constraints all immediate`;checks++;
    throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
  return checks;
}

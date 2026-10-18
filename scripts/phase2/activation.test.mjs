import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
async function load(path){const out=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString("base64")}`);}
const {captureV2Handler}=await load("lib/capture/v2-handler.ts"),{captureV2}=await load("lib/capture/v2-contract.ts"),
 {CAPTURE_V2_REQUEST_BYTES,CAPTURE_V2_HTML_BYTES}=await load("lib/capture/v2-limits.ts"),{runProcessingBatch}=await load("lib/processing/batch.ts");
const payload=()=>({version:2,requestId:randomUUID(),adapterId:"linkedin",kind:"profile_page",sourceUrl:"https://www.linkedin.com/in/fixture/",html:"<main>😀</main>",reasonForNoticing:null,urn:null,extensionVersion:"fixture",clientCapturedAt:"2026-10-17T00:00:00.123456Z"});
const noStore={transaction:()=>assert.fail("must not write")};
test("capture activation, failed authorization and unavailable auth settings precede body reads",async()=>{
 let read=false;const request={headers:new Headers(),get body(){read=true;throw new Error("PRIVATE_HTML");}};
 for(const [authorize,options,status,error] of [[()=>false,{},401,"unauthorised"],[()=>true,{enabled:()=>false},503,"capture_v2_disabled"],[()=>{throw new Error("PRIVATE_SETTING");},{},503,"capture_unavailable"]]){
  const response=await captureV2Handler(noStore,authorize,options)(request);
  assert.equal(response.status,status);assert.equal(response.headers.get("cache-control"),"no-store");assert.deepEqual(await response.json(),{error});assert.equal(read,false);
 }
});
test("capture rejects oversized declarations and streamed bytes without saving",async()=>{
 const handler=captureV2Handler(noStore,()=>true);
 const declared=new Request("https://example.test",{method:"POST",headers:{"content-length":String(CAPTURE_V2_REQUEST_BYTES+1)}});
 assert.equal((await handler(declared)).status,413);
 let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(CAPTURE_V2_REQUEST_BYTES+1));},cancel(){cancelled=true;}});
 const request=new Request("https://example.test",{method:"POST",body:stream,duplex:"half"});
 assert.equal((await handler(request)).status,413);assert.equal(cancelled,true);
});
test("capture rejects wrong media type, malformed UTF-8 and unsafe text",async()=>{
 const handler=captureV2Handler(noStore,()=>true);
 for(const [body,headers,status] of [["{}",{"content-type":"text/html"},415],[new Uint8Array([255]),{"content-type":"application/json"},400]])
  assert.equal((await handler(new Request("https://example.test",{method:"POST",headers,body}))).status,status);
 for(const text of ["bad\0text","bad\ud800"]){assert.equal(captureV2.safeParse({...payload(),html:text}).success,false);assert.equal(captureV2.safeParse({...payload(),reasonForNoticing:text}).success,false);}
 assert.equal(captureV2.safeParse({...payload(),html:"😀".repeat(Math.floor(CAPTURE_V2_HTML_BYTES/4)+1)}).success,false);
});
test("UUID spelling is canonical while exact captured text and clock remain intact",()=>{
 const body=payload();body.requestId=body.requestId.toUpperCase();body.reasonForNoticing="  why 😀  ";
 const parsed=captureV2.parse(body);assert.equal(parsed.requestId,body.requestId.toLowerCase());assert.equal(parsed.reasonForNoticing,body.reasonForNoticing);assert.equal(parsed.clientCapturedAt,body.clientCapturedAt);
});
function jobs(outcome="succeeded"){
 let claims=0,failures=0;return {get claims(){return claims;},get failures(){return failures;},
  async claim(){claims++;return {jobId:randomUUID(),snapshotId:randomUUID(),token:randomUUID(),kind:"parse",inputFingerprint:"fixture",expiresAt:Date.now()+100000};},
  async renew(){return true;},async complete(){return outcome!=="stale";},async fail(){failures++;return true;}};
}
const options={maxJobs:2,maxRuntimeMs:1000,leaseDurationMs:120000},processJob=async()=>({result:{},outcome:"succeeded"});
test("worker drains a finite number of jobs and reports stale and retriable outcomes separately",async()=>{
 const store=jobs();const report=await runProcessingBatch(store,processJob,options,()=>0);assert.equal(report.attempted,2);assert.equal(report.counts.succeeded,2);assert.equal(report.stopped,"job_limit");
 assert.equal((await runProcessingBatch(jobs("stale"),processJob,options,()=>0)).counts.stale,2);
 const failed=jobs();assert.equal((await runProcessingBatch(failed,async()=>{throw new Error("PRIVATE_SOURCE");},options,()=>0)).counts.retry_or_failed,2);assert.equal(failed.failures,2);
});
test("worker deadline and shutdown prevent further claims; idle stops immediately",async()=>{
 const stopped=jobs();const signal=AbortSignal.abort();assert.equal((await runProcessingBatch(stopped,processJob,{...options,signal},()=>0)).stopped,"shutdown");assert.equal(stopped.claims,0);
 let tick=0;const late=jobs();assert.equal((await runProcessingBatch(late,processJob,options,()=>tick++?1001:0)).stopped,"deadline");assert.equal(late.claims,0);
 assert.equal((await runProcessingBatch({...jobs(),claim:async()=>null},processJob,options,()=>0)).stopped,"idle");
});
test("invalid worker budgets cannot claim jobs and the default command never loads a database",async()=>{
 const store=jobs();await assert.rejects(runProcessingBatch(store,processJob,{...options,maxJobs:101}));assert.equal(store.claims,0);
 const report=JSON.parse(execFileSync(process.execPath,["scripts/processing/run.mjs","--check"],{env:{...process.env,DATABASE_URL:"invalid-private-setting"},encoding:"utf8"}));
 assert.equal(report.worker_started,false);assert.equal(report.status,"parse_worker_prepared");
});

import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
async function load(path){const out=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString("base64")}`);}
const {captureQueue}=await load("extension/lib/capture-queue.ts"),{validateCapture}=await load("extension/lib/capture-v2.ts");
const payload=()=>({version:2,requestId:randomUUID(),adapterId:"linkedin",kind:"profile_page",sourceUrl:"https://www.linkedin.com/in/fixture/",html:"<section>😀 exact</section>",reasonForNoticing:"  why 😀  ",urn:null,extensionVersion:"fixture",clientCapturedAt:"2026-10-17T00:00:00.000Z"});
function storage(){const items=new Map(),receipts=new Map();return {items,receipts,list:async()=>structuredClone([...items.values()]),put:async value=>{items.set(value.requestId,structuredClone(value));},remove:async id=>{items.delete(id);},receipt:async id=>receipts.get(id)??null,saveReceipt:async value=>{receipts.set(value.requestId,structuredClone(value));}};}
test("message retry reuses one persisted capture; changed input under its ID conflicts",async()=>{
 const store=storage(),q=captureQueue(store,()=>assert.fail("must not send on accept")),body=payload();
 const a=await q.accept(body),b=await q.accept(body);assert.equal(a.state,"queued");assert.equal(b.requestId,a.requestId);assert.equal(store.items.size,1);
 await assert.rejects(q.accept({...body,reasonForNoticing:"changed"}),/CONFLICT/);assert.equal(store.items.get(body.requestId).payload.reasonForNoticing,"  why 😀  ");
});
test("quota failure cannot acknowledge local persistence",async()=>{
 const store=storage();store.put=async()=>{throw new Error("quota");};await assert.rejects(captureQueue(store,()=>{}).accept(payload()));assert.equal(store.items.size,0);
});
test("network outside storage serialization allows another save during a slow delivery",async()=>{
 const store=storage();let release,entered;const started=new Promise(resolve=>entered=resolve),network=new Promise(resolve=>release=resolve);
 const q=captureQueue(store,async body=>{entered();await network;return {state:"saved",requestId:body.requestId,processing:"queued"};});
 await q.accept(payload());const pumping=q.pump();await started;const second=payload();assert.equal((await q.accept(second)).state,"queued");assert.equal(store.items.size,2);
 release();await pumping;assert.equal(store.items.size,0);assert.equal((await q.status(second.requestId)).state,"saved");
});
test("reload after lost acknowledgement retains ID and requires a durable receipt for saved status",async()=>{
 const store=storage(),body=payload();let now=0;const q=captureQueue(store,async()=>{throw new Error("lost ack");},()=>now);
 await q.accept(body);await q.pump();assert.equal((await q.status(body.requestId)).state,"queued");
 now=5000;const reloaded=captureQueue(store,async sent=>{assert.deepEqual(sent,body);return {state:"saved",requestId:sent.requestId,processing:"quarantined"};},()=>now);
 await reloaded.pump();assert.equal(store.items.size,0);assert.equal((await reloaded.status(body.requestId)).processing,"quarantined");assert.equal((await reloaded.accept(body)).state,"saved");
 assert.equal((await reloaded.status(randomUUID())).state,"unknown");await assert.rejects(reloaded.accept({...body,html:"changed"}),/CONFLICT/);
});
test("receipt-write and cleanup failures retain safe retry state without losing source",async()=>{
 const store=storage(),body=payload(),send=async body=>({state:"saved",requestId:body.requestId,processing:"queued"});const q=captureQueue(store,send);
 await q.accept(body);const save=store.saveReceipt;store.saveReceipt=async()=>{throw new Error("quota");};await assert.rejects(q.pump());assert.equal(store.items.size,1);assert.equal((await q.status(body.requestId)).state,"queued");
 store.saveReceipt=save;const remove=store.remove;store.remove=async()=>{throw new Error("cleanup");};await assert.rejects(q.pump());assert.equal(store.items.size,1);assert.equal((await q.status(body.requestId)).state,"saved");
 store.remove=remove;await q.pump();assert.equal(store.items.size,0);
});
test("authentication blocks retries until explicit resume and failed captures are retained",async()=>{
 const store=storage(),body=payload();let calls=0,allowed=false,now=0;
 const q=captureQueue(store,async body=>{calls++;return allowed?{state:"saved",requestId:body.requestId}:{state:"blocked",code:"AUTH_REJECTED"};},()=>now);
 await q.accept(body);await q.pump();now=999999;await q.pump();assert.equal(calls,1);assert.equal((await q.status(body.requestId)).state,"blocked");
 allowed=true;await q.resume(body.requestId);await q.pump();assert.equal((await q.status(body.requestId)).state,"saved");
 const failed=captureQueue(store,async()=>({state:"failed",code:"CAPTURE_REJECTED"}),()=>now),other=payload();await failed.accept(other);await failed.pump();await assert.rejects(failed.resume(other.requestId),/NEW_SAVE/);assert.equal(store.items.size,1);
});
test("a late failed attempt cannot undo explicit resume while it is in flight",async()=>{
 const store=storage(),body=payload();let release,entered,calls=0;const started=new Promise(resolve=>entered=resolve),wait=new Promise(resolve=>release=resolve);
 const q=captureQueue(store,async body=>{calls++;if(calls===1){entered();await wait;return {state:"blocked",code:"AUTH_REJECTED"};}return {state:"saved",requestId:body.requestId};});
 await q.accept(body);const pump=q.pump();await started;await q.resume(body.requestId);release();await pump;assert.equal((await q.status(body.requestId)).state,"saved");
});
test("browser envelope validation enforces JSON escaping and Unicode byte limits",()=>{
 const body=payload();assert.equal(validateCapture(body).reasonForNoticing,body.reasonForNoticing);
 for(const change of [{html:'"'.repeat(2500000)},{html:"😀".repeat(750001)},{html:"x\0"},{html:"\ud800"},{sourceUrl:"https://linkedin.com.evil.test/"},{extra:true}])assert.throws(()=>validateCapture({...body,...change}));
});

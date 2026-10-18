import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
async function load(path){const out=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString("base64")}`);}
const {chromeCaptureStorage}=await load("extension/lib/capture-storage.ts"),{captureQueue}=await load("extension/lib/capture-queue.ts");
const payload=()=>({version:2,requestId:randomUUID(),adapterId:"linkedin",kind:"profile_page",sourceUrl:"https://www.linkedin.com/in/storage-fixture/",html:"<section>"+"x".repeat(10000)+"😀</section>",reasonForNoticing:null,urn:null,extensionVersion:"fixture",clientCapturedAt:"2026-10-17T00:00:00.000Z"});
function localStorage(){
 const values={};let trusted=false,limit=Infinity,failPromotion=false;
 const bytes=records=>Object.entries(records).reduce((sum,[key,value])=>sum+Buffer.byteLength(key)+Buffer.byteLength(JSON.stringify(value)),0);
 globalThis.chrome={storage:{local:{
  async setAccessLevel(){trusted=true;},async get(key){assert.equal(trusted,true);return structuredClone(key===null?values:{[key]:values[key]});},
  async set(next){if(failPromotion&&Object.keys(next).some(key=>key.startsWith("flaneur-saved-v2:")))throw new Error("PROMOTION_INTERRUPTED");
   if(bytes({...values,...next})>limit)throw new Error("QUOTA_EXCEEDED");Object.assign(values,structuredClone(next));},
  async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete values[key];},
 }}};
 return {values,bytes:()=>bytes(values),get limit(){return limit;},set limit(value){limit=value;},set failPromotion(value){failPromotion=value;}};
}
test("acknowledged payload can become a durable receipt at a completely full storage quota",async()=>{
 const local=localStorage(),store=await chromeCaptureStorage(),body=payload();let calls=0;
 const queue=captureQueue(store,async payload=>{calls++;return {state:"saved",requestId:payload.requestId,processing:"queued"};});
 await queue.accept(body);local.limit=local.bytes();await queue.pump();
 assert.equal(calls,1);assert.equal((await queue.status(body.requestId)).state,"saved");assert.equal(local.values["flaneur-outbox-v2:"+body.requestId],undefined);
 assert.ok(local.values["flaneur-saved-v2:"+body.requestId]);assert.ok(local.bytes()<local.limit);
});
test("interrupted receipt promotion leaves an acknowledged marker and recovers without another upload",async()=>{
 const local=localStorage(),body=payload();let calls=0;const send=async payload=>{calls++;return {state:"saved",requestId:payload.requestId,processing:"quarantined"};};
 const queue=captureQueue(await chromeCaptureStorage(),send);await queue.accept(body);local.failPromotion=true;
 await assert.rejects(queue.pump(),/PROMOTION_INTERRUPTED/);
 const marker=local.values["flaneur-outbox-v2:"+body.requestId];assert.equal(marker.state,"saved");assert.equal("payload" in marker,false);
 assert.equal((await queue.status(body.requestId)).state,"saved");assert.equal((await queue.status(body.requestId)).processing,"quarantined");
 local.failPromotion=false;const restarted=captureQueue(await chromeCaptureStorage(),send);await restarted.pump();assert.equal(calls,1);
 assert.equal(local.values["flaneur-outbox-v2:"+body.requestId],undefined);assert.equal((await restarted.status(body.requestId)).state,"saved");
});
test("a rejected upload never replaces the only unsaved source with an acknowledgement marker",async()=>{
 const local=localStorage(),body=payload(),queue=captureQueue(await chromeCaptureStorage(),async()=>({state:"retry",code:"SERVER_UNAVAILABLE"}));
 await queue.accept(body);await queue.pump();assert.deepEqual(local.values["flaneur-outbox-v2:"+body.requestId].payload,body);
 assert.equal(local.values["flaneur-saved-v2:"+body.requestId],undefined);
});
test("an invalid acknowledgement marker cannot delete a queued record or create a receipt",async()=>{
 const local=localStorage(),store=await chromeCaptureStorage(),id=randomUUID();local.values["flaneur-outbox-v2:"+id]={state:"saved",receipt:{requestId:randomUUID(),payloadHash:"a".repeat(64),savedAt:1,processing:"queued"}};
 await assert.rejects(store.list(),/RECEIPT_INVALID/);assert.ok(local.values["flaneur-outbox-v2:"+id]);assert.equal(Object.keys(local.values).length,1);
});

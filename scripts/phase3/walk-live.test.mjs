import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
async function load(path){const out=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString("base64")}`);}
const {walkHandler}=await load("lib/walk/handler.ts"),{presentWalk,mergeWalkView}=await load("lib/walk/view.ts"),{exposureGate}=await load("lib/walk/exposure.ts");
const owner=randomUUID(),sessionId=randomUUID(),stopId=randomUUID(),eventId=randomUUID();
const request=body=>new Request("https://example.test/api/walk",{method:"POST",headers:{"content-type":"application/json"},body:typeof body==="string"?body:JSON.stringify(body)});
test("GET resumes through a read-only dependency; auth rejection precedes body and store access",async()=>{
 const handler=walkHandler({ownerId:owner,store:{open:()=>assert.fail("no write"),record:()=>assert.fail("no write")},authorize:async()=>null,read:async()=>({timezone:null,session:null})});
 const response=await handler(new Request("https://example.test/api/walk"));assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
 const denied=walkHandler({ownerId:owner,store:{},authorize:async()=>Response.json({error:"unauthorised"},{status:401}),read:()=>assert.fail("no read")});
 assert.equal((await denied(request("invalid"))).status,401);
});
test("strict envelopes retire old schedule requests and reject forged identities, times and large bytes",async()=>{
 const handler=walkHandler({ownerId:owner,store:{open:()=>assert.fail(),record:()=>assert.fail()},authorize:async()=>null,read:()=>assert.fail()});
 for(const body of [{artifactId:randomUUID(),action:"say_hello"},{action:"start",timezone:"UTC",ownerId:owner},{action:"event",sessionId,stopId,eventId,kind:"shown",recordedAt:"2026-10-13"}])assert.equal((await handler(request(body))).status,400);
 assert.equal((await handler(request(" ".repeat(16385)))).status,413);
});
test("event writes derive the owner and retain retry IDs; failures are private",async()=>{
 let received;const handler=walkHandler({ownerId:owner,store:{record:async input=>{received=input;}},authorize:async()=>null,read:async()=>({timezone:"UTC",session:null})});
 assert.equal((await handler(request({action:"event",sessionId,stopId,eventId,kind:"shown"}))).status,200);
 assert.deepEqual(received,{ownerId:owner,sessionId,stopId,eventId,kind:"shown"});
 const failed=walkHandler({ownerId:owner,store:{open:async()=>{throw new Error("PRIVATE_SQL_DATA");}},authorize:async()=>null,read:()=>assert.fail()});
 const response=await failed(request({action:"start",timezone:"UTC"}));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"walk_unavailable"});
});
test("changed or expired Walk state is a conflict rather than a false action success",async()=>{
 const handler=walkHandler({ownerId:owner,store:{record:async()=>{throw new Error("WALK_SESSION_EXPIRED");}},authorize:async()=>null,read:()=>assert.fail()});
 const response=await handler(request({action:"event",sessionId,stopId,eventId,kind:"passed"}));assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:"walk_expired"});
});
const stored={id:sessionId,ownerId:owner,localDay:"2026-10-13",timezone:"UTC",context:null,createdAt:"2026-10-13T00:00:00Z",completedAt:null,
 stops:[{id:stopId,objectId:"object",position:1,resolution:null,resolvedAt:null,selectionSupport:[{id:"old"}],selectionReasons:[{text:"Includes your saved words"}]}]};
test("presentation uses current text and internal object links, withdrawing inactive objects without refill",()=>{
 const candidate={id:"object",kind:"artifact",label:"Saved work",evidence:[{id:"new",objectId:"object",text:"Revised exact User words",layer:"user",verified:true}]};
 const view=presentWalk(stored,[candidate],new Set());
 assert.equal(view.session.stops[0].href,"/artifact/object");assert.equal(view.session.stops[0].evidence[0].text,candidate.evidence[0].text);
 assert.deepEqual(view.session.stops[0].reasons,[]);assert.equal(JSON.stringify(view).includes(owner),false);
 const withdrawn=presentWalk(stored,[],new Set());assert.equal(withdrawn.session.completed,false);assert.equal(withdrawn.session.needsResume,true);
});
test("out-of-order responses cannot refill completed or resolved stops",()=>{
 const base={timezone:"UTC",session:{id:sessionId,completed:false,stops:[{id:"a",shown:false},{id:"b",shown:false}]}};
 const progressed={...base,session:{...base.session,stops:[{id:"b",shown:true}]}};
 const merged=mergeWalkView(progressed,base);assert.deepEqual(merged.session.stops,[{id:"b",shown:true}]);
 const done={...progressed,session:{...progressed.session,completed:true,stops:[]}};
 assert.deepEqual(mergeWalkView(done,base),done);
});
test("exposure needs an uninterrupted visible second and fires once",()=>{
 let visible=true,pending=null,count=0;const gate=exposureGate({visible:()=>visible,schedule:work=>{pending=work;return 1;},cancel:()=>{pending=null;},notify:()=>count++});
 gate.intersection(0.49);assert.equal(pending,null);gate.intersection(0.5);assert.ok(pending);
 visible=false;gate.visibilityChanged();assert.equal(pending,null);visible=true;gate.visibilityChanged();pending();assert.equal(count,1);
 gate.intersection(1);assert.equal(count,1);gate.dispose();
});
test("leaving the viewport or unmounting cancels pending exposure",()=>{
 let pending=null;const gate=exposureGate({visible:()=>true,schedule:work=>{pending=work;return 1;},cancel:()=>{pending=null;},notify:()=>assert.fail("must not expose")});
 gate.intersection(1);gate.intersection(0);assert.equal(pending,null);gate.intersection(1);gate.dispose();assert.equal(pending,null);
});

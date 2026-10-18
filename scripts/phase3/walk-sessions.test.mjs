import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { build } from "esbuild";
const out=await build({entryPoints:["lib/walk/sessions.ts"],bundle:true,write:false,platform:"node",format:"esm"});
const {openWalk,recordWalkEvent}=await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString("base64")}`);
test("owner and event IDs are canonical; explicit context is preserved exactly",async()=>{
 const owner=randomUUID(),context="  Computational robotics 😀  ";let received;
 await openWalk({ownerId:owner.toUpperCase(),timezone:"UTC",context},{open:async input=>{received=input;}});
 assert.equal(received.ownerId,owner);assert.equal(received.context,context);assert.equal(received.timezone,"UTC");
});
test("unsupported timezone and caller supplied date or membership never reach storage",()=>{
 const input={ownerId:randomUUID(),timezone:"UTC"};const store={open:()=>assert.fail("must not store")};
 for(const supplied of [{...input,timezone:"Unknown/Place"},{...input,localDay:"2026-10-13"},{...input,stops:[]},{...input,context:"x".repeat(2001)}])assert.throws(()=>openWalk(supplied,store));
});
test("only explicit attention kinds are accepted; exposure timestamp and contact cannot be invented",()=>{
 const input={ownerId:randomUUID(),sessionId:randomUUID(),stopId:randomUUID(),eventId:randomUUID(),kind:"shown"};
 const store={record:()=>assert.fail("must not record")};
 for(const supplied of [{...input,recordedAt:"2026-10-13T00:00:00Z"},{...input,kind:"unavailable"},{...input,kind:"contacted"},{...input,kind:"copied"}])assert.throws(()=>recordWalkEvent(supplied,store));
});
test("an attention request retains a stable event identity for retries",async()=>{
 const input={ownerId:randomUUID(),sessionId:randomUUID(),stopId:randomUUID(),eventId:randomUUID(),kind:"dismissed"};let received;
 await recordWalkEvent(input,{record:async value=>{received=value;return {eventId:value.eventId,replayed:false};}});
 assert.deepEqual(received,input);
});

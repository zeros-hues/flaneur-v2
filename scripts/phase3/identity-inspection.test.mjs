import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const output = await build({ entryPoints:["lib/identity/inspection.ts"],bundle:true,write:false,platform:"node",format:"esm" });
const { identityInspection } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
const person="synthetic-person",other="other",proof={id:"proof",personId:person,layer:"user",bodyText:"Exact identity assertion"};
const base={snapshotId:"capture",sourceUrl:"https://example.test/profile",capturedAt:"2026-10-12T00:00:00Z",
  adapterId:"linkedin",captureType:"profile",hasContentHash:true,capturedEncounters:1,noticedPeople:[person],activeProofs:[]};
test("unresolved explicitly linked profiles can be confirmed without inventing a proof",()=>{
 const result=identityInspection(base,person,false);assert.equal(result.state,"unresolved");assert.equal(result.proof,null);
 assert.deepEqual(result.actions,{confirm:true,reject:false});
});
test("one current proof supports dedicated confirmation/rejection and retains its exact layer/text",()=>{
 const result=identityInspection({...base,activeProofs:[proof]},person,false);
 assert.equal(result.state,"associated");assert.deepEqual(result.proof,proof);assert.deepEqual(result.actions,{confirm:true,reject:true});
});
test("conflicting historical links, other-person proofs and multiple active proofs cannot be confirmed",()=>{
 for(const change of [{noticedPeople:[person,other]},{activeProofs:[{...proof,personId:other}]},{activeProofs:[proof,{...proof,id:"second"}]}]) {
  const result=identityInspection({...base,...change},person,false);assert.equal(result.state,"conflict");assert.equal(result.actions.confirm,false);
 }
 assert.equal(identityInspection({...base,activeProofs:[proof,{...proof,id:"second"}]},person,false).actions.reject,false);
});
test("unsupported or archived captures disable identity writes; confirmation requires one captured encounter",()=>{
 for(const change of [{adapterId:"unknown"},{captureType:"post"},{hasContentHash:false}])
  assert.deepEqual(identityInspection({...base,...change,activeProofs:[proof]},person,false).actions,{confirm:false,reject:false});
 assert.deepEqual(identityInspection({...base,activeProofs:[proof]},person,true).actions,{confirm:false,reject:false});
 assert.equal(identityInspection({...base,capturedEncounters:0},person,false).actions.confirm,false);
});
test("unsafe sources are unavailable while rejection can withdraw a sole current proof despite conflicting links",()=>{
 for(const sourceUrl of ["javascript:alert(1)","https://user:private@example.test","file:///private"])
  assert.equal(identityInspection({...base,sourceUrl},person,false).sourceUrl,null);
 const result=identityInspection({...base,noticedPeople:[person,other],activeProofs:[proof]},person,false);
 assert.equal(result.actions.confirm,false);assert.equal(result.actions.reject,true);
});
test("inactive source or captured Encounter disables a new association while preserving proof rejection",()=>{
 const result=identityInspection({...base,available:false,activeProofs:[proof]},person,false);
 assert.equal(result.state,'unavailable');assert.deepEqual(result.actions,{confirm:false,reject:true});
});

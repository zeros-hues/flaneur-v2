import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path){const out=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString("base64")}`);}
const {composeContextualWalk}=await load("lib/walk/contextual.ts");
const {draftOutcome}=await load("lib/walk/draft-outcome.ts");
const now="2026-10-13T00:00:00Z";
const candidate=(id,text="Robotics User words",layer="user")=>({id,kind:"person",label:"Profile-only Person",savedAt:"2025-01-01T00:00:00Z",lastEncounterAt:null,encounterCount:0,evidence:[{id:`note-${id}`,objectId:id,text,layer,verified:true}]});
test("profile-only People participate in a deterministic finite Walk without an artifact or due schedule",()=>{
 const candidates=Array.from({length:10},(_,i)=>candidate(`person-${i}`));
 const result=composeContextualWalk(candidates,{referenceInstant:now});assert.equal(result.length,3);
 assert.deepEqual(result,composeContextualWalk([...candidates].reverse(),{referenceInstant:now}));
 assert.ok(result.every(stop=>stop.kind==="person"&&stop.reasons.some(reason=>reason.code==="user_words")));
});
test("saved User words outrank unsupported inference; age alone creates no review obligation",()=>{
 const user=candidate("user");const inferred=candidate("inferred","Robotics", "inferred");
 assert.deepEqual(composeContextualWalk([inferred,user],{referenceInstant:now}).map(stop=>stop.id),["user"]);
});
test("explicit context uses literal saved evidence and explains overlap without inventing profile changes",()=>{
 const result=composeContextualWalk([candidate("unrelated","Pottery"),candidate("relevant","Computational robotics")],{referenceInstant:now,context:"Robotics"});
 assert.equal(result[0].id,"relevant");assert.ok(result[0].reasons.some(reason=>reason.code==="context"));
 assert.equal(result[0].evidence[0].text,"Computational robotics");
 assert.ok(result[0].selectionSupport.some(item=>item.text.includes("robotics")));
});
test("dismissal reduces exposure and repeated dismissals never turn into urgency",()=>{
 const object=candidate("dismissed");
 assert.equal(composeContextualWalk([object,candidate("other-a"),candidate("other-b"),candidate("other-c")],{referenceInstant:now,feedback:[{objectId:object.id,dismissals:1,lastExposedAt:null}]}).some(stop=>stop.id===object.id),false);
 assert.equal(composeContextualWalk([object],{referenceInstant:"2099-01-01T00:00:00Z",context:"Robotics",feedback:[{objectId:object.id,dismissals:3,lastExposedAt:null}]}).length,0);
 assert.equal(composeContextualWalk([object],{referenceInstant:now,feedback:[{objectId:object.id,dismissals:0,lastExposedAt:now}]}).length,0);
});
test("diversity prefers different saved material over a duplicate topic",()=>{
 const result=composeContextualWalk([candidate("a","Robotics mechanics"),candidate("b","Robotics mechanics"),candidate("c","Pottery ceramics")],{referenceInstant:now});
 assert.deepEqual(result.map(stop=>stop.id),["a","c","b"]);
});
test("invalid feedback, dates and duplicate object identities fail explicitly",()=>{
 assert.throws(()=>composeContextualWalk([candidate("a"),candidate("a")],{referenceInstant:now}));
 assert.throws(()=>composeContextualWalk([candidate("a")],{referenceInstant:"invalid"}));
 assert.throws(()=>composeContextualWalk([candidate("a")],{referenceInstant:now,feedback:[{objectId:"a",dismissals:-1,lastExposedAt:null}]}));
});
test("copy rejection retains a usable draft and never reports copied",async()=>{
 const draft={draft:"Exact draft words",profile_url:"https://example.test/"};
 assert.deepEqual(await draftOutcome(Promise.resolve(draft),Promise.reject(new Error("Permission denied"))),{state:"copy_failed",result:draft});
 assert.equal((await draftOutcome(Promise.resolve(draft),Promise.resolve())).state,"copied");
});
test("draft failure is distinct from clipboard failure and is handled privately",async()=>{
 const rejected=Promise.reject(new Error("PRIVATE_PROVIDER_DATA"));
 assert.deepEqual(await draftOutcome(rejected,rejected.then(()=>{})),{state:"draft_failed"});
});

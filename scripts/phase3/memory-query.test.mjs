import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path){const output=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);}
const {memoryQuery,memoryExcerpt}=await load("lib/query/memory.ts"),{readCandidates}=await load("lib/retrieval/reader.ts");
const plan={mode:"recall",objectKinds:["person"],terms:["robotics"],constraints:[],encounteredBetween:null,ambiguities:[],interpretation:"Saved robotics memory"};
const data={objects:[{id:"person",kind:"person"}],observations:[{id:"new-note",subjectId:"person",text:"  Robotics User words 😀  ",layer:"user",supportStatus:"verified"}],locators:[],facts:[],encounters:[],links:[]};
function deps(payload=plan,fixture=data){return {planner:{plan:async()=>JSON.stringify(payload)},reader:{read:async()=>readCandidates(fixture)},labels:async()=>[{id:"person",kind:"person",label:"Synthetic Person"}]};}
test("long exact-text excerpts retain matching words and Unicode boundaries",()=>{
 const text="😀".repeat(3000)+" Robotics (C++) words "+"尾".repeat(3000);
 const excerpt=memoryExcerpt(text,["(C++)"]);
 assert.ok(excerpt.includes(" Robotics (C++) words "));
 assert.equal(Array.from(excerpt).length,2000);
 assert.ok(text.includes(excerpt));
});
test("new User observations are recalled from the first person with inspectable provenance and exact labels",async()=>{
 const block=await memoryQuery("Who did I save about robotics?","2026-10-13T00:00:00Z",deps());
 assert.equal(block.state,"matches");assert.equal(block.items.length,1);assert.equal(block.items[0].evidence[0].layer,"user");
 assert.equal(block.items[0].evidence[0].text,data.observations[0].text);assert.equal(block.items[0].evidence[0].provenance.observationId,"new-note");
});
test("clarification stops before retrieval and failures do not substitute an unsupported legacy answer",async()=>{
 const supplied=deps({...plan,ambiguities:["Which Cambridge?"]});supplied.reader.read=async()=>assert.fail("must not retrieve");
 assert.equal((await memoryQuery("robotics","2026-10-13T00:00:00Z",supplied)).state,"clarification");
 const failed=deps();failed.reader.read=async()=>{throw new Error("PRIVATE_SQL_DATA");};
 const output=await memoryQuery("robotics","2026-10-13T00:00:00Z",failed);assert.equal(output.state,"unavailable");assert.equal(JSON.stringify(output).includes("PRIVATE"),false);
});
test("unverified explicit constraints remain uncertain; incomplete reflection does not invent patterns",async()=>{
 const uncertain=await memoryQuery("robotics from EPFL","2026-10-13T00:00:00Z",deps({...plan,constraints:[{field:"school",value:"EPFL"}]}));
 assert.equal(uncertain.items[0].uncertain,true);assert.equal(uncertain.matchedTotal,0);
 const incomplete={...data,objects:[...data.objects,{id:"unrepresented",kind:"person"}]};
 assert.equal((await memoryQuery("robotics patterns","2026-10-13T00:00:00Z",deps({...plan,mode:"reflect"},incomplete))).state,"insufficient_population");
});
test("legacy saved words remain User text with distinct provenance and are suppressed when mapped",()=>{
 const fixture={...data,observations:[],legacyNotes:[{id:"old",personId:"person",artifactId:null,snapshotId:null,body:"Exact legacy robotics words"}]};
 const prior=readCandidates(fixture).candidates[0].evidence[0];assert.equal(prior.layer,"user");assert.equal(prior.provenance.legacyNoteId,"old");assert.equal(prior.provenance.observationId,undefined);
 assert.equal(readCandidates({...fixture,observations:[{...data.observations[0],id:"old",inactive:true}]}).candidates[0].evidence.length,0);
});
test("withdrawn User revisions never appear as current matches and missing labels fail closed",async()=>{
 assert.equal((await memoryQuery("robotics","2026-10-13T00:00:00Z",deps(plan,{...data,observations:[{...data.observations[0],inactive:true}]}))).state,"no_match");
 const missing=deps();missing.labels=async()=>[];assert.equal((await memoryQuery("robotics","2026-10-13T00:00:00Z",missing)).items.length,0);
});

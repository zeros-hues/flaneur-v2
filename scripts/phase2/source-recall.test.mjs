import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
async function load(path){const result=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);}
const {representation}=await load("lib/retrieval/representation.ts"),{parseFingerprint}=await load("lib/processing/parse-input.ts");
const {readCandidates}=await load("lib/retrieval/reader.ts"),{retrieveEvidence,verifiedExcerpt,evidenceSlice}=await load("lib/retrieval/evidence.ts");
const {memoryEvidenceExcerpt}=await load("lib/query/memory.ts"),{answerContext}=await load("lib/retrieval/answer.ts");
const {composeContextualWalk}=await load("lib/walk/contextual.ts");
function fixture(text="Captured 😀 botanical correspondence"){
 const snapshotId=randomUUID(),artifactId=randomUUID(),encounterId=randomUUID(),personId=randomUUID();
 const source={...representation(snapshotId,"linkedin-captured-text-v1:profile_page",text),artifactId,encounterId,
  sourceUrl:"https://www.linkedin.com/in/fixture/",adapterId:"linkedin",kind:"profile_page",contentHash:"a".repeat(64)};
 source.fingerprint=parseFingerprint(source);
 return {source,data:{objects:[{id:artifactId,kind:"artifact"},{id:encounterId,kind:"encounter"},{id:personId,kind:"person"}],
  observations:[],locators:[],facts:[],encounters:[],links:[{encounterId,objectId:personId,relation:"noticed"}],
  capturedSources:[source],derivationHeads:[{snapshotId,fingerprint:source.fingerprint,identityActive:false,identityObservationId:null}]}};
}
test("a capture without notes recalls its Artifact and Encounter without attributing text to a Person",()=>{
 const {data,source}=fixture(),read=readCandidates(data);
 const result=retrieveEvidence({mode:"recall",terms:["botanical"],constraints:[]},read.candidates);
 assert.deepEqual(new Set(result.matches.map(m=>m.candidate.id)),new Set([source.artifactId,source.encounterId]));
 assert.equal(read.population.indexed,2);
 assert.ok(result.matches.every(m=>m.candidate.facts.length===0&&m.candidate.evidence[0].layer==="source"));
});
test("stale heads, changed parser versions, and changed representation text cannot supply source recall",()=>{
 for(const change of [s=>{s.fingerprint="b".repeat(64)},s=>{s.normalizerVersion="old:profile_page"},s=>{s.text+=" invented"},s=>{s.id=randomUUID()}]){
  const {data,source}=fixture();change(source);assert.ok(readCandidates(data).candidates.every(c=>!c.evidence.length));
 }
 const {data}=fixture();data.derivationHeads=[];assert.ok(readCandidates(data).candidates.every(c=>!c.evidence.length));
});
test("identity proof changes withdraw old source eligibility without making source text Person facts",()=>{
 const {data,source}=fixture(),proof=randomUUID();data.derivationHeads[0].identityActive=true;data.derivationHeads[0].identityObservationId=proof;
 assert.ok(readCandidates(data).candidates.every(c=>!c.evidence.length));
 source.fingerprint=parseFingerprint({...source,identityObservationId:proof});data.derivationHeads[0].fingerprint=source.fingerprint;
 assert.equal(readCandidates(data).population.indexed,2);
});
test("separate captures of one Artifact preserve separate source versions",()=>{
 const {data,source}=fixture();const second=fixture("Earlier captured mycology");
 second.source.artifactId=source.artifactId;data.capturedSources.push(second.source);data.derivationHeads.push(...second.data.derivationHeads);
 const read=readCandidates(data),artifact=read.candidates.find(c=>c.id===source.artifactId);
 assert.equal(artifact.evidence.length,2);assert.notEqual(artifact.evidence[0].id,artifact.evidence[1].id);
 assert.equal(retrieveEvidence({mode:"recall",terms:["mycology"],constraints:[]},[artifact]).state,"matched");
});
test("display and answer excerpts keep exact Unicode code-point locators, including repeated text",()=>{
 const text="😀".repeat(2200)+"needle botanical "+"😀".repeat(2200),{data}=fixture(text);
 const evidence=readCandidates(data).candidates.find(c=>c.evidence.length).evidence[0];
 const excerpt=memoryEvidenceExcerpt(evidence,["needle"],600);
 for(const item of [excerpt,evidenceSlice(excerpt,20,100),answerContext([evidence]).evidence[0]])
  assert.equal(verifiedExcerpt(text,item.provenance.startCodepoint,item.provenance.endCodepoint,item.text),true);
 assert.ok(excerpt.text.includes("needle"));assert.equal(Array.from(excerpt.text).length,600);
});
test("captured source text can support contextual resurfacing without a user note",()=>{
 const {data,source}=fixture(),candidate=readCandidates(data).candidates.find(c=>c.id===source.artifactId);
 const selected=composeContextualWalk([{...candidate,kind:"artifact",label:"Source",savedAt:"2026-10-17T00:00:00Z",lastEncounterAt:null,encounterCount:1}],
  {referenceInstant:"2026-10-17T12:00:00Z",context:"botanical"});
 assert.equal(selected.length,1);assert.ok(selected[0].selectionSupport.some(e=>e.provenance.representationId===source.id));
 assert.ok(selected[0].reasons.every(reason=>reason.code!=="user_words"));
});
test("unsafe source URLs cannot become clickable provenance",()=>{
 const {data,source}=fixture();source.sourceUrl="https://owner:secret@example.test/";source.fingerprint=parseFingerprint(source);
 data.derivationHeads[0].fingerprint=source.fingerprint;
 assert.ok(readCandidates(data).candidates.filter(c=>c.evidence.length).every(c=>!c.evidence[0].provenance.sourceUrl));
});

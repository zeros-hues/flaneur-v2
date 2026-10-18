import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const cache=resolve("node_modules/.cache/flaneur");mkdirSync(cache,{recursive:true});
async function component(path,name){
 const outfile=resolve(cache,`trail-${name}.cjs`);
 await build({entryPoints:[path],outfile,bundle:true,platform:"node",format:"cjs",packages:"external",loader:{".css":"empty"},jsx:"automatic",logLevel:"silent"});
 return createRequire(import.meta.url)(outfile)[name];
}
const MemoryTrail=await component("components/inspection/MemoryTrail.tsx","MemoryTrail"),Archive=await component("app/person/[id]/archive.tsx","Archive");
const root={id:randomUUID(),kind:"concept",label:"idea",conceptKind:"topic",archived:false,encounters:[],artifacts:[],nextEncounter:null,nextArtifact:null,observationPage:null};
const render=view=>renderToStaticMarkup(React.createElement(MemoryTrail,{view,query:{}}));
test("Concept trail keeps source-authored hashtags distinct from inferred legacy associations",()=>{
 const html=render({...root,artifacts:["hashtag","inferred"].map(association=>({id:randomUUID(),type:"article",text:'<script>😀</script>',clipped:false,capturedAt:"2026-01-01",association}))});
 assert.match(html,/Source-authored hashtag association/);assert.match(html,/Inferred concept association/);assert.match(html,/legacy; unverified/);
 assert.match(html,/&lt;script&gt;😀&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/href="\/artifact\//);
 assert.doesNotMatch(html,/999999|often found with|appears in \d/);
});
test("Person associations and shared Encounter links do not claim authorship",()=>{
 const person=randomUUID(),encounter=randomUUID(),artifact=randomUUID();
 const html=render({...root,kind:"person",artifacts:[{id:artifact,type:"project",text:"A project",capturedAt:"2026-01-01",association:"legacy_person"}],
  encounters:[{id:encounter,kind:"captured",occurredAt:"2026-01-02",context:"  why 😀  ",direct:true,links:[{id:person,kind:"person",label:"Recorded Person",relation:"related"}]}]});
 assert.match(html,/authorship is not established/);assert.match(html,/related:/);assert.match(html,/href="\/encounter\//);assert.match(html,/href="\/person\//);
 assert.ok(html.includes('  why 😀  '));
});
test("Concept assertions display truth layer, inactive history and contradicting evidence separately",()=>{
 const observation={id:randomUUID(),bodyText:"Uncertain idea",layer:"inferred",semanticRole:"classification",supportStatus:"partial",active:false,
  evidence:[{id:randomUUID(),quote:"Contrary text",role:"contradicts",quoteVerified:true,snapshotId:randomUUID()}],reviews:[]};
 const html=render({...root,observationPage:{observations:[observation]}});
 assert.match(html,/Inference/);assert.match(html,/historical \/ inactive/);assert.match(html,/contradicts/);assert.match(html,/not the assertion or association/);
 assert.match(html,/href="\/snapshot\//);
});
test("Earlier generated Person context is collapsed, labelled and escaped",()=>{
 const html=renderToStaticMarkup(React.createElement(Archive,{view:{roles:[],schools:[],synthesis:'  <script>generated 😀</script>  '}}));
 assert.match(html,/<details/);assert.doesNotMatch(html,/<details[^>]*\sopen/);assert.match(html,/unverified/);assert.match(html,/Inference/);
 assert.ok(html.includes('  &lt;script&gt;generated 😀&lt;/script&gt;  '));
});
test("Pagination retains independent cursors and unknown coverage stays explicit",()=>{
 const html=render({...root,nextEncounter:randomUUID(),nextArtifact:randomUUID()});
 assert.match(html,/encounters=/);assert.match(html,/artifacts=/);assert.match(html,/historical backfill/);
});
test("Ambiguous pagination parameters fail validation",async()=>{
 const out=await build({entryPoints:["lib/trail/params.ts"],bundle:true,write:false,platform:"node",format:"esm"});
 const {trailQuery}=await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString("base64")}`);
 for(const value of [[randomUUID()],"invalid",""])assert.throws(()=>trailQuery({encounters:value}));
 const id=randomUUID().toUpperCase();assert.deepEqual(trailQuery({artifacts:id,ignored:"anything"}),{artifacts:id.toLowerCase()});
});

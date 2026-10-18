import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
async function load(path){const out=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString("base64")}`);}
const {capturedMarkup,inspectionOffset,safeSourceUrl,SOURCE_VIEW_MAX}=await load("lib/inspection/source.ts"),{snapshotDownload}=await load("lib/inspection/download.ts");
test("captured markup remains exact plain text with Unicode-safe complete pagination",()=>{
 const text="<script>window.fixture=true</script>😀"+"尾".repeat(10000),bytes=gzipSync(text);
 const first=capturedMarkup(bytes,0),next=capturedMarkup(bytes,first.nextOffset);assert.equal(first.state,"text");
 assert.equal(first.text+next.text,text);assert.equal(next.nextOffset,null);assert.equal(Array.from(first.text).length,10000);
});
test("bad gzip, invalid UTF-8 and oversized expansion are explicit unavailable states",()=>{
 for(const bytes of [new Uint8Array([1,2]),gzipSync(new Uint8Array([255])),gzipSync("x".repeat(SOURCE_VIEW_MAX+1))])assert.equal(capturedMarkup(bytes,0).state,"unavailable");
 assert.throws(()=>capturedMarkup(gzipSync("x"),2),/OFFSET_INVALID/);
});
test("offsets and source URLs reject unsafe or ambiguous input",()=>{
 for(const value of ["-1","1.5","20000001",["0"],"0;select"])assert.throws(()=>inspectionOffset(value));
 for(const value of ["javascript:alert(1)","file:///private","https://password:secret@example.test/"])assert.equal(safeSourceUrl(value),null);
 assert.equal(safeSourceUrl("https://example.test/source"),"https://example.test/source");
});
test("source download authorization precedes validation and byte reads",async()=>{
 const handler=snapshotDownload({authorize:async()=>Response.json({error:"unauthorised"},{status:401}),read:()=>assert.fail("must not read")});
 assert.equal((await handler(new Request("https://example.test/"),"invalid")).status,401);
});
test("original compressed bytes are a private attachment; errors expose no raw content",async()=>{
 const bytes=gzipSync("<script>private fixture</script>"),id=randomUUID(),request=new Request("https://example.test/");
 const handler=snapshotDownload({authorize:async()=>null,read:async()=>bytes}),response=await handler(request,id);
 assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");assert.equal(response.headers.get("content-type"),"application/gzip");
 assert.match(response.headers.get("content-disposition"),/attachment/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
 const failed=snapshotDownload({authorize:async()=>null,read:async()=>{throw new Error("PRIVATE_SQL_PASSWORD");}});
 assert.deepEqual(await(await failed(request,id)).json(),{error:"source_unavailable"});
});
test("the real inspection component escapes captured script markup instead of executing it",async()=>{
 const cache=resolve("node_modules/.cache/flaneur");mkdirSync(cache,{recursive:true});const outfile=resolve(cache,"memory-detail-render.cjs");
 await build({entryPoints:["components/inspection/MemoryDetail.tsx"],outfile,bundle:true,platform:"node",format:"cjs",packages:"external",loader:{".css":"empty"},jsx:"automatic",logLevel:"silent"});
 const {MemoryDetail}=createRequire(import.meta.url)(outfile),text='<script>window.fixture=true</script>😀';
 const detail={id:randomUUID(),kind:"artifact",archived:false,artifact:{type:"article",text,sourceUrl:null,capturedAt:"2026-10-13T00:00:00Z",nextOffset:null,legacyPersonId:null},encounter:null,
 sources:[],encounters:[],links:[],observations:[],nextSnapshot:null,nextEncounter:null,nextObservation:null};
 const html=renderToStaticMarkup(React.createElement(MemoryDetail,{detail,query:{}}));
 assert.ok(html.includes('&lt;script&gt;window.fixture=true&lt;/script&gt;'));assert.equal(html.includes('<script>window.fixture'),false);assert.ok(html.includes('😀'));
});

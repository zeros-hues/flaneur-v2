import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
async function load(path){const result=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);}
const {captureSourcePlan}=await load("lib/capture/source-plan.ts"),{captureV2}=await load("lib/capture/v2-contract.ts");
const body=()=>({version:2,requestId:randomUUID(),adapterId:"linkedin",kind:"profile_page",sourceUrl:"https://www.linkedin.com/in/fixture/",html:"<main>source</main>",reasonForNoticing:null,urn:null,extensionVersion:"fixture",clientCapturedAt:"2026-10-17T00:00:00Z"});
test("an exact profile document can recur without equating its page identity to a Person",()=>{
 const input=body(),first=captureSourcePlan(input,randomUUID()),second=captureSourcePlan(input,randomUUID());
 assert.equal(first.migrationKey,second.migrationKey);assert.equal(first.basis,"exact_profile_url");assert.equal(first.type,"profile_page");assert.equal("personId" in first,false);
});
test("meaningful URL variants remain distinct and long URLs have bounded index keys",()=>{
 const input=body(),plan=captureSourcePlan(input,randomUUID());
 for(const suffix of ["?section=education","#roles","?query="+"x".repeat(7000)]){
  const variant=captureSourcePlan({...input,sourceUrl:input.sourceUrl+suffix},randomUUID());assert.notEqual(variant.externalKey,plan.externalKey);
  assert.equal(variant.externalKey.length,64);assert.equal(variant.sourceUrl,input.sourceUrl+suffix);
 }
});
test("stable post URNs share a source across feed locations while URN namespaces stay distinct",()=>{
 const input={...body(),kind:"social_post",sourceUrl:"https://www.linkedin.com/feed/",urn:"urn:li:activity:123"};
 const first=captureSourcePlan(input,randomUUID()),direct=captureSourcePlan({...input,urn:null,sourceUrl:"https://www.linkedin.com/feed/update/urn:li:activity:123/?tracking=one"},randomUUID());
 assert.equal(first.migrationKey,direct.migrationKey);assert.equal(first.sourceUrl,"https://www.linkedin.com/feed/update/urn:li:activity:123/");
 assert.notEqual(first.externalKey,captureSourcePlan({...input,urn:"urn:li:ugcPost:123"},randomUUID()).externalKey);
});
test("unidentified feed cards and conflicting identifiers never collapse by feed URL or content",()=>{
 const input={...body(),kind:"social_post",sourceUrl:"https://www.linkedin.com/feed/"};
 assert.notEqual(captureSourcePlan(input,randomUUID()).migrationKey,captureSourcePlan(input,randomUUID()).migrationKey);
 for(const change of [{urn:"urn:li:comment:123"},{sourceUrl:"https://www.linkedin.com/feed/update/urn:li:activity:1/",urn:"urn:li:activity:2"}])
  assert.equal(captureSourcePlan({...input,...change},randomUUID()).basis,"snapshot_only");
});
test("a capture kind alone cannot turn an unrelated URL into a shared profile identity",()=>{
 assert.equal(captureSourcePlan({...body(),sourceUrl:"https://www.linkedin.com/feed/"},randomUUID()).basis,"snapshot_only");
 assert.equal(captureV2.safeParse({...body(),kind:"social_post",urn:"urn:li:activity:"+"1".repeat(300)}).success,false);
});
test("the retired legacy rebuild exits before connecting to any database",async()=>{
 const output=await build({entryPoints:["scripts/reparse.ts"],bundle:true,write:false,platform:"node",format:"esm"});
 const result=spawnSync(process.execPath,["--input-type=module","-e",output.outputFiles[0].text],{encoding:"utf8",env:{...process.env,DATABASE_URL:"invalid-fixture-setting"}});
 assert.equal(result.status,1);assert.equal(JSON.parse(result.stderr).code,"LEGACY_REPARSE_RETIRED");
});

import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const output=await build({entryPoints:["lib/query/handler.ts"],bundle:true,write:false,platform:"node",format:"esm"});
const {memoryQueryHandler}=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
function request(body,headers={}){return new Request("https://example.test/api/query",{method:"POST",headers:{"content-type":"application/json",...headers},body:typeof body==="string"?body:JSON.stringify(body)});}
test("owner authorization precedes parsing or provider execution",async()=>{
 const handler=memoryQueryHandler({authorize:async()=>Response.json({error:"unauthorised"},{status:401}),run:async()=>assert.fail("provider must not run")});
 assert.equal((await handler(request("invalid"))).status,401);
 const blocked=memoryQueryHandler({authorize:async()=>Response.json({error:"origin_not_allowed"},{status:403}),run:async()=>assert.fail("provider must not run")});
 assert.equal((await blocked(request({query:"robotics"}))).status,403);
});
test("strict query envelopes reject invalid content, UTF-8, and caller supplied plans",async()=>{
 const handler=memoryQueryHandler({authorize:async()=>null,run:async()=>assert.fail("provider must not run")});
 for(const body of [{query:""},{query:"x".repeat(501)},{query:"robotics",plan:{}},"{"]){assert.equal((await handler(request(body))).status,400);}
 assert.equal((await handler(request({query:"robotics"},{"content-type":"text/plain"}))).status,415);
 const bad=request("x");const malformed=new Request(bad.url,{method:"POST",headers:bad.headers,body:new Uint8Array([255])});
 assert.equal((await handler(malformed)).status,400);
});
test("actual streamed byte bounds cannot be bypassed by content length",async()=>{
 const handler=memoryQueryHandler({authorize:async()=>null,run:async()=>assert.fail("provider must not run")});
 assert.equal((await handler(request(" ".repeat(8193),{"content-length":"1"}))).status,413);
});
test("valid escaped queries retain text; provider failures stay private",async()=>{
 let observed;const handler=memoryQueryHandler({authorize:async()=>null,run:async query=>{observed=query;return {blocks:[]};}});
 const result=await handler(request('{"query":"'+String.raw`\u5c3e`.repeat(500)+'"}'));
 assert.equal(result.status,200);assert.equal(observed,"尾".repeat(500));assert.equal(result.headers.get("cache-control"),"no-store");
 const failed=memoryQueryHandler({authorize:async()=>null,run:async()=>{throw new Error("PRIVATE_PROVIDER_SECRET");}});
 const response=await failed(request({query:"robotics"}));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"query_unavailable"});
});

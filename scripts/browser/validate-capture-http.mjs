import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

// Built Next app, synthetic credentials and deliberately unreachable fixture database only.
// Synthetic activation checks cannot reach a real database or submit a real capture.
const controlled=process.argv.includes("--controlled");
const reservation=createServer();
await new Promise((resolve,reject)=>{reservation.once("error",reject);reservation.listen(0,"127.0.0.1",resolve);});
const port=reservation.address().port;
await new Promise(resolve=>reservation.close(resolve));
const fixtureDatabase="postgres://fixture:fixture@127.0.0.1:1/flaneur_fixture";
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{
  stdio:["ignore","pipe","pipe"],env:{...process.env,CAPTURE_SECRET:"capture-http-synthetic-fixture",CAPTURE_V2_ENABLED:controlled?"true":"false",CAPTURE_V2_ACTIVATED_AT:"2026-10-19T00:00:00Z",CAPTURE_V2_ALLOWED_HOSTS:"controlled.example.test",DATABASE_URL:fixtureDatabase,DIRECT_URL:fixtureDatabase},
});
try {
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("START_TIMEOUT")),20000);
    const ready=chunk=>{if(String(chunk).includes("Ready")){clearTimeout(timer);resolve();}};
    child.stdout.on("data",ready);
    child.stderr.on("data",()=>{}); // Never print application error details or environment values.
    child.once("error",()=>{clearTimeout(timer);reject(new Error("START_FAILED"));});
    child.once("exit",()=>{clearTimeout(timer);reject(new Error("START_FAILED"));});
  });
  let checks=0;
  const endpoint=`http://127.0.0.1:${port}/api/capture/v2`;
  for(const [secret,status,error] of [[null,401,"unauthorised"],["wrong-fixture",401,"unauthorised"],["capture-http-synthetic-fixture",controlled?400:503,controlled?"invalid_capture":"capture_v2_disabled"]]) {
    const headers={"content-type":"application/json"};if(secret)headers["x-capture-secret"]=secret;
    const response=await fetch(endpoint,{method:"POST",headers,body:"{malformed fixture"});
    assert.equal(response.status,status);checks++;
    assert.deepEqual(await response.json(),{error});checks++;
    assert.equal(response.headers.get("cache-control"),"no-store");checks++;
    assert.equal(response.headers.get("x-content-type-options"),"nosniff");checks++;
    assert.equal(response.headers.get("access-control-allow-origin"),null);checks++;
  }
  const get=await fetch(endpoint);assert.equal(get.status,405);checks++;await get.arrayBuffer();
  const preflight=await fetch(endpoint,{method:"OPTIONS",headers:{origin:"https://example.test","access-control-request-method":"POST"}});
  assert.match(preflight.headers.get("allow"),/POST/);checks++;
  assert.equal(preflight.headers.get("access-control-allow-origin"),null);checks++;await preflight.arrayBuffer();
  if(controlled){
    const forbidden=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-capture-secret':'capture-http-synthetic-fixture'},body:JSON.stringify({version:2,requestId:crypto.randomUUID(),adapterId:'web',kind:'article',sourceUrl:'https://unapproved.example.test/',html:'<article data-flaneur-source="web">Source</article>',reasonForNoticing:null,urn:null,extensionVersion:'fixture',clientCapturedAt:new Date().toISOString()})});
    assert.equal(forbidden.status,403);checks++;assert.deepEqual(await forbidden.json(),{error:'capture_source_not_enabled'});checks++;
    const legacy=await fetch(`http://127.0.0.1:${port}/api/capture`,{method:'POST',headers:{'x-capture-secret':'capture-http-synthetic-fixture'},body:'not a legacy capture'});
    assert.equal(legacy.status,410);checks++;assert.deepEqual(await legacy.json(),{error:'legacy_capture_disabled_use_v2'});checks++;
  }
  console.log(JSON.stringify({status:"capture_http_validation_passed",checks,synthetic_credentials:true,capture_enabled:controlled,real_database_connected:false}));
}catch {
  console.error(JSON.stringify({status:"failed",code:"CAPTURE_HTTP_VALIDATION_FAILED"}));process.exitCode=1;
}finally {
  if(child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{child.once("exit",resolve);child.kill();});
}

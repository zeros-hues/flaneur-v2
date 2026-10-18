import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

// Built Next app, synthetic credentials and deliberately unreachable fixture database only.
// This script cannot enable capture or submit an authenticated real capture.
const reservation=createServer();
await new Promise((resolve,reject)=>{reservation.once("error",reject);reservation.listen(0,"127.0.0.1",resolve);});
const port=reservation.address().port;
await new Promise(resolve=>reservation.close(resolve));
const fixtureDatabase="postgres://fixture:fixture@127.0.0.1:1/flaneur_fixture";
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{
  stdio:["ignore","pipe","pipe"],env:{...process.env,CAPTURE_SECRET:"capture-http-synthetic-fixture",CAPTURE_V2_ENABLED:"false",DATABASE_URL:fixtureDatabase,DIRECT_URL:fixtureDatabase},
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
  for(const [secret,status,error] of [[null,401,"unauthorised"],["wrong-fixture",401,"unauthorised"],["capture-http-synthetic-fixture",503,"capture_v2_disabled"]]) {
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
  console.log(JSON.stringify({status:"capture_http_validation_passed",checks,synthetic_credentials:true,capture_enabled:false,real_database_connected:false}));
}catch {
  console.error(JSON.stringify({status:"failed",code:"CAPTURE_HTTP_VALIDATION_FAILED"}));process.exitCode=1;
}finally {
  if(child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{child.once("exit",resolve);child.kill();});
}

import assert from "node:assert/strict";
import { createServer } from "node:https";
import { spawn,execFileSync } from "node:child_process";
import { existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,copyFileSync,rmSync } from "node:fs";
import { resolve,join,sep } from "node:path";
import { createRequire } from "node:module";
import { randomUUID,createHash,X509Certificate } from "node:crypto";
import { build } from "esbuild";
const WebSocket=createRequire(import.meta.url)("next/dist/compiled/ws");
const cache=resolve("node_modules/.cache/flaneur");mkdirSync(cache,{recursive:true});
const work=mkdtempSync(join(cache,"installed-extension-")),profile=join(work,"profile"),extension=join(work,"extension");mkdirSync(extension);
let browser,server,ws,seq=0,stage="setup",checks=0,extensionId,pageSession,optionsSession;
const pending=new Map(),listeners=new Map(),contexts=new Map(),versions=new Map(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let mode="offline",accepted=new Map(),requests=[],restartReloadRequired=false;
const syntheticSecret="installed-extension-synthetic-only";
function on(method,fn){const list=listeners.get(method)??[];list.push(fn);listeners.set(method,list);}
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{
 const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error("CDP_TIMEOUT"));},15000);
 pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:()=>{clearTimeout(timer);reject(new Error("CDP_FAILED"));}});
 ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
});}
async function evaluate(expression,sessionId=optionsSession,contextId){
 const result=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true,...(contextId?{contextId}:{})},sessionId);
 if(result.exceptionDetails)throw new Error("EVALUATION_FAILED");return result.result.value;
}
async function until(work){for(let i=0;i<100;i++){if(await work())return;await sleep(100);}throw new Error("CONDITION_TIMEOUT");}
async function attach(targetId){const {sessionId}=await call("Target.attachToTarget",{targetId,flatten:true});await call("Runtime.enable",{},sessionId);return sessionId;}
async function storage(){return evaluate("chrome.storage.local.get(null)");}
async function message(body){return evaluate(`chrome.runtime.sendMessage(${JSON.stringify(body)})`);}
async function state(id){return evaluate(`chrome.storage.local.get(${JSON.stringify(["flaneur-saved-v2:"+id,"flaneur-outbox-v2:"+id])}).then(records=>records[${JSON.stringify("flaneur-saved-v2:"+id)}]?'saved':records[${JSON.stringify("flaneur-outbox-v2:"+id)}]?.state??'unknown')`);}
const root="document.querySelector('flaneur-ui').shadowRoot";
async function saveProfile(){
 await evaluate(`${root}.querySelector('.trigger').click()`,pageSession);
 await evaluate(`${root}.querySelector('textarea').value='  Exact installed reason 😀  ';${root}.querySelector('form').requestSubmit()`,pageSession);
 await until(()=>evaluate(`${root}.querySelector('.confirmed')!==null||${root}.querySelector('.error')?.hidden===false`,pageSession));
 return evaluate(`${root}.querySelector('.confirmed')?.textContent??${root}.querySelector('.error')?.textContent`,pageSession);
}
async function closeOverlay(){await until(()=>evaluate(`${root}.querySelector('form')===null`,pageSession));}
async function launch(){
 const executable="C:/Program Files/Google/Chrome/Application/chrome.exe";assert.ok(existsSync(executable));
 const spki=createHash("sha256").update(new X509Certificate(readFileSync(join(work,"cert.pem"))).publicKey.export({type:"spki",format:"der"})).digest("base64");
 rmSync(join(profile,"DevToolsActivePort"),{force:true});
 browser=spawn(executable,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--disable-background-networking","--enable-unsafe-extension-debugging","--remote-debugging-port=0",`--ignore-certificate-errors-spki-list=${spki}`,`--user-data-dir=${profile}`,"about:blank"],{windowsHide:true,stdio:"ignore"});browser.on("error",()=>{});
 const portFile=join(profile,"DevToolsActivePort");for(let i=0;i<150&&!existsSync(portFile);i++)await sleep(100);assert.ok(existsSync(portFile));
 const [port,path]=readFileSync(portFile,"utf8").trim().split(/\r?\n/);
 ws=new WebSocket(`ws://127.0.0.1:${port}${path}`);await new Promise((resolve,reject)=>{ws.once("open",resolve);ws.once("error",reject);});
 ws.on("message",raw=>{const data=JSON.parse(String(raw));if(data.id){const promise=pending.get(data.id);if(!promise)return;pending.delete(data.id);return data.error?promise.reject():promise.resolve(data.result);}
  for(const listener of listeners.get(data.method)??[])listener(data.params,data.sessionId);
 });
 return port;
}
async function stopBrowser(){if(ws?.readyState===WebSocket.OPEN)try{await call("Browser.close");}catch{}ws?.close();
 if(browser&&browser.exitCode===null)await Promise.race([new Promise(resolve=>browser.once("exit",resolve)),sleep(5000)]);
 if(browser&&browser.exitCode===null&&browser.signalCode===null)await new Promise(resolve=>{browser.once("exit",resolve);browser.kill();});
 for(const promise of pending.values())promise.reject();pending.clear();
}
async function openSource(){
 const {targetId}=await call("Target.createTarget",{url:"about:blank"});pageSession=await attach(targetId);
 await call("Page.enable",{},pageSession);await call("ServiceWorker.enable",{},pageSession);await call("Fetch.enable",{patterns:[{urlPattern:"*"}]},pageSession);
 await call("Page.navigate",{url:"https://www.linkedin.com/in/flaneur-installed-fixture/"},pageSession);
 await until(()=>evaluate("document.querySelector('flaneur-ui')!==null",pageSession));return targetId;
}
async function configureSecret(secret){
 await evaluate(`document.querySelector('#secret').value=${JSON.stringify(secret)};document.querySelector('form').requestSubmit()`);
 await until(()=>evaluate("document.querySelector('#secret').value===''"));
}
async function retryFromOptions(id){
 const selector=`[data-request-id="${id}"] button`;
 await evaluate("document.querySelector('#refresh').click()");
 await until(async()=>await state(id)==="saved"||await evaluate(`document.querySelector(${JSON.stringify(selector)})!==null`));
 if(await state(id)!=="saved")await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
try {
 const openssl="C:/Program Files/Git/usr/bin/openssl.exe";assert.ok(existsSync(openssl));
 execFileSync(openssl,["req","-x509","-newkey","rsa:2048","-nodes","-keyout",join(work,"key.pem"),"-out",join(work,"cert.pem"),"-days","1","-subj","/CN=localhost","-addext","subjectAltName=IP:127.0.0.1"],{stdio:"ignore",windowsHide:true});
 server=createServer({key:readFileSync(join(work,"key.pem")),cert:readFileSync(join(work,"cert.pem"))},async(req,res)=>{
  if(req.url!=="/api/capture/v2"){res.writeHead(404);return res.end();}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{res.writeHead(400);return res.end();}
  requests.push(body);res.setHeader("content-type","application/json");
  if(req.headers["x-capture-secret"]!==syntheticSecret){res.writeHead(401);return res.end('{}');}
  if(mode==="offline"){req.socket.destroy();return;}
  let ack=accepted.get(body.requestId);if(!ack){ack={version:2,state:"saved",requestId:body.requestId,snapshotId:randomUUID(),encounterId:randomUUID(),processing:"queued",replayed:false};accepted.set(body.requestId,ack);}else ack={...ack,replayed:true};
  if(mode==="lose_ack"){mode="online";req.socket.destroy();return;}res.end(JSON.stringify(ack));
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`https://127.0.0.1:${server.address().port}`;
 const manifest=JSON.parse(readFileSync("extension/manifest.json","utf8"));manifest.host_permissions=[origin+"/*"];
 writeFileSync(join(extension,"manifest.json"),JSON.stringify(manifest));copyFileSync("extension/options.html",join(extension,"options.html"));
 await build({entryPoints:{background:"extension/background.ts",options:"extension/options.ts",content:"extension/content/index.ts"},outdir:extension,bundle:true,platform:"browser",format:"iife",target:"chrome120",loader:{".woff2":"binary"},define:{__APP_URL__:JSON.stringify(origin)},logLevel:"silent"});
 stage="launch";await launch();
 stage="load_unpacked";({id:extensionId}=await call("Extensions.loadUnpacked",{path:extension}));assert.ok(extensionId);checks++;
 const {targetId:optionsTarget}=await call("Target.createTarget",{url:`chrome-extension://${extensionId}/options.html`});optionsSession=await attach(optionsTarget);
 await until(()=>evaluate("document.querySelector('#secret')!==null"));
 stage="configure_synthetic_access";await evaluate(`document.querySelector('#secret').value=${JSON.stringify(syntheticSecret)};document.querySelector('form').requestSubmit()`);
 await until(()=>evaluate("document.querySelector('#status').textContent.includes('Access saved')"));checks++;
 const {targetId:pageTarget}=await call("Target.createTarget",{url:"about:blank"});pageSession=await attach(pageTarget);
 on("Runtime.executionContextCreated",(params,session)=>{if(session===pageSession)contexts.set(params.context.id,params.context);});
 on("ServiceWorker.workerVersionUpdated",params=>{for(const version of params.versions)versions.set(version.versionId,version);});
 on("Fetch.requestPaused",(params,session)=>{
  if(session!==pageSession)return;
  const body='<!doctype html><main id="workspace"><section aria-label="Primary content"><h2>Installed synthetic profile</h2><p>'+"x".repeat(9000)+'😀</p></section></main>';
  void (params.request.url==="https://www.linkedin.com/in/flaneur-installed-fixture/"?
   call("Fetch.fulfillRequest",{requestId:params.requestId,responseCode:200,responseHeaders:[{name:"content-type",value:"text/html"}],body:Buffer.from(body).toString("base64")},session):
   call("Fetch.failRequest",{requestId:params.requestId,errorReason:"BlockedByClient"},session)).catch(()=>{});
 });
 await call("Page.enable",{},pageSession);await call("ServiceWorker.enable",{},pageSession);await call("Fetch.enable",{patterns:[{urlPattern:"*"}]},pageSession);
 stage="real_content_script";await call("Page.navigate",{url:"https://www.linkedin.com/in/flaneur-installed-fixture/"},pageSession);
 await until(()=>evaluate("document.querySelector('flaneur-ui')!==null",pageSession));checks++;
 stage="offline_queue";assert.match(await saveProfile(),/Queued on this device/);checks++;
 const queued=Object.entries(await storage()).find(([key])=>key.startsWith("flaneur-outbox-v2:"));assert.ok(queued);const requestId=queued[1].requestId,original=queued[1].payload;
 assert.equal(original.reasonForNoticing,"  Exact installed reason 😀  ");checks++;
 await until(async()=>(await storage())[queued[0]].attempts>=1);assert.equal(await state(requestId),"queued");checks++;
 stage="content_storage_isolation";
 let isolated;
 for(const [id,context] of contexts){if(context.auxData?.isDefault)continue;try{if(await evaluate(`globalThis.chrome?.runtime?.id===${JSON.stringify(extensionId)}`,pageSession,id)){isolated=id;break;}}catch{}}
 assert.ok(isolated);checks++;
 assert.equal(await evaluate("(async()=>{try{await chrome.storage.local.get(null);return false;}catch{return true;}})()",pageSession,isolated),true);checks++;
 assert.equal(await evaluate("chrome.runtime.sendMessage({kind:'capture-list'}).then(value=>value?.ok!==true,()=>true)",pageSession,isolated),true);checks++;
 stage="service_worker_stop";
 await until(async()=>[...versions.values()].some(v=>v.scriptURL===`chrome-extension://${extensionId}/background.js`&&v.runningStatus==="running"));
 const worker=[...versions.values()].find(v=>v.scriptURL===`chrome-extension://${extensionId}/background.js`&&v.runningStatus==="running");
 await call("ServiceWorker.stopWorker",{versionId:worker.versionId},pageSession);
 await until(async()=>!(await call("Target.getTargets")).targetInfos.some(t=>t.type==="service_worker"&&t.url===worker.scriptURL));checks++;
 assert.equal(await state(requestId),"queued");checks++;
 stage="wake_and_lost_ack";mode="lose_ack";
 const resumed=await message({kind:"capture-resume",requestId});assert.equal(resumed.ok,true);checks++;
 await until(async()=>accepted.has(requestId));assert.equal(await state(requestId),"queued");checks++;
 await until(async()=>(await storage())[queued[0]]?.attempts>=2);
 await message({kind:"capture-resume",requestId});await until(async()=>await state(requestId)==="saved");checks++;
 assert.equal(accepted.size,1);assert.ok(requests.every(body=>body.requestId===requestId&&JSON.stringify(body)===JSON.stringify(original)));checks+=2;
 stage="alarm_recreation";await evaluate("chrome.alarms.clear('flaneur-delivery-v2')");
 const running=[...versions.values()].find(v=>v.scriptURL===worker.scriptURL&&v.runningStatus==="running");
 assert.ok(running);await call("ServiceWorker.stopWorker",{versionId:running.versionId},pageSession);
 await until(async()=>!(await call("Target.getTargets")).targetInfos.some(t=>t.type==="service_worker"&&t.url===worker.scriptURL));
 await message({kind:"capture-list"});await until(()=>evaluate("chrome.alarms.get('flaneur-delivery-v2').then(Boolean)"));checks++;
 stage="quota_failure";await closeOverlay();mode="offline";await saveProfile();await closeOverlay();
 const before=await storage(),count=Object.keys(before).filter(key=>key.startsWith("flaneur-outbox-v2:")).length;
 await evaluate("(async()=>{const used=await chrome.storage.local.getBytesInUse(null);await chrome.storage.local.set({fixtureQuotaFill:'x'.repeat(chrome.storage.local.QUOTA_BYTES-used-2048)});})()");
 assert.match(await saveProfile(),/Could not store/);checks++;
 const after=await storage();assert.equal(Object.keys(after).filter(key=>key.startsWith("flaneur-outbox-v2:")).length,count);checks++;
 assert.equal(after[Object.keys(before).find(key=>key.startsWith("flaneur-outbox-v2:"))].payload.html, before[Object.keys(before).find(key=>key.startsWith("flaneur-outbox-v2:"))].payload.html);checks++;
 await evaluate("chrome.storage.local.remove('fixtureQuotaFill')");
 stage="alarm_wake_without_source_tab";
 const pendingId=Object.values(before).find(value=>value&&typeof value==="object"&&value.state==="queued"&&value.payload)?.requestId;assert.ok(pendingId);
 await evaluate("chrome.alarms.create('flaneur-delivery-v2',{when:Date.now()+1500})");mode="online";
 const live=[...versions.values()].find(v=>v.scriptURL===worker.scriptURL&&v.runningStatus==="running");assert.ok(live);
 await call("ServiceWorker.stopWorker",{versionId:live.versionId},pageSession);
 for(const target of (await call("Target.getTargets")).targetInfos){if(target.type==="page"&&(target.url.startsWith("chrome-extension://")||target.url.startsWith("https://www.linkedin.com/")))await call("Target.closeTarget",{targetId:target.targetId});}
 await until(async()=>accepted.has(pendingId));checks++;
 const reopened=await call("Target.createTarget",{url:`chrome-extension://${extensionId}/options.html`});optionsSession=await attach(reopened.targetId);
 await until(()=>evaluate("document.querySelector('#secret')!==null"));await until(async()=>await state(pendingId)==="saved");checks++;
 stage="restart_queue_capture";mode="offline";await openSource();await saveProfile();await closeOverlay();
 const persistedEntry=Object.entries(await storage()).find(([key])=>key.startsWith("flaneur-outbox-v2:"));assert.ok(persistedEntry);
 const restartId=persistedEntry[1].requestId,restartPayload=persistedEntry[1].payload;
 await until(async()=>(await storage())[persistedEntry[0]]?.attempts>=1);
 stage="restart_close_browser";await stopBrowser();contexts.clear();versions.clear();stage="restart_launch_browser";await launch();
 stage="restart_installed_catalog";const installed=await call("Extensions.getExtensions");
 if(!installed.extensions.some(item=>item.id===extensionId)){
  restartReloadRequired=true;const loaded=await call("Extensions.loadUnpacked",{path:extension});assert.equal(loaded.id,extensionId);
 }
 checks++;
 const restoredOptions=await call("Target.createTarget",{url:`chrome-extension://${extensionId}/options.html`});optionsSession=await attach(restoredOptions.targetId);
 stage="restart_options_ready";await until(()=>evaluate("document.querySelector('#secret')!==null"));
 assert.deepEqual((await storage())[persistedEntry[0]].payload,restartPayload);checks++;
 assert.equal(await evaluate("chrome.storage.local.get('captureSecret').then(v=>v.captureSecret==='installed-extension-synthetic-only')"),true);checks++;
 assert.equal(await evaluate("chrome.alarms.get('flaneur-delivery-v2').then(Boolean)"),true);checks++;
 mode="online";await retryFromOptions(restartId);await until(async()=>await state(restartId)==="saved");checks++;
 stage="credential_replacement_requires_resume";await configureSecret("rejected-synthetic-fixture");await openSource();await saveProfile();await closeOverlay();
 const blockedEntry=Object.entries(await storage()).find(([key])=>key.startsWith("flaneur-outbox-v2:"));assert.ok(blockedEntry);const blockedId=blockedEntry[1].requestId;
 await until(async()=>await state(blockedId)==="blocked");checks++;
 const requestCount=requests.length;await configureSecret(syntheticSecret);
 await evaluate("chrome.alarms.create('flaneur-delivery-v2',{when:Date.now()+1000})");
 await until(()=>evaluate("chrome.alarms.get('flaneur-delivery-v2').then(v=>v?.periodInMinutes===1)"));
 assert.equal(await state(blockedId),"blocked");assert.equal(requests.length,requestCount);checks+=2;
 await retryFromOptions(blockedId);await until(async()=>await state(blockedId)==="saved");checks++;
 stage="acknowledgement_at_full_quota";mode="offline";await saveProfile();await closeOverlay();
 const fullEntry=Object.entries(await storage()).find(([key])=>key.startsWith("flaneur-outbox-v2:"));assert.ok(fullEntry);const fullId=fullEntry[1].requestId;
 await until(async()=>(await storage())[fullEntry[0]]?.attempts>=1);
 await evaluate("(async()=>{const key='fixtureQuotaFill',used=await chrome.storage.local.getBytesInUse(null);await chrome.storage.local.set({[key]:'x'.repeat(chrome.storage.local.QUOTA_BYTES-used-key.length-2)});})()");
 assert.equal(await evaluate("chrome.storage.local.getBytesInUse(null).then(bytes=>bytes===chrome.storage.local.QUOTA_BYTES)"),true);checks++;
 mode="online";await evaluate("chrome.alarms.create('flaneur-delivery-v2',{when:Date.now()+1000})");
 await until(async()=>accepted.has(fullId));await until(async()=>await state(fullId)==="saved");checks++;
 await until(()=>evaluate(`chrome.storage.local.get(${JSON.stringify(fullEntry[0])}).then(records=>records[${JSON.stringify(fullEntry[0])}]===undefined)`));
 assert.equal((await storage())[fullEntry[0]],undefined);checks++;
 console.log(JSON.stringify({status:"installed_extension_validation_passed",checks,installed_extension:true,real_chrome_storage:true,forced_worker_stop:true,browser_restart:true,restart_fixture_reload_required:restartReloadRequired,real_alarm_wake:true,synthetic_https:true,real_database_used:false}));
}catch(error){console.error(JSON.stringify({status:"installed_extension_validation_failed",stage,completed_checks:checks,
 code:/^[A-Z_]{1,64}$/.test(error?.message??"")?error.message:error?.code==="ERR_ASSERTION"?"ASSERTION_FAILED":"FIXTURE_FAILED"}));process.exitCode=1;}
finally{
 await stopBrowser();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(work.startsWith(cache+sep)&&work!==cache)for(let i=0;i<30;i++){try{rmSync(work,{recursive:true,force:true});break;}catch{await sleep(100);}}
}

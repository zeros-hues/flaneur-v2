import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync } from "node:fs";
import { resolve,join,sep } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
const WebSocket=createRequire(import.meta.url)("next/dist/compiled/ws");
const cache=resolve("node_modules/.cache/flaneur");mkdirSync(cache,{recursive:true});const profile=mkdtempSync(join(cache,"extension-capture-browser-"));
let browser,server,ws,sequence=0,checks=0,stage="build";const pending=new Map(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error("CDP_TIMEOUT"));},10000);
 pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error("BROWSER_EVALUATION_FAILED");return result.result.value;}
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error("BROWSER_CONDITION_TIMEOUT");}
const root="document.querySelector('flaneur-ui').shadowRoot";
async function click(selector){assert.equal(await evaluate(`(()=>{const el=${root}.querySelector(${JSON.stringify(selector)});if(!el)return false;el.click();return true;})()`),true);}
try {
 const bundle=await build({entryPoints:["extension/content/index.ts"],bundle:true,write:false,platform:"browser",format:"iife",loader:{".woff2":"binary"}});
 const mock=`window.fixture={requests:[],mode:'pending',saved:false,scrolls:0};window.scrollTo=()=>fixture.scrolls++;Element.prototype.scrollIntoView=()=>fixture.scrolls++;
 window.chrome={runtime:{getManifest:()=>({version:'fixture'}),onMessage:{addListener:fn=>window.postMessageFixture=fn},sendMessage:async message=>{
  if(message.kind==='capture-status')return {ok:true,requestId:message.requestId,state:fixture.saved?'saved':'queued',processing:'queued'};
  fixture.requests.push(structuredClone(message.payload));
  if(fixture.mode==='lost'){fixture.mode='queued';throw Error('synthetic lost response');}
  if(fixture.mode==='pending')await new Promise(resolve=>fixture.finishLocal=resolve);
  return {ok:true,requestId:message.payload.requestId,state:'queued'};
 }}};`;
 server=createServer((req,res)=>{
  if(req.url==="/bundle.js"){res.setHeader("content-type","text/javascript");return res.end(mock+bundle.outputFiles[0].text);}
  res.setHeader("content-type","text/html");res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="workspace"><section aria-label="Primary content"><h2>Synthetic Profile</h2><p>Loaded profile only</p><article id="post" role="listitem" componentkey="update-card-focus-fixture"><p>Exact synthetic post 😀</p></article></section></main><script src="/bundle.js"></script>');
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const executable=["C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);assert.ok(executable);
 stage="launch";browser=spawn(executable,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-port=0",`--user-data-dir=${profile}`,"about:blank"],{windowsHide:true,stdio:"ignore"});browser.on("error",()=>{});
 const portFile=join(profile,"DevToolsActivePort");for(let i=0;i<150&&!existsSync(portFile);i++)await sleep(100);assert.ok(existsSync(portFile));
 const port=readFileSync(portFile,"utf8").split('\n')[0],tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true});});
 ws.addEventListener("message",event=>{const data=JSON.parse(event.data),promise=pending.get(data.id);if(!promise)return;pending.delete(data.id);if(data.error)promise.reject(new Error("CDP_ERROR"));else promise.resolve(data.result);});
 await call("Page.enable");await call("Runtime.enable");await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true}).catch(()=>call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true}));
 await call("Page.navigate",{url:origin+"/in/fixture/"});await until("document.querySelector('flaneur-ui')!==null");
 stage="profile_partial_and_local_confirmation";await click(".trigger");assert.equal(await evaluate("fixture.scrolls"),0);checks++;
 assert.equal(await evaluate(`${root}.textContent.includes('content currently loaded')`),true);checks++;
 await evaluate(`${root}.querySelector('textarea').focus()`);await call("Input.insertText",{text:"  Exact reason 😀  "});await click("button[type=submit]");
 await until("fixture.requests.length===1");assert.equal(await evaluate(`${root}.querySelector('.confirmed')===null`),true);checks++;
 assert.equal(await evaluate("fixture.requests[0].note"),"  Exact reason 😀  ");checks++;
 await evaluate("fixture.finishLocal()");await until(`${root}.textContent.includes('Queued on this device')`);checks++;
 assert.equal(await evaluate(`${root}.textContent.includes('added to your city')`),false);checks++;
 await until(`${root}.querySelector('form')===null`);
 stage="ambiguous_message_retry";await evaluate("fixture.mode='lost'");await click(".trigger");await click("button[type=submit]");await until(`${root}.querySelector('.error').hidden===false`);
 assert.equal(await evaluate(`${root}.querySelector('textarea').readOnly`),true);checks++;
 await click("button[type=submit]");await until("fixture.requests.length===3");assert.equal(await evaluate("JSON.stringify(fixture.requests[1])===JSON.stringify(fixture.requests[2])"),true);checks++;
 await until(`${root}.querySelector('form')===null`);
 stage="repeat_post_save";
 for(let i=0;i<2;i++){
  await evaluate("document.querySelector('#post').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,composed:true}));postMessageFixture({kind:'post-menu-clicked'})");
  await until(`${root}.querySelector('form')!==null`);await click("button[type=submit]");await until(`${root}.querySelector('form')===null`);
 }
 assert.equal(await evaluate("fixture.requests.length"),5);checks++;
 assert.equal(await evaluate("fixture.requests[3].requestId!==fixture.requests[4].requestId"),true);checks++;
 stage="focus_and_mobile";await evaluate(`${root}.querySelector('.trigger').focus()`);await click(".trigger");
 await evaluate(`${root}.querySelector('.skip').focus()`);await call("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});await call("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
 assert.equal(await evaluate(`${root}.activeElement===${root}.querySelector('textarea')`),true);checks++;
 await click(".skip");assert.equal(await evaluate(`${root}.activeElement===${root}.querySelector('.trigger')`),true);checks++;
 assert.equal(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),true);checks++;
 assert.equal(await evaluate("fixture.scrolls"),0);checks++;
 console.log(JSON.stringify({status:"extension_capture_browser_passed",checks,actual_content_script:true,synthetic_runtime:true,installed_extension:false,real_database_used:false}));
}catch{console.error(JSON.stringify({status:"extension_capture_browser_failed",stage,checks}));process.exitCode=1;}
finally{
 if(ws?.readyState===WebSocket.OPEN)try{await call("Browser.close");}catch{}ws?.close();browser?.kill();
 for(const promise of pending.values())promise.reject(new Error("BROWSER_CLOSED"));pending.clear();if(server)await new Promise(resolve=>server.close(resolve));
 if(profile.startsWith(cache+sep)&&profile!==cache)for(let i=0;i<20;i++){try{rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(100);}}
}

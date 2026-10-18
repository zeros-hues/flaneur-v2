import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync } from "node:fs";
import { resolve,join,sep } from "node:path";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { createRequire } from "node:module";
const WebSocket=createRequire(import.meta.url)("next/dist/compiled/ws");

// Real component/browser, entirely synthetic localhost API. Never load .env or authenticate.
const cache=resolve("node_modules/.cache/flaneur");mkdirSync(cache,{recursive:true});
const profile=mkdtempSync(join(cache,"walk-browser-"));
let stage="build",browser,server,ws,checks=0;const pending=new Map();let sequence=0;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ids=Array.from({length:3},()=>randomUUID()),sessionId=randomUUID();
let session=null,requests=[],receipts=new Map(),failShown=true,loseUseful=true;
function fresh(){session=null;requests=[];receipts=new Map();failShown=true;loseUseful=true;}
function state(){return {timezone:session?.timezone??null,session};}
function start(input){session={id:sessionId,localDay:"2026-10-13",timezone:input.timezone,context:input.context,completed:false,needsResume:false,
 stops:ids.map((id,index)=>({id,objectId:randomUUID(),kind:"person",label:`Synthetic Person ${index+1}`,href:null,shown:false,reasons:["Includes your saved words"],
 evidence:[{id:`fixture-${index}`,objectId:"fixture",text:"  Synthetic robotics words only.\n  ",layer:"user",verified:true}]}))};}
function call(method,params={}){return new Promise((resolve,reject)=>{
 const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error("CDP_TIMEOUT"));},10000);
 pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
 ws.send(JSON.stringify({id,method,params}));
});}
async function evaluate(expression){const result=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error("BROWSER_EVALUATION_FAILED");return result.result.value;}
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error("BROWSER_CONDITION_TIMEOUT");}
async function click(label){assert.equal(await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)}&&!b.disabled);if(!button)return false;button.click();return true;})()`),true);}
async function key(key,code,value){for(const type of ["keyDown","keyUp"])await call("Input.dispatchKeyEvent",{type,key,code,windowsVirtualKeyCode:value,nativeVirtualKeyCode:value,
 ...(type==="keyDown"&&key==="Enter"?{text:"\r",unmodifiedText:"\r"}:{})});}
try{
 const bundle=await build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import {Walk} from "./components/walk/Walk";createRoot(document.getElementById("root")).render(<Walk/>);',resolveDir:resolve('.'),loader:'tsx'},
  bundle:true,write:false,outdir:"fixture",platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},logLevel:"silent"});
 const js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text,css=bundle.outputFiles.find(file=>file.path.endsWith('.css')).text;
 server=createServer(async(req,res)=>{
  if(req.url==="/api/walk"){
   res.setHeader("content-type","application/json");res.setHeader("cache-control","no-store");
   if(req.method==="GET")return res.end(JSON.stringify(state()));
   try{let body="";for await(const chunk of req)body+=chunk;const input=JSON.parse(body);requests.push(input);
    if(input.action==="start"){if(!session)start(input);return res.end(JSON.stringify(state()));}
    if(receipts.has(input.eventId))return res.end(JSON.stringify(state()));
    if(input.kind==="shown"&&failShown){failShown=false;res.statusCode=503;return res.end('{"error":"fixture_failure"}');}
    const stop=session.stops.find(stop=>stop.id===input.stopId);if(!stop){res.statusCode=409;return res.end('{"error":"walk_changed"}');}
    receipts.set(input.eventId,input);if(input.kind==="shown")stop.shown=true;
    if(["useful","kept","reduced","passed"].includes(input.kind)){session.stops=session.stops.filter(stop=>stop.id!==input.stopId);session.completed=!session.stops.length;}
    if(input.kind==="useful"&&loseUseful){loseUseful=false;res.statusCode=503;return res.end('{"error":"fixture_lost_ack"}');}
    return res.end(JSON.stringify(state()));
   }catch{res.statusCode=500;return res.end('{"error":"fixture_error"}');}
  }
  if(req.url==="/bundle.js"){res.setHeader("content-type","text/javascript");return res.end(js);}
  if(req.url==="/bundle.css"){res.setHeader("content-type","text/css");return res.end(css);}
  res.setHeader("content-type","text/html");res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><style>body{margin:24px;font:16px system-ui;--ink:#17242b;--serif:serif;--leading-reading:1.6;--margin-text:#54616b}button{font:inherit}li{list-style:none}ol{padding:0}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const executable=["C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
 assert.ok(executable);stage="browser_launch";
 browser=spawn(executable,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-port=0",`--user-data-dir=${profile}`,"about:blank"],{windowsHide:true,stdio:"ignore"});
 browser.on("error",()=>{});
 const portFile=join(profile,"DevToolsActivePort");for(let i=0;i<150&&!existsSync(portFile);i++)await sleep(100);assert.ok(existsSync(portFile));
 const port=readFileSync(portFile,"utf8").split('\n')[0];const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const data=JSON.parse(event.data);const promise=pending.get(data.id);if(!promise)return;pending.delete(data.id);if(data.error)promise.reject(new Error("CDP_ERROR"));else promise.resolve(data.result);});
 await call("Page.enable");await call("Runtime.enable");await call("Emulation.setDeviceMetricsOverride",{width:1200,height:900,deviceScaleFactor:1,mobile:false});
 stage="desktop_start";await call("Page.navigate",{url:origin});await until("document.body.innerText.includes('Start Walk')");
 assert.equal(requests.length,0);checks++;
 await evaluate("document.querySelector('textarea').focus()");await call("Input.insertText",{text:"  Fixture context 😀  "});await click("Start Walk");
 await until("document.querySelectorAll('article').length===3");assert.equal(session.context,"  Fixture context 😀  ");checks++;
 stage="exposure_retry";await until("document.body.innerText.includes('This action could not be saved')");
 const firstShown=requests.find(request=>request.kind==='shown');await click("retry");await until("document.querySelector('article button')&&!document.querySelector('article button').disabled");
 const repeated=requests.filter(request=>request.kind==='shown'&&request.stopId===firstShown.stopId);assert.equal(repeated[0].eventId,repeated[1].eventId);checks++;
 stage="lost_action_ack";await click("useful");await until("document.body.innerText.includes('This action could not be saved')");
 assert.equal(await evaluate("document.querySelectorAll('article').length"),3);checks++;
 await click("retry");await until("document.querySelectorAll('article').length===2");
 const useful=requests.filter(request=>request.kind==='useful');assert.equal(useful.length,2);assert.equal(useful[0].eventId,useful[1].eventId);checks+=2;
 stage="desktop_completion";
 for(let i=0;i<2;i++){await evaluate("document.querySelector('article > div').scrollIntoView({block:'start'})");await until("document.querySelector('article button')&&!document.querySelector('article button').disabled");await click("continue");}
 await until("document.body.innerText.includes(\"That is today's Walk.\")");checks++;
 await call("Page.navigate",{url:origin});await until("document.body.innerText.includes(\"That is today's Walk.\")");assert.equal(requests.filter(request=>request.action==='start').length,1);checks++;
 stage="mobile_keyboard_submit";fresh();failShown=false;loseUseful=false;
 await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await call("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});await call("Page.navigate",{url:origin});
 await until("document.body.innerText.includes('Start Walk')");stage="mobile_keyboard_activation";
 await call("Emulation.setFocusEmulationEnabled",{enabled:true});await call("Page.bringToFront");
 await evaluate("document.querySelector('button[type=submit]').focus()");
 assert.equal(await evaluate("document.activeElement===document.querySelector('button[type=submit]')"),true);checks++;
 await key('Enter','Enter',13);
 await until("document.querySelectorAll('article').length===3");checks++;
 stage="hidden_tab_exposure";
 await call("Emulation.setFocusEmulationEnabled",{enabled:false});
 const hidden=await call("Target.createTarget",{url:"about:blank"});await call("Target.activateTarget",{targetId:hidden.targetId});
 await until("document.visibilityState==='hidden'");await sleep(1300);
 assert.equal(requests.filter(request=>request.kind==='shown').length,0);checks++;
 await call("Target.activateTarget",{targetId:tabs.find(tab=>tab.type==='page').id});await call("Page.bringToFront");
 await until("document.visibilityState==='visible'");await sleep(250);
 assert.equal(requests.filter(request=>request.kind==='shown').length,0);checks++;
 await call("Target.closeTarget",{targetId:hidden.targetId});
 stage="mobile_layout";assert.equal(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),true);checks++;
 stage="mobile_stop_focus";await evaluate("document.querySelector('article').focus()");assert.equal(await evaluate("document.activeElement.tagName==='ARTICLE'"),true);checks++;
 stage="mobile_exposure";await until("document.querySelector('article button')&&!document.querySelector('article button').disabled");checks++;
 const screenshot=await call("Page.captureScreenshot",{format:"png"});writeFileSync(join(cache,"walk-mobile-fixture.png"),Buffer.from(screenshot.data,'base64'));
 console.log(JSON.stringify({status:"walk_browser_validation_passed",checks,browser:"headless_chromium",synthetic_api:true,real_owner_login:false,real_database_used:false}));
}catch{console.error(JSON.stringify({status:"walk_browser_validation_failed",stage,completed_checks:checks}));process.exitCode=1;}
finally{
 if(ws?.readyState===WebSocket.OPEN)try{await call("Browser.close");}catch{}ws?.close();browser?.kill();
 for(const promise of pending.values())promise.reject(new Error("BROWSER_CLOSED"));pending.clear();
 if(server)await new Promise(resolve=>server.close(resolve));
 // Only this freshly created private profile may be removed.
 if(profile.startsWith(cache+sep)&&profile!==cache)for(let i=0;i<20;i++){try{rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(100);}}
}

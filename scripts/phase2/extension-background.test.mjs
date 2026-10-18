import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
const event=()=>({listeners:[],addListener(listener){this.listeners.push(listener);}});
const content={id:"fixture-extension",url:"https://www.linkedin.com/in/fixture/",frameId:0,tab:{id:1}},options={id:"fixture-extension",url:"chrome-extension://fixture-extension/options.html"};
const body=()=>({type:"profile",requestId:randomUUID(),clientCapturedAt:new Date().toISOString(),sourceUrl:content.url,html:"<section>😀</section>",note:"  why 😀  ",urn:null,extensionVersion:"fixture"});
async function fixture(initialValues={}){
 const values=structuredClone(initialValues),alarm=new Map();let trusted=false,failWrites=false,requests=[];
 const local={async setAccessLevel({accessLevel}){trusted=accessLevel==="TRUSTED_CONTEXTS";},async get(key){assert.equal(trusted,true);return structuredClone(key===null?values:{[key]:values[key]});},async set(next){if(failWrites)throw new Error("quota");Object.assign(values,structuredClone(next));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete values[key];}};
 globalThis.chrome={runtime:{id:content.id,getURL:path=>`chrome-extension://${content.id}/${path}`,onStartup:event(),onInstalled:event(),onMessage:event(),openOptionsPage:async()=>{}},
  storage:{local},contextMenus:{create(){},onClicked:event()},tabs:{sendMessage:async()=>{}},alarms:{onAlarm:event(),get:async name=>alarm.get(name),create:async(name,value)=>alarm.set(name,value)}};
 globalThis.fetch=async(endpoint,init)=>{requests.push({endpoint,payload:JSON.parse(init.body)});return Response.json({version:2,state:"saved",requestId:JSON.parse(init.body).requestId,snapshotId:randomUUID(),encounterId:randomUUID(),processing:"queued",replayed:false});};
 const bundle=await build({entryPoints:["extension/background.ts"],bundle:true,write:false,platform:"browser",format:"esm",define:{__APP_URL__:'"https://fixture.example.test"'}});
 await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}#${randomUUID()}`);
 const dispatch=(message,sender=content)=>new Promise(resolve=>{const accepted=chrome.runtime.onMessage.listeners[0](message,sender,resolve);if(!accepted)resolve(null);});
 const flush=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setTimeout(resolve,2));};
 await flush();
 return {values,alarm,requests,dispatch,flush,set failWrites(value){failWrites=value;},get trusted(){return trusted;}};
}
test("actual background restricts senders and does not return queue metadata to content pages",async()=>{
 const f=await fixture();assert.equal(f.trusted,true);assert.equal(f.alarm.size,1);
 assert.equal(await f.dispatch({kind:"capture",payload:body()},{...content,id:"other-extension"}),null);
 assert.equal(await f.dispatch({kind:"capture",payload:body()},{...content,url:"https://evil.test/"}),null);
 assert.equal(await f.dispatch({kind:"capture-list"}),null);assert.equal(await f.dispatch({kind:"capture-resume",requestId:randomUUID()}),null);assert.equal(f.requests.length,0);
});
test("actual background queues without credentials and options must explicitly resume blocked captures",async()=>{
 const f=await fixture(),payload=body();assert.equal((await f.dispatch({kind:"capture",payload})).state,"queued");await f.flush();
 assert.equal((await f.dispatch({kind:"capture-status",requestId:payload.requestId})).state,"blocked");
 const listed=await f.dispatch({kind:"capture-list"},options);assert.equal(listed.items.length,1);assert.equal("payload" in listed.items[0],false);assert.equal(f.requests.length,0);
 f.values.captureSecret="synthetic-secret";
 for(const listener of chrome.alarms.onAlarm.listeners)listener({name:"flaneur-delivery-v2"});await f.flush();assert.equal(f.requests.length,0);
 await f.dispatch({kind:"capture-resume",requestId:payload.requestId},options);await f.flush();
 assert.equal((await f.dispatch({kind:"capture-status",requestId:payload.requestId})).state,"saved");assert.equal(f.requests.length,1);
 assert.equal(f.requests[0].endpoint,"https://fixture.example.test/api/capture/v2");assert.equal(f.requests[0].payload.reasonForNoticing,"  why 😀  ");
});
test("actual background survives quota failure and duplicate capture messages",async()=>{
 const f=await fixture(),payload=body();f.failWrites=true;assert.equal((await f.dispatch({kind:"capture",payload})).ok,false);assert.equal(f.requests.length,0);
 f.failWrites=false;await f.dispatch({kind:"capture",payload});await f.dispatch({kind:"capture",payload});await f.flush();
 assert.equal(Object.keys(f.values).filter(key=>key.startsWith("flaneur-outbox-v2:")).length,1);
 assert.equal((await f.dispatch({kind:"capture",payload:{...payload,note:"changed"}})).ok,false);
});
test("recreated background recovers queued bytes and scheduling without inventing a new request",async()=>{
 const first=await fixture(),payload=body();await first.dispatch({kind:"capture",payload});await first.flush();
 const key="flaneur-outbox-v2:"+payload.requestId;first.values[key].state="queued";first.values[key].nextAttemptAt=0;first.values.captureSecret="synthetic-secret";
 const restarted=await fixture(first.values);await restarted.flush();
 assert.equal(restarted.alarm.size,1);assert.equal(restarted.requests.length,1);assert.equal(restarted.requests[0].payload.requestId,payload.requestId);
 assert.equal((await restarted.dispatch({kind:"capture-status",requestId:payload.requestId})).state,"saved");
});
test("mismatched saved receipt cannot claim that another capture was saved",async()=>{
 const f=await fixture(),payload=body();await f.dispatch({kind:"capture",payload});await f.flush();
 f.values["flaneur-saved-v2:"+payload.requestId]={requestId:randomUUID(),payloadHash:"a".repeat(64),savedAt:1,processing:"queued"};
 assert.equal((await f.dispatch({kind:"capture-status",requestId:payload.requestId})).ok,false);
 assert.equal(f.values["flaneur-outbox-v2:"+payload.requestId].payload.html,payload.html);
});

import { POST_MENU_ID,type CapturePayload,type PostMenuClicked } from "./lib/messages";
import { readSecret } from "./lib/secret";
import { chromeCaptureStorage } from "./lib/capture-storage";
import { captureQueue } from "./lib/capture-queue";
import { linkedinPage } from "./lib/capture-v2";
import { sendV2 } from "./lib/v2-delivery";

const ALARM="flaneur-delivery-v2";
// Reject an insecure configured transport; credentials/source never travel over HTTP.
const endpoint=new URL("/api/capture/v2",__APP_URL__);
let queuePromise:Promise<ReturnType<typeof captureQueue>>|undefined;
function queue(){return queuePromise??=chromeCaptureStorage().then(store=>captureQueue(store,async payload=>{
 if(endpoint.protocol!=="https:")return {state:"blocked",code:"HTTPS_REQUIRED"};
 return sendV2(payload,endpoint.href,await readSecret());
})).catch(error=>{queuePromise=undefined;throw error;});}
const pump=async()=>{if(!await chrome.alarms.get(ALARM))await chrome.alarms.create(ALARM,{periodInMinutes:1});await(await queue()).pump();};
const quietly=(work:Promise<unknown>)=>{void work.catch(()=>{});}; // Payload stays stored; next alarm/startup retries.
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM)quietly(pump());});
chrome.runtime.onStartup.addListener(()=>quietly(pump()));
chrome.runtime.onInstalled.addListener(()=>{
 quietly(pump());quietly(readSecret().then(secret=>{if(!secret)return chrome.runtime.openOptionsPage();}));
 chrome.contextMenus.create({id:POST_MENU_ID,title:"Save this post to Flaneur",contexts:["all"],documentUrlPatterns:["https://www.linkedin.com/*"]});
});
chrome.contextMenus.onClicked.addListener((info,tab)=>{
 if(info.menuItemId!==POST_MENU_ID||tab?.id===undefined)return;
 const message:PostMenuClicked={kind:"post-menu-clicked"};quietly(chrome.tabs.sendMessage(tab.id,message,{frameId:info.frameId}));
});
function contentSender(sender:chrome.runtime.MessageSender){return sender.id===chrome.runtime.id&&sender.frameId===0&&linkedinPage(sender.url)&&sender.tab!==undefined;}
function optionsSender(sender:chrome.runtime.MessageSender){return sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL("options.html");}
const id=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
chrome.runtime.onMessage.addListener((raw:unknown,sender,respond)=>{
 if(typeof raw!=="object"||raw===null||!("kind" in raw))return false;
 const message=raw as Record<string,unknown>,content=contentSender(sender),options=optionsSender(sender);
 let work:Promise<unknown>;
 if(message.kind==="capture"&&content){
  const p=message.payload as CapturePayload|undefined;
  work=queue().then(async queue=>({ok:true,...await queue.accept(p&&{version:2,requestId:p.requestId,adapterId:"linkedin",kind:p.type==="profile"?"profile_page":p.type==="post"?"social_post":"invalid",
   sourceUrl:p.sourceUrl,html:p.html,reasonForNoticing:p.note,urn:p.urn,extensionVersion:p.extensionVersion,clientCapturedAt:p.clientCapturedAt})}));
 }else if(message.kind==="capture-status"&&content&&id(message.requestId))work=queue().then(async q=>({ok:true,...await q.status(message.requestId as string)}));
 else if(message.kind==="capture-list"&&options)work=queue().then(async q=>({ok:true,items:await q.list()}));
 else if(message.kind==="capture-resume"&&options&&id(message.requestId))work=queue().then(async q=>({ok:true,...await q.resume(message.requestId as string)}));
 else return false;
 void work.then(result=>{respond(result);if(message.kind==="capture"||message.kind==="capture-resume")quietly(pump());},()=>respond({ok:false,error:"Capture could not be stored or read on this device. Retry keeps the same capture."}));
 return true;
});
// Register listeners synchronously; re-establish scheduling whenever this service worker wakes.
quietly(pump());

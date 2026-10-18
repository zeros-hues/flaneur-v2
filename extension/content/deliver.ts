import type { CapturePayload,CaptureRequest,CaptureResult } from "../lib/messages";
import { showToast } from "../lib/ui/toast";
export const extensionVersion=()=>chrome.runtime.getManifest().version;
export const captureIdentity=()=>({requestId:crypto.randomUUID(),clientCapturedAt:new Date().toISOString()});
export function captureFeedback(result:Extract<CaptureResult,{ok:true}>):string {
 if(result.state==="saved"){
  if(result.processing==="quarantined"||result.processing==="failed")return "Saved to Flaneur. Processing needs attention.";
  if(result.processing==="succeeded")return "Saved to Flaneur. Processing finished.";
  if(result.processing==="queued")return "Saved to Flaneur. Processing is queued.";
  if(result.processing==="leased")return "Saved to Flaneur. Processing is running.";
  return "Saved to Flaneur.";
 }
 if(result.state==="blocked")return "Kept on this device. Open extension settings to check access and retry.";
 if(result.state==="failed")return "Kept on this device. The server rejected this save; review it in extension settings.";
 return "Queued on this device. Flaneur has not confirmed saving yet.";
}
async function follow(requestId:string){
 for(let attempt=0;attempt<20;attempt++){
  await new Promise(resolve=>setTimeout(resolve,1000));
  let result:CaptureResult;try{result=await chrome.runtime.sendMessage({kind:"capture-status",requestId});}catch{return;}
  if(!result?.ok)return;if(["saved","blocked","failed"].includes(result.state)){showToast(captureFeedback(result));return;}
 }
}
/** Payload identity is assigned by the save gesture and reused after an ambiguous message failure. */
export async function deliver(payload:CapturePayload):Promise<string>{
 const request:CaptureRequest={kind:"capture",payload};let result:CaptureResult;
 try{result=await chrome.runtime.sendMessage<CaptureRequest,CaptureResult>(request);}catch{
  throw new Error("Could not confirm storage on this device. Retry keeps the same capture.");
 }
 if(!result?.ok)throw new Error("Could not store this capture on your device. It may be too large, or local storage may be full. Retry keeps the same capture.");
 if(result.state==="unknown")throw new Error("Could not confirm storage on this device. Retry keeps the same capture.");
 if(result.state==="queued")void follow(result.requestId);
 return captureFeedback(result);
}

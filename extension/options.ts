import { readSecret,writeSecret } from "./lib/secret";
import type { QueueStatus } from "./lib/capture-queue";
const form=document.querySelector<HTMLFormElement>("form"),input=document.querySelector<HTMLInputElement>("#secret"),status=document.querySelector<HTMLParagraphElement>("#status"),list=document.querySelector<HTMLDivElement>("#queue");
async function refresh(){
 if(!list)return;
 try{
  const response=await chrome.runtime.sendMessage({kind:"capture-list"});
  if(!response?.ok)throw new Error("UNAVAILABLE");
  list.replaceChildren();const items=response.items as QueueStatus[];
  if(!items.length){list.textContent="No captures are waiting on this device.";return;}
  for(const item of items){
   const row=document.createElement("div"),label=document.createElement("p");
   row.dataset.requestId=item.requestId;
   label.textContent=item.state==="blocked"?"Capture kept here. Access needs attention.":item.state==="failed"?"Capture kept here. The server rejected it; save again from the source after checking access and size.":item.state==="saved"?"Saved to Flaneur; local cleanup is pending.":"Capture queued here. Flaneur has not confirmed saving yet.";
   row.append(label);
   if(item.state==="queued"||item.state==="blocked"){
    const retry=document.createElement("button");retry.textContent="Retry this capture";retry.type="button";
    retry.addEventListener("click",()=>{retry.disabled=true;void chrome.runtime.sendMessage({kind:"capture-resume",requestId:item.requestId}).then(()=>refresh(),()=>{retry.disabled=false;});});row.append(retry);
   }
   list.append(row);
  }
 }catch{list.textContent="Captures could not be read. They have not been removed; try refreshing this page.";}
}
if(form&&input&&status){
 void readSecret().then(secret=>{status.textContent=secret?"Access is configured. Retry waiting captures below after changing it.":"Enter your capture secret to send queued captures.";},()=>{status.textContent="Settings could not be read on this device.";});
 form.addEventListener("submit",event=>{event.preventDefault();const secret=input.value.trim();if(!secret)return;
  void writeSecret(secret).then(()=>{input.value="";status.textContent="Access saved. Use Retry below to resume captures that were blocked.";},()=>{status.textContent="Access could not be saved on this device.";});
 });
}
document.querySelector("#refresh")?.addEventListener("click",()=>void refresh());
void refresh();

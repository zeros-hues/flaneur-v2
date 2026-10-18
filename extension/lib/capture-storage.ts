import { chromeOutbox,OUTBOX_PREFIX } from "./outbox-chrome";
import { validateCapture,type CaptureEnvelope } from "./capture-v2";
import type { CaptureQueueStore,SavedReceipt } from "./capture-queue";
const PREFIX="flaneur-saved-v2:";
const states=["queued","leased","succeeded","failed","superseded","quarantined"];
function receipt(value:unknown):SavedReceipt {
 const r=value as SavedReceipt;
 if(!r||typeof r.requestId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r.requestId)||typeof r.payloadHash!=="string"||!/^[0-9a-f]{64}$/.test(r.payloadHash)||
  !Number.isFinite(r.savedAt)||r.savedAt<0||!states.includes(r.processing))throw new Error("OUTBOX_RECEIPT_INVALID");
 return r;
}
export async function chromeCaptureStorage():Promise<CaptureQueueStore> {
 const store=await chromeOutbox<CaptureEnvelope>(validateCapture);
 function marker(value:unknown,key:string):SavedReceipt|null {
  if(typeof value!=="object"||value===null||!("state" in value)||value.state!=="saved")return null;
  const saved=receipt("receipt" in value?value.receipt:null);
  if(key!==OUTBOX_PREFIX+saved.requestId)throw new Error("OUTBOX_RECEIPT_INVALID");return saved;
 }
 async function prune(){
  const records=await chrome.storage.local.get(null);
  const old=Object.entries(records).filter(([key])=>key.startsWith(PREFIX)).map(([key,value])=>({key,value:receipt(value)}))
   .sort((a,b)=>b.value.savedAt-a.value.savedAt||a.key.localeCompare(b.key)).slice(200).map(item=>item.key);
  if(old.length)await chrome.storage.local.remove(old);
 }
 return {...store,
  async list(){
   // A crash after the atomic acknowledgement leaves a compact proof, never a lost/unsaved capture.
   const records=await chrome.storage.local.get(null);
   for(const [key,value] of Object.entries(records)){
    if(!key.startsWith(OUTBOX_PREFIX))continue;const saved=marker(value,key);if(!saved)continue;
    await chrome.storage.local.set({[PREFIX+saved.requestId]:saved});
    await chrome.storage.local.remove(key);
    await prune();
   }
   return store.list();
  },
  async receipt(id){const values=await chrome.storage.local.get(PREFIX+id);
   if(!values[PREFIX+id]){const pending=await chrome.storage.local.get(OUTBOX_PREFIX+id);return marker(pending[OUTBOX_PREFIX+id],OUTBOX_PREFIX+id);}
   const saved=receipt(values[PREFIX+id]);if(saved.requestId!==id)throw new Error("OUTBOX_RECEIPT_INVALID");return saved;},
  async saveReceipt(value){
   receipt(value);
   // Replacing one existing key is atomic and frees the original's quota after a verified remote ACK.
   // The marker remains a durable receipt if promoting it or subsequent cleanup is interrupted.
   await chrome.storage.local.set({[OUTBOX_PREFIX+value.requestId]:{state:"saved",receipt:value}});
   await chrome.storage.local.set({[PREFIX+value.requestId]:value});
   await prune();
  },
 };
}

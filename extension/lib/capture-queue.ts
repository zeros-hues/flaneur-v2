import type { OutboxItem,OutboxStore,Delivery } from "./outbox";
import { validateCapture,payloadHash,type CaptureEnvelope } from "./capture-v2";
export interface SavedReceipt {requestId:string;payloadHash:string;savedAt:number;processing:string}
export interface CaptureQueueStore extends OutboxStore<CaptureEnvelope> {
 receipt(id:string):Promise<SavedReceipt|null>;
 saveReceipt(receipt:SavedReceipt):Promise<void>;
}
export type QueueStatus={requestId:string;state:"queued"|"blocked"|"failed"|"saved"|"unknown";code?:string|null;processing?:string};
export function captureQueue(store:CaptureQueueStore,send:(payload:CaptureEnvelope)=>Promise<Delivery>,clock=Date.now) {
 let pending:Promise<unknown>=Promise.resolve(),pumping:Promise<void>|null=null;
 const generations=new Map<string,number>();
 const serial=<T>(work:()=>Promise<T>)=>{const next=pending.then(work);pending=next.catch(()=>{});return next;};
 async function status(id:string):Promise<QueueStatus>{
  const receipt=await store.receipt(id);if(receipt)return {requestId:id,state:"saved",processing:receipt.processing};
  const item=(await store.list()).find(item=>item.requestId===id);return {requestId:id,state:item?.state??"unknown",code:item?.lastErrorCode};
 }
 return {
  accept:async(value:unknown)=>{const payload=validateCapture(value),hash=await payloadHash(payload);return serial(async()=>{
   const receipt=await store.receipt(payload.requestId),existing=(await store.list()).find(item=>item.requestId===payload.requestId);
   if((receipt&&receipt.payloadHash!==hash)||(existing&&await payloadHash(existing.payload)!==hash))throw new Error("CAPTURE_ID_CONFLICT");
   if(!receipt&&!existing)await store.put({requestId:payload.requestId,payload,state:"queued",attempts:0,nextAttemptAt:clock(),lastErrorCode:null});
   return status(payload.requestId);
  });},
  status:(id:string)=>serial(()=>status(id)),
  list:()=>serial(async()=>Promise.all((await store.list()).map(async item=>{const receipt=await store.receipt(item.requestId);
   return receipt?{requestId:item.requestId,state:"saved" as const,processing:receipt.processing}:{requestId:item.requestId,state:item.state,code:item.lastErrorCode};}))),
  resume:(id:string)=>serial(async()=>{const item=(await store.list()).find(item=>item.requestId===id);
   if(!item)return status(id);if(item.state==="failed")throw new Error("CAPTURE_REQUIRES_NEW_SAVE");
   await store.put({...item,state:"queued",nextAttemptAt:clock(),lastErrorCode:null});generations.set(id,(generations.get(id)??0)+1);return status(id);
  }),
  pump:()=>{
   if(pumping)return pumping;
   pumping=(async()=>{const started=clock();for(let count=0;count<10&&clock()-started<20000;count++){
    const item=await serial(async()=>{for(const item of await store.list()){
     if(await store.receipt(item.requestId)){await store.remove(item.requestId);continue;}
     if(item.state==="queued"&&item.nextAttemptAt<=clock())return item;
    }return null;});if(!item)return;
    const generation=generations.get(item.requestId)??0;
    let result:Delivery;try{result=await send(structuredClone(item.payload));}catch{result={state:"retry",code:"NETWORK_ERROR"};}
    await serial(async()=>{
     if(result.state==="saved"&&result.requestId===item.requestId){
      // The backend may atomically replace acknowledged source with proof; final cleanup must retain that proof.
      await store.saveReceipt({requestId:item.requestId,payloadHash:await payloadHash(item.payload),savedAt:clock(),processing:result.processing??"queued"});
      await store.remove(item.requestId);return;
     }
     if((generations.get(item.requestId)??0)!==generation)return;
     const attempts=item.attempts+1,state=result.state==="blocked"?"blocked":result.state==="failed"?"failed":"queued";
     const raw=result.state==="saved"?"ACK_ID_MISMATCH":result.code;
     await store.put({...item,state,attempts,lastErrorCode:/^[A-Z0-9_]{1,64}$/.test(raw)?raw:"DELIVERY_ERROR",nextAttemptAt:clock()+Math.min(3600000,1000*2**Math.min(attempts,12))});
    });
   }})().finally(()=>{pumping=null;});return pumping;
  },
 };
}

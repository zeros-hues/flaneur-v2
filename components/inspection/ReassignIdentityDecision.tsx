"use client";
import {useRef,useState} from 'react';
export function ReassignIdentityDecision({snapshotId,from,personId,personName,refresh}:{snapshotId:string;
 from:{fromObservationId:string;fromPersonId:string;fromName:string};personId:string;personName:string;refresh():Promise<void>}){
 const [reason,setReason]=useState(''),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const pending=useRef<{action:'reassign_identity';payload:{requestId:string;snapshotId:string;fromObservationId:string;fromPersonId:string;personId:string;reason:string}}|null>(null);
 async function submit(){
  if(busy)return;
  pending.current??={action:'reassign_identity',payload:{requestId:crypto.randomUUID(),snapshotId,
   fromObservationId:from.fromObservationId,fromPersonId:from.fromPersonId,personId,reason}};
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/review',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(pending.current)});
   if(!response.ok){setMessage(response.status===409?'This association changed or is ambiguous. Refresh before reviewing again.'
    :response.status===401?'Sign in again before reviewing.':response.status===400||response.status===422?'This decision could not be accepted. Cancel and inspect the source again.'
    :'Reassignment could not be confirmed. Retry uses the same decision.');return;}
   const data=await response.json();if(data?.proof?.snapshotId!==snapshotId||data?.proof?.personId!==personId)throw new Error('INVALID_REASSIGNMENT_RECEIPT');
   pending.current=null;setReview(false);await refresh();
  }catch{setMessage('Reassignment could not be confirmed. Retry uses the same decision.');}
  finally{setBusy(false);}
 }
 return <div>
  {!review?<form onSubmit={event=>{event.preventDefault();setReview(true);}}>
   <p>Review moving this captured profile from {from.fromName} to {personName}.</p>
   <label htmlFor={`reassignment-reason-${personId}`}>Reason for correcting the association</label>
   <textarea id={`reassignment-reason-${personId}`} required maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/>
   <button type="submit" className="textlink" disabled={!reason.trim()}>review reassignment</button>
  </form>:<>
   <p>Move this capture from {from.fromName} to {personName}? The earlier decision and your words will remain. Dependent facts will be withdrawn and processing queued for the selected person.</p>
   <p className="observation-text">{pending.current?.payload.reason??reason}</p>
   <button type="button" className="textlink" disabled={busy} onClick={()=>void submit()}>{busy?'saving…':pending.current?'retry reassignment':'confirm reassignment'}</button>
   <button type="button" className="textlink" disabled={busy} onClick={()=>{pending.current=null;setReview(false);setMessage('');}}>cancel reassignment</button>
  </>}
  {message&&<p role="alert">{message}</p>}
 </div>;
}

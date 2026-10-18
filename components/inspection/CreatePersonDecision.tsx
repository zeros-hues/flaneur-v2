"use client";
import {useRef,useState} from 'react';
export function CreatePersonDecision({snapshotId,initialName,refresh}:{snapshotId:string;initialName:string;refresh():Promise<void>}){
 const [name,setName]=useState(initialName),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const pending=useRef<{action:'create_person_from_profile';payload:{requestId:string;snapshotId:string;name:string}}|null>(null);
 async function submit(){
  if(busy)return;
  pending.current??={action:'create_person_from_profile',payload:{requestId:crypto.randomUUID(),snapshotId,name:name.trim()}};
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/review',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(pending.current)});
   if(!response.ok){setMessage(response.status===409?'This capture already has an association or changed. Refresh before deciding.'
    :response.status===401?'Sign in again before creating a person.':response.status===400||response.status===422
    ?'This name or capture could not be accepted. Cancel and inspect it again.':'Creation could not be confirmed. Retry uses the same decision.');return;}
   const result=await response.json();
   if(result?.proof?.snapshotId!==snapshotId||typeof result?.proof?.personId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.proof.personId))
    throw new Error('INVALID_CREATION_RECEIPT');
   pending.current=null;setReview(false);await refresh();
  }catch{setMessage('Creation could not be confirmed. Retry uses the same decision.');}
  finally{setBusy(false);}
 }
 return <div>
  <h3>Create a separate person</h3>
  <p className="quiet small">Check the existing people above first. This creates a new person and confirms this captured profile belongs to them. People with the same name remain separate.</p>
  {!review?<form onSubmit={event=>{event.preventDefault();setReview(true);}}>
   <label htmlFor="new-source-person-name">Name for the new person</label>
   <input id="new-source-person-name" value={name} maxLength={200} required onChange={event=>setName(event.target.value)}/>
   <button type="submit" className="textlink" disabled={!name.trim()}>review new person</button>
  </form>:<>
   <p>Create “{pending.current?.payload.name??name.trim()}” as a new person and associate this capture?</p>
   <button type="button" className="textlink" disabled={busy} onClick={()=>void submit()}>{busy?'saving…':pending.current?'retry creation':'create person and confirm'}</button>
   <button type="button" className="textlink" disabled={busy} onClick={()=>{pending.current=null;setReview(false);setMessage('');}}>cancel creation</button>
  </>}
  {message&&<p role="alert">{message}</p>}
 </div>;
}

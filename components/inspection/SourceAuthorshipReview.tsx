'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import type {AuthorshipReviewPage} from '@/lib/relationships/authorship-reader';
type Choice={personId:string;name:string;decision:'confirm'|'reject';observationId?:string};
export function SourceAuthorshipReview({snapshotId}:{snapshotId:string}){
 const [open,setOpen]=useState(false),[page,setPage]=useState<AuthorshipReviewPage|null>(null),[query,setQuery]=useState('');
 const [choice,setChoice]=useState<Choice|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [pending,setPending]=useState<{action:'review_authorship';payload:Choice&{requestId:string;snapshotId:string;reason:string}}|null>(null);
 const requestBusy=useRef(false);
 const lastQuery=useRef('');
 async function load(q='',cursor?:string){
  setPage(null);setChoice(null);setMessage('');
  const response=await fetch(`/api/snapshot/${snapshotId}/authorship?${new URLSearchParams({...q?{q}:{},...cursor?{cursor}:{}})}`,{cache:'no-store'});
  if(!response.ok)throw new Error('AUTHORSHIP_READ_FAILED');
  const data=await response.json();if(data.snapshotId!==snapshotId)throw new Error('AUTHORSHIP_READ_FAILED');
  lastQuery.current=q;setPage(data);
 }
 async function inspect(q='',cursor?:string){if(requestBusy.current)return;requestBusy.current=true;setBusy(true);
  try{await load(q,cursor);}catch{setMessage('Authorship review could not be loaded. Please try again.');}finally{requestBusy.current=false;setBusy(false);}}
 async function submit(){
  if(!pending||requestBusy.current)return;requestBusy.current=true;setBusy(true);setMessage('');
  const {name:ignored,...payload}=pending.payload;void ignored;
  try{
   const response=await fetch('/api/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:pending.action,payload})});
   if(!response.ok){setMessage(response.status===409?'The decision conflicts with current records. Cancel and refresh before reviewing again.':
    response.status===401?'Sign in again before reviewing.':'Authorship could not be confirmed. Retry uses the same decision.');return;}
   const data=await response.json();
   if(data.requestId!==payload.requestId||data.snapshotId!==snapshotId||data.personId!==payload.personId||typeof data.observationId!=='string'||
    (payload.decision==='reject'&&data.observationId!==payload.observationId))throw new Error('INVALID_AUTHORSHIP_RECEIPT');
   setPending(null);setReason('');setChoice(null);
   try{await load();setMessage('Authorship decision recorded.');}catch{setPage(null);setMessage('Decision recorded. Refresh to inspect the current record.');}
  }catch{setMessage('Authorship could not be confirmed. Retry uses the same decision.');}
  finally{requestBusy.current=false;setBusy(false);}
 }
 return <section aria-label="Post authorship review"><h2>Post authorship</h2>
  <p className="quiet small">Record an author only after reviewing the saved post. Names, profile associations and source URLs do not establish authorship. Your reason is preserved as a User assertion, not a verified source quotation. Separate authors can be recorded independently.</p>
  {!open?<button type="button" className="textlink" onClick={()=>{setOpen(true);void inspect();}}>review post authorship</button>:<>
   <button type="button" className="textlink" disabled={busy||!!pending} onClick={()=>void inspect()}>refresh authorship</button>
   {page&&!page.supported&&<p>This is not a supported captured post.</p>}
   {page?.supported&&!page.available&&<p>This capture is inactive or unavailable for new authorship decisions.</p>}
   {!!page?.assertions.length&&<ul>{page.assertions.map(row=><li key={row.id}>
    <Link href={`/person/${row.personId}`}>{row.name}</Link> · {row.status}
    <p className="observation-text">{row.reason}</p>
    {row.withdrawalReason&&<p className="observation-text">Reason for withdrawal: {row.withdrawalReason}</p>}
    <Link href={`/snapshot/${row.snapshotId}`}>supporting capture</Link>{row.encounterId&&<> · <Link href={`/encounter/${row.encounterId}`}>recorded Encounter</Link></>}
    {row.canReject&&<button type="button" className="textlink" disabled={busy||!!pending} onClick={()=>{setChoice({personId:row.personId,name:row.name,decision:'reject',observationId:row.id});setReason('');}}>withdraw this authorship decision</button>}
   </li>)}</ul>}
   {page?.available&&page.supported&&!pending&&<>
    <form onSubmit={event=>{event.preventDefault();void inspect(query);}}><fieldset disabled={busy}>
     <label htmlFor="post-author-search">Find an existing Person by name</label>
     <input id="post-author-search" value={query} minLength={2} maxLength={100} required onChange={event=>setQuery(event.target.value)}/>
     <button className="textlink" type="submit">search authors</button>
    </fieldset></form>
    <ul>{page.people.map(person=><li key={person.id}>{person.name} <button type="button" className="textlink" disabled={busy} onClick={()=>{setChoice({personId:person.id,name:person.name,decision:'confirm'});setReason('');}}>select author</button></li>)}</ul>
    {page.nextCursor&&<button type="button" className="textlink" disabled={busy} onClick={()=>void inspect(lastQuery.current,page.nextCursor!)}>next author matches</button>}
   </>}
   {choice&&!pending&&<form onSubmit={event=>{event.preventDefault();if(reason.trim())setPending({action:'review_authorship',payload:{...choice,requestId:crypto.randomUUID(),snapshotId,reason}});}}>
    <p>{choice.decision==='confirm'?'Record':'Withdraw'} authorship for {choice.name}?</p>
    <label htmlFor="post-authorship-reason">Reason for this decision</label>
    <textarea id="post-authorship-reason" required maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/>
    <button type="submit" className="textlink" disabled={busy||!reason.trim()}>review authorship decision</button>
   </form>}
   {pending&&<><p>{pending.payload.decision==='confirm'?'Confirm':'Withdraw'} authorship for {pending.payload.name}? Earlier decisions remain preserved.</p>
    <p className="observation-text">{pending.payload.reason}</p>
    <button type="button" className="textlink" disabled={busy} onClick={()=>void submit()}>save authorship decision</button>
    <button type="button" className="textlink" disabled={busy} onClick={()=>{setPending(null);setChoice(null);setReason('');setMessage('');}}>cancel authorship decision</button>
   </>}
  </>}
  {message&&<p role="status">{message}</p>}
 </section>;
}

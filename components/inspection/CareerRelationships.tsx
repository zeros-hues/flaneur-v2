'use client';
import {useState} from 'react';
import type {z} from 'zod';
import type {careerDecision} from '@/lib/relationships/career';
import type {CareerPage} from '@/lib/relationships/career-reader';
type Decision=z.infer<typeof careerDecision>;
export function CareerRelationships({id}:{id:string}){return <CareerPanel key={id} id={id}/>;}
function CareerPanel({id}:{id:string}){
 const [page,setPage]=useState<CareerPage|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [q,setQ]=useState(''),[search,setSearch]=useState(''),[selected,setSelected]=useState<{id:string;label:string}|null>(null),[reason,setReason]=useState('');
 const [predicate,setPredicate]=useState<'educated_at'|'employed_by'>('educated_at'),[field,setField]=useState(''),[pending,setPending]=useState<Decision|null>(null);
 async function load(query:Record<string,string>={}){
  setBusy(true);setMessage('');setSelected(null);
  try{const response=await fetch(`/api/career/${id}?${new URLSearchParams(query)}`,{cache:'no-store'});if(!response.ok)throw new Error();const result=await response.json();if(result.id!==id||!Array.isArray(result.items)||!Array.isArray(result.organisations))throw new Error();setPage(result);setSearch(query.q??'');}
  catch{setPage(null);setMessage('Education/employment inspection is unavailable. Refresh before reviewing.');}finally{setBusy(false);}
 }
 async function save(){
  if(!pending)return;setBusy(true);setMessage('');
  try{const response=await fetch('/api/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'review_career',payload:pending})});
   if(response.status===409){setPending(null);setPage(null);setMessage('This decision changed. Refresh and review again.');return;}
   if(!response.ok)throw new Error();const result=await response.json();if(typeof result.observationId!=='string'||typeof result.replayed!=='boolean')throw new Error();setPending(null);setReason('');setField('');await load();
  }catch{setMessage('Save was not acknowledged. Retry the same decision safely, or cancel and inspect history.');}finally{setBusy(false);}
 }
 return <section id={`reviewed-career-${id}`} aria-label="Education and employment">
  <h2>Education and employment</h2><p className="quiet small">Explicit statements you reviewed about this Person. Your confirmation is not independent source verification. These records do not establish dates, current employment, graduation or a career transition.</p>
  <button disabled={busy||!!pending} onClick={()=>void load()}>Inspect education/employment</button>
  {message&&<p role="alert">{message}</p>}
  {pending?<div><h3>Review decision</h3><p>{pending.decision==='confirm'?(pending.predicate==='educated_at'?'Studied at':'Worked at')+' '+pending.expectedOrganisation:'Withdraw this exact statement'}</p>
   <p>Organisation: {pending.organisationId}</p>{pending.decision==='reject'&&<p>Withdraw {pending.predicate} statement: {pending.observationId}</p>}{pending.decision==='confirm'&&pending.fieldOfStudy&&<p>Field of study: {pending.fieldOfStudy}</p>}<p className="observation-text">{pending.reason}</p>
   <button disabled={busy} onClick={()=>void save()}>Confirm reviewed decision</button><button disabled={busy} onClick={()=>setPending(null)}>Cancel decision</button></div>:page&&<>
   {page.available&&<form onSubmit={event=>{event.preventDefault();void load({q});}}><label>Find an existing organisation <input value={q} minLength={2} maxLength={100} onChange={event=>setQ(event.target.value)}/></label><button disabled={busy||q.trim().length<2}>Find organisations</button></form>}
   {page.organisations.map(org=><p key={org.id}><button disabled={busy||org.label.length>300} onClick={()=>setSelected(org)}>{org.label} — organisation:{org.id}</button></p>)}
   {page.nextSearchCursor&&<button disabled={busy} onClick={()=>void load({q:search,searchCursor:page.nextSearchCursor!})}>More organisations</button>}
   {selected&&page.available&&<form onSubmit={event=>{event.preventDefault();setPending({requestId:crypto.randomUUID(),personId:id,organisationId:selected.id,predicate,decision:'confirm',expectedOrganisation:selected.label,reason,...(predicate==='educated_at'&&field.trim()?{fieldOfStudy:field}:{})});}}>
    <p>Selected: {selected.label} — organisation:{selected.id}</p><label>Relationship <select value={predicate} onChange={event=>setPredicate(event.target.value as typeof predicate)}><option value="educated_at">Studied at</option><option value="employed_by">Worked at</option></select></label>
    {predicate==='educated_at'&&<label>Field of study (optional, exact term) <input value={field} maxLength={300} onChange={event=>setField(event.target.value)}/></label>}
    <label>Supporting reason / evidence you reviewed <textarea required value={reason} maxLength={2000} onChange={event=>setReason(event.target.value)}/></label><button disabled={busy||!reason.trim()}>Review statement</button>
   </form>}
   {page.items.map(edge=><div key={edge.id}><h3>{edge.predicate==='educated_at'?'Studied at':'Worked at'} {edge.label}</h3><p>{edge.status} · {edge.historyCount} recorded decisions</p><p>organisation:{edge.organisationId}</p>
    {edge.history.map(proof=><div key={proof.id}><p>Your reviewed statement · {proof.current&&edge.state==='active'?'current':'historical / unsupported'}</p><p>Statement: {proof.id}</p><p>Organisation at decision: {proof.expectedOrganisation}</p>{proof.fieldOfStudy&&<p>Field of study: {proof.fieldOfStudy}</p>}
     <p className="observation-text">{proof.reason}</p>{proof.withdrawalReason&&<p>Withdrawal reason: {proof.withdrawalReason}</p>}
     {page.available&&proof.withdrawable&&<button disabled={busy} onClick={()=>{if(!reason.trim()){setMessage('Enter a withdrawal reason below first.');return;}setPending({requestId:crypto.randomUUID(),personId:id,organisationId:proof.organisationId,predicate:proof.predicate,decision:'reject',observationId:proof.id,reason});}}>Review withdrawal of this statement</button>}</div>)}
    {edge.nextHistoryCursor&&<button disabled={busy} onClick={()=>void load({historyEdge:edge.id,historyCursor:edge.nextHistoryCursor!})}>More decision history</button>}
   </div>)}
   {page.items.length===0&&<p>No reviewed statements on this page.</p>}
   {page.available&&<label>Withdrawal reason <textarea value={reason} maxLength={2000} onChange={event=>setReason(event.target.value)}/></label>}
   {page.nextCursor&&<button disabled={busy} onClick={()=>void load({cursor:page.nextCursor!})}>More relationships</button>}
  </>}
 </section>;
}

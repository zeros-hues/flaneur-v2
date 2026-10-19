'use client';
import {useState} from 'react';
import Link from 'next/link';
import {trajectoryDecision,type TrajectoryDecision,type TrajectoryChronology as Chronology} from '@/lib/relationships/trajectory';
import type {TrajectoryPage} from '@/lib/relationships/trajectory-reader';
import {TrajectoryChronology} from './TrajectoryChronology';
type Endpoint={id:string;label:string;kind:'concept'|'topic'};
const emptyPeriod={start:null,end:null,ongoing:false};
export function TrajectoryRelationships({id}:{id:string}){return <Panel key={id} id={id}/>;}
function Panel({id}:{id:string}){
 const [page,setPage]=useState<TrajectoryPage|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [q,setQ]=useState(''),[search,setSearch]=useState(''),[from,setFrom]=useState<Endpoint|null>(null),[to,setTo]=useState<Endpoint|null>(null);
 const [reason,setReason]=useState(''),[supports,setSupports]=useState(''),[dated,setDated]=useState(false),[candidate,setCandidate]=useState(false);
 const [chronology,setChronology]=useState<Chronology>({from:{...emptyPeriod},to:{...emptyPeriod}}),[pending,setPending]=useState<TrajectoryDecision|null>(null),[correcting,setCorrecting]=useState<string|null>(null);
 async function load(query:Record<string,string>={}){
  setBusy(true);setMessage('');
  try{const response=await fetch(`/api/trajectory/${id}?${new URLSearchParams(query)}`,{cache:'no-store'});if(!response.ok)throw new Error();
   const data=await response.json();if(data.id!==id||!Array.isArray(data.items)||!Array.isArray(data.concepts))throw new Error();setPage(data);setSearch(query.q??'');
  }catch{setPage(null);setFrom(null);setTo(null);setCorrecting(null);setMessage('Trajectory inspection is unavailable. Refresh before reviewing.');}finally{setBusy(false);}
 }
 function preview(input:unknown){const parsed=trajectoryDecision.safeParse(input);if(!parsed.success){setMessage('Check the exact endpoints, supporting Observation UUIDs and dates (YYYY, YYYY-MM or YYYY-MM-DD). Reversed periods cannot support this direction.');return;}setMessage('');setPending(parsed.data);}
 async function save(){
  if(!pending)return;setBusy(true);setMessage('');
  try{const response=await fetch('/api/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'review_trajectory',payload:pending})});
   if(response.status===409){setPending(null);setPage(null);setFrom(null);setTo(null);setCorrecting(null);setMessage('The claim, meaning or evidence changed. Refresh and review again.');return;}
   if(!response.ok)throw new Error();const data=await response.json();if(typeof data.observationId!=='string'||typeof data.replayed!=='boolean')throw new Error();
   setPending(null);setFrom(null);setTo(null);setReason('');setSupports('');setCorrecting(null);setCandidate(false);setDated(false);setChronology({from:{...emptyPeriod},to:{...emptyPeriod}});await load();
  }catch{setMessage('Save was not acknowledged. Retry uses the same exact decision.');}finally{setBusy(false);}
 }
 return <section id={`reviewed-trajectory-${id}`} aria-label="Reviewed trajectories"><h2>Trajectory</h2>
  <p className="quiet small">A reviewed move from A into B is different from having A and B. Dates and Concept associations alone never confirm a move. Owner statements remain User claims, not independent source verification.</p>
  <button disabled={busy||!!pending} onClick={()=>void load()}>Inspect trajectories</button>{message&&<p role="alert">{message}</p>}
  {pending?<div><h3>Review trajectory decision</h3>{'from' in pending?<><p>{pending.from.label} → {pending.to.label}</p><p>Origin: concept:{pending.from.id}. Destination: concept:{pending.to.id}.</p>
   <p>{pending.decision==='candidate'?'Unconfirmed inference candidate — does not establish a move.':'I explicitly confirm this Person made this transition.'}</p>
   {pending.chronology&&<p>Recorded periods: {JSON.stringify(pending.chronology)}</p>}<p>Supporting observations: {pending.supportingObservationIds.join(', ')||'Independent owner statement; no source attachments.'}</p>
   {'candidateId' in pending&&pending.candidateId&&<p>Candidate being reviewed: {pending.candidateId}</p>}</>:<p>{pending.decision} exact statement {pending.observationId}</p>}
   <p className="observation-text">{pending.reason}</p><button disabled={busy} onClick={()=>void save()}>Save trajectory decision</button><button disabled={busy} onClick={()=>setPending(null)}>Cancel trajectory decision</button></div>:page&&<>
   {page.available&&<><form onSubmit={event=>{event.preventDefault();void load({q});}}><label>Find a saved transition Concept <input value={q} minLength={2} maxLength={100} onChange={event=>setQ(event.target.value)}/></label><button disabled={busy||q.trim().length<2}>Find trajectory Concepts</button></form>
    {page.concepts.map(concept=><p key={concept.id}>{concept.label} ({concept.kind}) · concept:{concept.id} <button disabled={busy||concept.label.length>300} onClick={()=>setFrom(concept)}>Use as origin</button> <button disabled={busy||concept.label.length>300} onClick={()=>setTo(concept)}>Use as destination</button></p>)}
    {page.nextSearchCursor&&<button disabled={busy} onClick={()=>void load({q:search,searchCursor:page.nextSearchCursor!})}>More trajectory Concepts</button>}
    <p>Origin: {from?.label??'select explicitly'} → Destination: {to?.label??'select explicitly'}</p>
    <form onSubmit={event=>{event.preventDefault();if(!from||!to)return;preview({requestId:crypto.randomUUID(),personId:id,from,to,reason,
     supportingObservationIds:supports.split(/[\s,]+/).filter(Boolean),...(dated?{chronology}:{}),
     ...(correcting?{decision:'correct',observationId:correcting}:{decision:candidate?'candidate':'confirm'})});}}>
     <label>Explicit transition evidence / reason <textarea value={reason} required maxLength={2000} onChange={event=>setReason(event.target.value)}/></label>
     <label>Supporting Person Observation IDs (optional, comma separated) <input value={supports} maxLength={500} onChange={event=>setSupports(event.target.value)}/></label>
     <label><input type="checkbox" checked={dated} onChange={event=>{setDated(event.target.checked);if(!event.target.checked)setCandidate(false);}}/> Include recorded periods</label>
     {dated&&<>{(['from','to'] as const).map(side=><fieldset key={side}><legend>{side==='from'?'Origin':'Destination'} period</legend>
      {(['start','end'] as const).map(bound=><label key={bound}>{bound} (unknown if blank) <input aria-label={`${side} ${bound}`} value={chronology[side][bound]??''} maxLength={10} placeholder="YYYY, YYYY-MM or YYYY-MM-DD" onChange={event=>setChronology({...chronology,[side]:{...chronology[side],[bound]:event.target.value||null,...(bound==='end'&&event.target.value?{ongoing:false}:{})}})}/></label>)}
      <label><input type="checkbox" checked={chronology[side].ongoing} onChange={event=>setChronology({...chronology,[side]:{...chronology[side],ongoing:event.target.checked,...(event.target.checked?{end:null}:{})}})}/> Explicitly open-ended</label></fieldset>)}
      {!correcting&&<label><input type="checkbox" checked={candidate} onChange={event=>setCandidate(event.target.checked)}/> Propose an unconfirmed chronology candidate only (requires two current dated Person observations)</label>}
     </>}
     {correcting&&<p>Correcting statement {correcting}. The original and both reasons remain in history.</p>}
     <button disabled={busy||!from||!to||!reason.trim()}>Review trajectory statement</button>{correcting&&<button type="button" onClick={()=>setCorrecting(null)}>Cancel trajectory correction</button>}
    </form></>}
   {page.items.map(item=><article key={item.id}><h3><Link href={`/concept/${item.claim.from.id}`}>{item.claim.from.label}</Link> → <Link href={`/concept/${item.claim.to.id}`}>{item.claim.to.label}</Link></h3>
    <p>{item.confirmed?'Current owner-reviewed explicit transition':item.current?'Unconfirmed inferred candidate — not a Recall transition':'Historical / inactive / unsupported'}</p>
    <p>Statement: {item.id}. Recorded: {item.recordedAt}.</p><p className="observation-text">{item.text}</p>
    <p>Recorded supporting observations: {item.claim.supportingObservationIds.join(', ')||'Independent owner statement; no source attachments.'}</p>
    {item.claim.decision==='correct'&&<p>Revises statement: {item.claim.observationId}</p>}
    {item.claim.decision==='candidate'&&<p>Proposal rationale (User): {item.claim.reason}. Derivation: dated-input candidate, explicit-trajectory-v1; no calibrated confidence.</p>}
    <TrajectoryChronology value={item.claim.chronology} order={item.order}/>
    {'candidateId' in item.claim&&item.claim.candidateId&&<p>Reviewed candidate: {item.claim.candidateId}</p>}
    {item.evidence.map(e=><div key={e.id}><p>{e.layer} evidence · {e.provenance?.observationId}</p><p className="observation-text">{e.text}</p>
     {e.provenance?.snapshotId&&<Link href={`/snapshot/${e.provenance.snapshotId}`}>Inspect trajectory source evidence</Link>}
     {e.provenance?.encounterId&&<Link href={`/encounter/${e.provenance.encounterId}`}>Inspect trajectory encounter</Link>}</div>)}
    {item.reviews.map(review=><p key={review.id}>{review.decision}: {review.comment??'Recorded review'}. {review.reviewedAt}{review.replacementId&&` Replacement: ${review.replacementId}`}</p>)}
    {item.reviewable&&page.available&&<><p>Enter the confirmation, correction or withdrawal reason in the form above first.</p>
     {item.current&&!item.confirmed&&<button disabled={busy||!reason.trim()} onClick={()=>preview({...item.claim,requestId:crypto.randomUUID(),decision:'confirm',candidateId:item.id,reason})}>Review candidate as explicit transition</button>}
     {item.confirmed&&<button disabled={busy} onClick={()=>{setCorrecting(item.id);setFrom(item.claim.from);setTo(item.claim.to);setReason('');setSupports(item.claim.supportingObservationIds.join(', '));setDated(!!item.claim.chronology);setCandidate(false);setChronology(item.claim.chronology??{from:{...emptyPeriod},to:{...emptyPeriod}});}}>Correct trajectory statement</button>}
     <button disabled={busy||!reason.trim()} onClick={()=>preview({requestId:crypto.randomUUID(),personId:id,decision:'reject',observationId:item.id,reason})}>Withdraw / reject trajectory</button>
     <button disabled={busy||!reason.trim()} onClick={()=>preview({requestId:crypto.randomUUID(),personId:id,decision:'archive',observationId:item.id,reason})}>Archive trajectory statement</button></>}
   </article>)}
   {page.items.length===0&&<p>No trajectory statements on this page.</p>}
   {page.nextCursor&&<button disabled={busy} onClick={()=>void load({cursor:page.nextCursor!})}>More trajectory history</button>}
  </>}
 </section>;
}

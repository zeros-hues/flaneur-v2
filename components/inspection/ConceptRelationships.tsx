'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import type {ConceptPanelPage} from '@/lib/relationships/concept-reader';
type Choice={subjectId:string;conceptId:string;label:string;kind:'concept'|'topic';observationId?:string};
type PanelQuery={q?:string;cursor?:string;searchCursor?:string;historyEdge?:string;historyCursor?:string};
type Pending={requestId:string;subjectId:string;conceptId:string;reason:string}&({decision:'confirm';expectedConcept:{label:string;kind:'concept'|'topic'}}|{decision:'reject';observationId:string});
export function ConceptRelationships(props:{kind:'person'|'artifact'|'concept';id:string}){
 const id=props.id.toLowerCase();return <ConceptPanel key={`${props.kind}:${id}`} {...props} id={id}/>;
}
function ConceptPanel({kind,id}:{kind:'person'|'artifact'|'concept';id:string}){
 const [page,setPage]=useState<ConceptPanelPage|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [q,setQ]=useState(''),[choice,setChoice]=useState<Choice|null>(null),[reason,setReason]=useState(''),[pending,setPending]=useState<Pending|null>(null);
 const working=useRef(false),lastQuery=useRef('');
 async function load(query:PanelQuery={}){
  setPage(null);setChoice(null);const response=await fetch(`/api/concept-associations/${kind}/${id}?${new URLSearchParams(query)}`,{cache:'no-store'});
  if(!response.ok)throw new Error('UNAVAILABLE');const data=await response.json();
  if(data.kind!==kind||data.id!==id||!Array.isArray(data.items))throw new Error('INVALID_PAGE');
  lastQuery.current=query.q??'';setPage(data);
 }
 async function inspect(query:PanelQuery={}){
  if(working.current)return;working.current=true;setBusy(true);setMessage('');
  try{await load(query);}catch{setMessage('Concept relationships could not be loaded. Please try again.');}
  finally{working.current=false;setBusy(false);}
 }
 async function save(){
  if(!pending||working.current)return;working.current=true;setBusy(true);setMessage('');
  try{const response=await fetch('/api/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'review_concept_association',payload:pending})});
   if(!response.ok){setMessage(response.status===409?'The association or Concept changed. Cancel and refresh before reviewing again.':response.status===401?'Sign in again before reviewing.':
    'The association could not be confirmed. Retry uses the same decision.');return;}
   const receipt=await response.json();if(receipt.requestId!==pending.requestId||receipt.subjectId!==pending.subjectId||receipt.conceptId!==pending.conceptId||typeof receipt.observationId!=='string'||
    (pending.decision==='reject'&&receipt.observationId!==pending.observationId))throw new Error('INVALID_RECEIPT');
   setPending(null);setChoice(null);setReason('');
   try{await load();setMessage('Concept association decision recorded.');}catch{setMessage('Decision recorded. Refresh to inspect the current association.');}
  }catch{setMessage('The association could not be confirmed. Retry uses the same decision.');}
  finally{working.current=false;setBusy(false);}
 }
 return <section id={`reviewed-concept-relationships-${kind}-${id}`} aria-label="Reviewed Concept relationships" style={{overflowWrap:'anywhere'}}>
  <h2>Reviewed Concept relationships</h2>
  <p className="quiet small">These associations record your interpretation and exact reason. They do not establish that a source mentions the idea. Stored Concept categories, source hashtags and earlier inferred links remain separate.</p>
  {!page&&<button type="button" className="textlink" disabled={busy} onClick={()=>void inspect()}>{busy?'loading…':'inspect Concept relationships'}</button>}
  {page&&<>
   {!page.available&&<p>This object is inactive. Its association history remains available.</p>}
   {!page.items.length&&<p>No reviewed Concept associations are recorded on this page.</p>}
   <ul>{page.items.map(item=><li key={item.id}>
    <p><Link href={`/${item.subjectKind}/${item.subjectId}`}>{item.subjectLabel}</Link>{' → associated with → '}<Link href={`/concept/${item.conceptId}`}>{item.conceptLabel}</Link> · stored category: {item.conceptKind}</p>
    <p>{item.status==='owner-reviewed'?'Current owner-reviewed interpretation.':item.status==='candidate'?'Candidate association; no active relationship is established.':item.status==='rejected'?'Rejected association history.':'Historical association; current support is unavailable.'}</p>
    <ul>{item.history.map(proof=><li key={proof.id}>
     <p style={{whiteSpace:'pre-wrap'}}>{proof.reason}</p>
     <p className="quiet small">{proof.current?'Current User decision.':'Historical User decision.'} Concept at decision: {proof.conceptAtDecision.label} ({proof.conceptAtDecision.kind}).</p>
     {proof.withdrawalReason&&<p style={{whiteSpace:'pre-wrap'}}>Reason for withdrawal: {proof.withdrawalReason}</p>}
     {proof.withdrawable&&<button type="button" className="textlink" disabled={busy||!!pending} onClick={()=>{setChoice({subjectId:item.subjectId,conceptId:item.conceptId,label:item.conceptLabel,kind:item.conceptKind,observationId:proof.id});setReason('');}}>withdraw Concept association</button>}
    </li>)}</ul>
    {item.historyCount>item.history.length&&<p>Showing {item.history.length} of {item.historyCount} decisions on this history page.</p>}
    {item.nextHistoryCursor&&<button type="button" className="textlink" disabled={busy||!!pending} onClick={()=>void inspect({historyEdge:item.id,historyCursor:item.nextHistoryCursor!})}>more Concept decisions</button>}
   </li>)}</ul>
   <button type="button" className="textlink" disabled={busy||!!pending} onClick={()=>void inspect()}>first Concept relationships / refresh</button>
   {page.nextCursor&&<button type="button" className="textlink" disabled={busy||!!pending} onClick={()=>void inspect({cursor:page.nextCursor!})}>next Concept relationships</button>}
   {kind!=='concept'&&page.available&&!pending&&<>
    <form onSubmit={event=>{event.preventDefault();void inspect({q});}}><fieldset disabled={busy}>
     <label htmlFor={`concept-search-${id}`}>Find an existing Concept by label</label><input id={`concept-search-${id}`} required minLength={2} maxLength={100} value={q} onChange={event=>setQ(event.target.value)}/>
     <button type="submit" className="textlink">search Concepts</button></fieldset></form>
    <ul>{page.concepts.map(concept=><li key={concept.id}><Link href={`/concept/${concept.id}`}>{concept.label}</Link> · stored category: {concept.kind}
     <button type="button" className="textlink" disabled={busy||concept.label.length>300} onClick={()=>{setChoice({subjectId:id,conceptId:concept.id,label:concept.label,kind:concept.kind});setReason('');}}>select Concept</button>
     {concept.label.length>300&&<p>This label is too long for association review.</p>}
    </li>)}</ul>
    {lastQuery.current&&!page.concepts.length&&<p>No active Concept labels matched this search.</p>}
    {page.nextSearchCursor&&<button type="button" className="textlink" disabled={busy} onClick={()=>void inspect({q:lastQuery.current,searchCursor:page.nextSearchCursor!})}>next Concept matches</button>}
   </>}
  </>}
  {choice&&!pending&&<form onSubmit={event=>{event.preventDefault();if(!reason.trim())return;
   const shared={requestId:crypto.randomUUID(),subjectId:choice.subjectId,conceptId:choice.conceptId,reason};
   setPending(choice.observationId?{...shared,decision:'reject',observationId:choice.observationId}:{...shared,decision:'confirm',expectedConcept:{label:choice.label,kind:choice.kind}});}}>
   <p>{choice.observationId?'Withdraw':'Associate with'} {choice.label}?</p><label htmlFor={`concept-reason-${id}`}>Your reason</label>
   <textarea id={`concept-reason-${id}`} required maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/>
   <button type="submit" className="textlink" disabled={busy||!reason.trim()}>review Concept decision</button>
  </form>}
  {pending&&<><p>{pending.decision==='confirm'?`Record your association with ${pending.expectedConcept.label}?`:'Withdraw this exact association decision?'} Earlier decisions remain preserved.</p>
   <p style={{whiteSpace:'pre-wrap'}}>{pending.reason}</p>
   <button type="button" className="textlink" disabled={busy} onClick={()=>void save()}>save Concept decision</button>
   <button type="button" className="textlink" disabled={busy} onClick={()=>{setPending(null);setChoice(null);setReason('');setMessage('');}}>cancel Concept decision</button>
  </>}
  {message&&<p role="status">{message}</p>}
 </section>;
}

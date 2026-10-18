'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import type {AuthorshipPanelPage} from '@/lib/relationships/authorship-panels';
export function AuthorshipRelationships({kind,id}:{kind:'person'|'artifact';id:string}){
 return <AuthorshipPanel key={`${kind}:${id}`} kind={kind} id={id}/>;
}
function AuthorshipPanel({kind,id}:{kind:'person'|'artifact';id:string}){
 const [page,setPage]=useState<AuthorshipPanelPage|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const pending=useRef(false);
 async function load(cursor?:string){
  if(pending.current)return;pending.current=true;setBusy(true);setMessage('');setPage(null);
  try{const response=await fetch(`/api/authorship/${kind}/${id}${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,{cache:'no-store'});
   if(!response.ok)throw new Error('UNAVAILABLE');const result=await response.json();
   if(result.kind!==kind||result.id!==id||!Array.isArray(result.items))throw new Error('INVALID_PANEL');setPage(result);
  }catch{setPage(null);setMessage('Authorship relationships could not be loaded. Please try again.');}
  finally{pending.current=false;setBusy(false);}
 }
 return <section aria-label="Reviewed authorship relationships" style={{overflowWrap:'anywhere'}}>
  <h2>{kind==='person'?'Reviewed authored works':'Reviewed authors'}</h2>
  <p className="quiet small">These are explicit owner decisions about saved posts. They do not independently verify authorship. Profile links and earlier Person associations are not adopted as author evidence.</p>
  {!page&&<button type="button" className="textlink" disabled={busy} onClick={()=>void load()}>{busy?'loading…':'inspect authorship relationships'}</button>}
  {message&&<p role="alert">{message}</p>}
  {page&&<>
   {!page.items.length&&<p className="quiet small">No reviewed authorship relationships are recorded on this page.</p>}
   <ul>{page.items.map(item=><li key={item.id}>
    <p><Link href={`/artifact/${item.artifactId}`}>{item.sourceLabel||'Saved post'}</Link>{' → authored by → '}<Link href={`/person/${item.personId}`}>{item.personName}</Link></p>
    <p className="quiet small">{item.status==='owner-confirmed'?'Owner-confirmed authorship with current support.':item.status==='candidate'?'Candidate authorship; no active relationship is established.'
     :item.status==='rejected'?'Rejected authorship relationship.':'Historical authorship; current support is unavailable.'}</p>
    <p className="quiet small">{item.supportCount} current owner {item.supportCount===1?'decision':'decisions'}.</p>
    <ul>{item.history.map(proof=><li key={proof.id}>
     <p className="quiet small">{proof.current?'Current owner decision.':'Historical owner decision.'}</p>
     <p className="observation-text" style={{whiteSpace:'pre-wrap'}}>{proof.reason}</p>
     {proof.withdrawalReason&&<p className="observation-text" style={{whiteSpace:'pre-wrap'}}>Reason for withdrawal: {proof.withdrawalReason}</p>}
     <Link href={`/snapshot/${proof.snapshotId}`}>inspect authorship decision</Link>
     {proof.encounterId&&<> · <Link href={`/encounter/${proof.encounterId}`}>inspect authorship encounter</Link></>}
    </li>)}</ul>
    {item.historyCount>item.history.length&&<p className="quiet small">Showing {item.history.length} of {item.historyCount} decisions. Inspect the <Link href={`/artifact/${item.artifactId}`}>Artifact’s original captures</Link> for the complete source review.</p>}
   </li>)}</ul>
   <button type="button" className="textlink" disabled={busy} onClick={()=>void load()}>first authorship relationships / refresh</button>
   {page.nextCursor&&<button type="button" className="textlink" disabled={busy} onClick={()=>void load(page.nextCursor!)}>next authorship relationships</button>}
  </>}
 </section>;
}

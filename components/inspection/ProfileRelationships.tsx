"use client";
import Link from 'next/link';
import {useState} from 'react';
import type {ProfileRelationshipsPage} from '@/lib/relationships/profile-reader';
export function ProfileRelationships({kind,id}:{kind:'person'|'artifact';id:string}){
 const [page,setPage]=useState<ProfileRelationshipsPage|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(cursor?:string){
  setBusy(true);setMessage('');
  try{const response=await fetch(`/api/relationships/${kind}/${id}${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,{cache:'no-store'});
   if(!response.ok)throw new Error('UNAVAILABLE');setPage(await response.json());
  }catch{setPage(null);setMessage('Profile relationships could not be loaded. Please try again.');}
  finally{setBusy(false);}
 }
 return <section aria-label="Reviewed profile relationships">
  <h2>Reviewed profile relationships</h2>
  <p className="quiet small">These links record your confirmed captured-profile associations. Each depends on the captures and decisions shown; it does not establish authorship or a profile’s current external contents.</p>
  {!page&&<button type="button" className="textlink" disabled={busy} onClick={()=>void load()}>{busy?'loading…':'inspect profile relationships'}</button>}
  {message&&<p role="alert">{message}</p>}
  {page&&<>
   {!page.items.length&&<p className="quiet small">No reviewed profile relationships are recorded on this page. Earlier associations are not automatically adopted.</p>}
   <ul>{page.items.map(item=><li key={item.id}>
    <p><Link href={`/artifact/${item.artifactId}`}>{item.sourceLabel||'Captured profile'}</Link>{' → profile of → '}<Link href={`/person/${item.personId}`}>{item.personName}</Link></p>
    <p className="quiet small">{item.status==='supported'?'Supported by current owner confirmations.':item.status==='conflict'?'Different current capture associations remain unresolved.'
     :item.status==='candidate'?'Candidate link; no active relationship is established.':item.status==='rejected'?'Rejected relationship history.':'Historical link; current support is unavailable.'}</p>
    <ul>{item.support.map(support=><li key={support.assertionId}><Link href={`/snapshot/${support.snapshotId}`}>inspect supporting capture</Link>{' · '}
     <Link href={`/encounter/${support.encounterId}`}>inspect recorded encounter</Link></li>)}</ul>
    {item.supportCount>item.support.length&&<p className="quiet small">Showing {item.support.length} of {item.supportCount} current supports. Inspect the Artifact’s captures for the full trail.</p>}
   </li>)}</ul>
   <button type="button" className="textlink small" disabled={busy} onClick={()=>void load()}>first relationships / refresh</button>
   {page.nextCursor&&<button type="button" className="textlink small" disabled={busy} onClick={()=>void load(page.nextCursor!)}>next relationships</button>}
  </>}
 </section>;
}

"use client";
import Link from "next/link";
import { useRef,useState } from "react";
import type { SourceReviewPage } from "@/lib/identity/source-review";
import { IdentityDecision } from "@/components/person/IdentityInspector";
import { CreatePersonDecision } from './CreatePersonDecision';
import {ReassignIdentityDecision} from './ReassignIdentityDecision';

export function SourceIdentityReview({snapshotId}:{snapshotId:string}){
 const [page,setPage]=useState<SourceReviewPage|null>(null),[query,setQuery]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const search=useRef(''),cursor=useRef<string|undefined>(undefined);
 async function load(q='',after?:string){
  setBusy(true);setMessage('');setSelected(null);
  try{
   const params=new URLSearchParams({...q?{q}:{},...after?{cursor:after}:{}});
   const response=await fetch(`/api/snapshot/${snapshotId}/identity?${params}`,{cache:'no-store'});
   if(!response.ok)throw new Error('UNAVAILABLE');
   const result=await response.json() as SourceReviewPage;
   search.current=q;cursor.current=after;setPage(result);
  }catch{setMessage('Person associations could not be loaded. Please try again.');}
  finally{setBusy(false);}
 }
 const refresh=()=>load(search.current,cursor.current);
 return <section aria-label="Review captured profile identity">
  <h2>Person association</h2>
  <p className="quiet small">For a captured profile, select an existing person only after inspecting the source. Matching names and URLs do not establish identity. A confirmation applies to this capture; it does not establish authorship or merge people.</p>
  {!page&&<button type="button" className="textlink" disabled={busy} onClick={()=>void load()}>{busy?'loading…':'review person association'}</button>}
  {message&&<p role="alert">{message}</p>}
  {page&&<>
   {!page.supported?<p>This source is not a supported captured profile. No person can be confirmed here.</p>:<>
    {!page.available&&<p>This capture or its source is inactive or unavailable for a new association.</p>}
    {page.associations.length>0&&<><h3>Recorded associations</h3><ul>{page.associations.map(person=><li key={person.id}>
     <Link href={`/person/${person.id}`}>{person.name}</Link>{person.inactive&&' · inactive'}
     <p className="quiet small">{person.capture.state==='associated'?'A current identity assertion is recorded.':person.capture.state==='conflict'
      ?'Conflicting associations require separate review.':'A historical link may remain without a current identity assertion.'}</p>
     {person.capture.proof&&<p>{person.capture.proof.bodyText}</p>}
     {person.capture.proof?.reassignment&&<>
      <p className="quiet small">Your reason for reassignment</p><p className="observation-text">{person.capture.proof.reassignment.reason}</p>
      <Link href={`/person/${person.capture.proof.reassignment.fromPersonId}`}>inspect earlier person and decision</Link>
     </>}
     <IdentityDecision capture={{...person.capture,actions:{confirm:false,reject:person.capture.actions.reject}}}
      personId={person.id} personName={person.name} refresh={refresh}/>
    </li>)}</ul></>}
    {page.available&&<>
     <form onSubmit={event=>{event.preventDefault();void load(query.trim());}}>
      <label htmlFor="source-person-search">Find an existing person by name</label>
      <input id="source-person-search" type="search" minLength={2} maxLength={100} value={query} disabled={busy}
       onChange={event=>setQuery(event.target.value)} required/>
      <button type="submit" className="textlink" disabled={busy||query.trim().length<2}>{busy?'searching…':'search people'}</button>
     </form>
     {search.current&&<p className="quiet small">Name matches for “{search.current}”. These are choices, not verified identity suggestions.</p>}
     {search.current&&!page.people.length&&<p>No existing person matched this name.</p>}
     <ul>{page.people.map(person=><li key={person.id}>
      <Link href={`/person/${person.id}`}>{person.name}</Link>
      {person.capture.actions.confirm?<>
       {selected!==person.id?<button type="button" className="textlink small" disabled={busy} onClick={()=>setSelected(person.id)}>select this person</button>
        :<IdentityDecision capture={{...person.capture,actions:{confirm:true,reject:false}}} personId={person.id} personName={person.name} refresh={refresh}/>}
      </>:<>
       <p className="quiet small">This person conflicts with recorded associations.</p>
       {page.reassignment&&page.reassignment.fromPersonId!==person.id&&<>
        {selected!==person.id?<button type="button" className="textlink small" disabled={busy} onClick={()=>setSelected(person.id)}>select replacement person</button>
         :<ReassignIdentityDecision snapshotId={snapshotId} from={page.reassignment} personId={person.id} personName={person.name} refresh={refresh}/>}
       </>}
      </>}
     </li>)}</ul>
     {page.nextCursor&&<button type="button" className="textlink" disabled={busy} onClick={()=>void load(search.current,page.nextCursor!)}>next name matches</button>}
     {search.current&&page.canCreatePerson&&<CreatePersonDecision key={search.current} snapshotId={snapshotId} initialName={search.current} refresh={refresh}/>}
     {search.current&&!page.canCreatePerson&&!page.associations.length&&<p className="quiet small">Creating a new person is unavailable for this capture. Existing-person review remains available.</p>}
    </>}
   </>}
   <button type="button" className="textlink small" disabled={busy} onClick={()=>void load()}>refresh associations</button>
  </>}
 </section>;
}

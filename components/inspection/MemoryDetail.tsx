import Link from "next/link";
import {ProfileRelationships} from './ProfileRelationships';
import {AuthorshipRelationships} from './AuthorshipRelationships';
import {ConceptRelationships} from './ConceptRelationships';
import type { inspectMemoryTransaction } from "@/lib/inspection/postgres";
import "./inspection.css";
type Detail=NonNullable<Awaited<ReturnType<typeof inspectMemoryTransaction>>["detail"]>;
export function MemoryDetail({detail,query}:{detail:Detail;query:Record<string,string>}){
 const page=(key:string,value:string|number)=>`/${detail.kind}/${detail.id}?${new URLSearchParams({...query,[key]:String(value)})}`;
 return <main className="sheet"><article className="sheet__main memory-detail">
  <h1>{detail.kind==="artifact"?"Saved Artifact":"Encounter"}</h1>
  {detail.archived&&<p role="note">Archived history. This record is excluded from active retrieval.</p>}
  {detail.artifact&&<>
   <p className="quiet">{detail.artifact.type} · saved {detail.artifact.capturedAt}</p>
   {detail.artifact.sourceUrl&&<a href={detail.artifact.sourceUrl} target="_blank" rel="noopener noreferrer">open original source</a>}
   <h2>Stored Artifact text</h2><p className="quiet small">Preserved text from the stored Artifact. It may differ from the original capture.</p>
   <pre>{detail.artifact.text??"No stored Artifact text is available. Inspect its captures below."}</pre>
   {detail.artifact.nextOffset!==null&&<Link href={page("offset",detail.artifact.nextOffset)}>next text section</Link>}
   {detail.artifact.legacyPersonId&&<p>Earlier Person association: <Link href={`/person/${detail.artifact.legacyPersonId}`}>inspect associated Person</Link>. This association does not establish authorship.</p>}
  </>}
  {detail.encounter&&<>
   <p>{detail.encounter.type}</p><p>Stored encounter time: {detail.encounter.occurredAt}</p>
   <p className="quiet small">Historical encounter clocks are not independently verified.</p><p>Recorded in Flaneur: {detail.encounter.recordedAt}</p>
   <h2>Recorded context</h2><pre>{detail.encounter.contextText??"No explicit context was recorded."}</pre>
   {detail.encounter.sourceContext&&<details><summary>Recorded source metadata</summary><pre>{detail.encounter.sourceContext}</pre></details>}
   <h2>Recorded object links</h2><ul>{detail.links.map(item=><li key={`${item.id}:${item.relation}`}>
    {item.relation}: {["person","artifact","encounter"].includes(item.kind)?<Link href={`/${item.kind}/${item.id}`}>{item.label}</Link>:item.label}{item.archived&&" (archived)"}
   </li>)}</ul>
  </>}
  {detail.kind==='artifact'&&<ProfileRelationships kind="artifact" id={detail.id}/>}
  {detail.kind==='artifact'&&<AuthorshipRelationships kind="artifact" id={detail.id}/>}
  {detail.kind==='artifact'&&<ConceptRelationships kind="artifact" id={detail.id}/>}
  <h2>Original captures</h2>{!detail.sources.length&&<p>No capture is linked here. Historical backfill remains incomplete.</p>}
  <ul>{detail.sources.map(source=><li key={source.id}><Link href={`/snapshot/${source.id}`}>inspect capture from {source.capturedAt}</Link></li>)}</ul>
  {detail.nextSnapshot&&<Link href={page("snapshots",detail.nextSnapshot)}>more captures</Link>}
  {detail.kind==="artifact"&&<><h2>Recorded encounters</h2><ul>{detail.encounters.map(encounter=><li key={encounter.id}>
   <Link href={`/encounter/${encounter.id}`}>{encounter.kind} · {encounter.occurredAt}</Link>{encounter.archived&&" (archived)"}</li>)}</ul>
   {!detail.encounters.length&&<p>No Encounter association is recorded here.</p>}{detail.nextEncounter&&<Link href={page("encounters",detail.nextEncounter)}>more encounters</Link>}</>}
  <h2>Observations and evidence</h2>{!detail.observations.length&&<p>No observations are recorded directly on this object.</p>}
  <p className="quiet small">Your words establish authorship, not external factual verification. Matching a quotation verifies its text, not the assertion or association.</p>
  {detail.observations.map(observation=><section key={observation.id}>
   <p className="quiet small">{observation.layer==="user"?"Your words":observation.layer==="source"?"Source text":observation.layer==="inferred"?"Inference":"Extracted text"} · {observation.active?"current":"historical / inactive"} · support {observation.supportStatus}</p>
   <pre>{observation.bodyText}</pre>{observation.evidence.map(evidence=><div key={evidence.id}>
    {evidence.quote&&<blockquote>{evidence.quote}</blockquote>}
    <p className="quiet small">{evidence.role} · {evidence.quoteVerified?"Quote matches the stored representation.":"Quote support is unavailable or unverified."}</p>
    {evidence.snapshotId&&<Link href={`/snapshot/${evidence.snapshotId}`}>inspect captured source</Link>}
    {evidence.supportingObservationId&&<p className="quiet small">Support references another stored observation.</p>}
   </div>)}
   {observation.reviews.map((review,index)=><p key={index}>{review.decision} · {review.reviewedAt}{review.comment&&`: ${review.comment}`}</p>)}
  </section>)}
  {detail.nextObservation&&<Link href={page("observations",detail.nextObservation)}>more observation history</Link>}
 </article></main>;
}

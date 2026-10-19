import {TrajectoryChronology} from '../inspection/TrajectoryChronology';
import Link from "next/link";
import type { MemoryBlock as MemoryResult } from "@/lib/query/memory";
import { ms } from "./timing";
export function MemoryBlock({block,at}:{block:MemoryResult;at:number}){
  return <section className="q-people" style={ms(at)} aria-label="Memory matches">
    {block.interpretation&&<p className="quiet small">{block.interpretation}</p>}
    {block.state==="clarification"&&<ul>{block.questions.map((question,index)=><li key={index}>{question}</li>)}</ul>}
    {block.state==="unavailable"&&<p className="q-empty" role="alert">Memory retrieval is unavailable. Please try again.</p>}
    {block.state==="no_match"&&<p className="q-empty">No supported memory matched this query yet. Some saved material may not be searchable yet.</p>}
    {block.state==="insufficient_population"&&<p className="q-empty">There isn’t enough represented memory to support that reflection yet.</p>}
    <ol className="q-people__list">{block.items.map(item=><li key={item.id} className="q-person">
      <p><Link href={`/${item.kind}/${item.id}`}>{item.label}</Link></p>
      {item.uncertain&&<p className="quiet small">Some requested facts or dates could not be verified.</p>}
      {item.evidence.map(evidence=><div key={evidence.id} className="observation-evidence">
        <p className="quiet small">{evidence.provenance?.trajectory?'Your reviewed trajectory — explicit owner claim, not independently verified':evidence.provenance?.relationship?(evidence.provenance.relationship.predicate==='associated_with_concept'?'Your reviewed Concept association — interpretation, not a source mention':'organisationId' in evidence.provenance.relationship?'Your reviewed education/employment assertion — not independently verified':evidence.provenance.relationship.predicate==='authored_by'?'Your reviewed authorship decision — not independently verified':'Your reviewed profile association — not independently verified'):evidence.layer==="user"?(evidence.provenance?.legacyNoteId?"Earlier saved words":"Your words / confirmation")
          :evidence.layer==="inferred"?"Inference":evidence.layer==="source"?(evidence.provenance?.representationId?"Captured source text":"Source text"):"Extracted text"}
          {!evidence.verified&&" · support unverified"}</p>
        <p className="observation-text">{evidence.text}</p>
        {evidence.provenance?.sourceUrl&&<a className="textlink small" href={evidence.provenance.sourceUrl} target="_blank" rel="noopener noreferrer">open original source</a>}
        {evidence.provenance?.snapshotId&&<Link className="textlink small" href={`/snapshot/${evidence.provenance.snapshotId}`}>inspect captured source</Link>}
        {evidence.provenance?.encounterId&&<Link className="textlink small" href={`/encounter/${evidence.provenance.encounterId}`}>inspect encounter</Link>}
        {evidence.provenance?.trajectory&&<><p><Link href={`/concept/${evidence.provenance.trajectory.from.id}`}>{evidence.provenance.trajectory.from.label}</Link> → <Link href={`/concept/${evidence.provenance.trajectory.to.id}`}>{evidence.provenance.trajectory.to.label}</Link></p>
          <TrajectoryChronology value={evidence.provenance.trajectory.chronology} order={evidence.provenance.trajectory.order}/>
          <Link className="textlink small" href={`/person/${item.id}#reviewed-trajectory-${item.id}`}>inspect trajectory evidence / decision history</Link></>}
        {evidence.provenance?.relationship&&(evidence.provenance.relationship.predicate==='associated_with_concept'?
          <><Link className="textlink small" href={`/concept/${evidence.provenance.relationship.conceptId}`}>inspect reviewed Concept</Link>
          <p className="quiet small">Concept at decision: {evidence.provenance.relationship.conceptLabel} ({evidence.provenance.relationship.conceptKind}).</p>
          <Link className="textlink small" href={`/${item.kind}/${item.id}#reviewed-concept-relationships-${item.kind}-${item.id}`}>inspect Concept decision history</Link></>:
          'organisationId' in evidence.provenance.relationship?<><p className="quiet small">{evidence.provenance.relationship.predicate==='educated_at'?'Studied at':'Worked at'} {evidence.provenance.relationship.organisationLabel}{evidence.provenance.relationship.fieldOfStudy&&` — ${evidence.provenance.relationship.fieldOfStudy}`}</p><Link className="textlink small" href={`/person/${item.id}#reviewed-career-${item.id}`}>inspect education/employment decision history</Link></>:
          <Link className="textlink small" href={`/person/${evidence.provenance.relationship.personId}`}>inspect related Person</Link>)}
        {item.kind==="person"&&<Link className="textlink small" href={`/person/${item.id}${evidence.provenance?.legacyNoteId
          ?`#legacy-note-${evidence.provenance.legacyNoteId}`:""}`}>inspect memory and source</Link>}
      </div>)}
    </li>)}</ol>
    {block.state==="matches"&&<p className="quiet small">{block.matchedTotal} matching memories; {block.uncertainTotal} with uncertain filters. Showing a finite selection of stored evidence.</p>}
  </section>;
}

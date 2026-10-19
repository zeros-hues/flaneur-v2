import {TrajectoryChronology} from '../inspection/TrajectoryChronology';
import Link from "next/link";
import type { MemoryBlock as MemoryResult } from "@/lib/query/memory";
import { ms } from "./timing";
export function MemoryBlock({block,at}:{block:MemoryResult;at:number}){
  return <section className="q-people" style={ms(at)} aria-label="Memory matches">
    {block.interpretation&&<p className="quiet small">{block.interpretation}</p>}
    {block.state==="clarification"&&<ul>{block.questions.map((question,index)=><li key={index}>{question}</li>)}</ul>}
    {block.state==="unavailable"&&<p className="q-empty" role="alert">Memory retrieval is unavailable. Please try again.</p>}
    {block.state==="no_match"&&<p className="q-empty">{block.mode==="resurface"?"I couldn’t find enough in your saved trail that looks relevant yet.":block.mode==="reflect"?"I don’t have enough repeated evidence in your trail yet to call this a pattern.":"No supported memory matched this query yet. Some saved material may not be searchable yet."}</p>}
    {block.state==="insufficient_population"&&<p className="q-empty">{block.mode==="reflect"?"I don’t have enough repeated evidence in your trail yet to call this a pattern.":"There isn’t enough represented memory to support that reflection yet."}</p>}
    {block.mode==="reflect"&&block.patterns&&block.patterns.length>0?(
      <div className="q-reflect-patterns">
        {block.patterns.map(pattern=><article key={pattern.id} className="q-pattern-card" style={{marginBottom:"2.5rem"}}>
          <div className="q-pattern-header" style={{marginBottom:"1rem"}}>
            <p className="quiet small" style={{textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"0.25rem"}}>A recurring pattern in your trail</p>
            <h3 style={{fontSize:"1.2rem",fontWeight:600,margin:"0.25rem 0"}}>{pattern.observationCopy}</h3>
            <p className="quiet small">{pattern.supportingPeopleCount} of {pattern.totalPopulation} people</p>
          </div>
          <ol className="q-people__list">
            {pattern.supportingPeople.map(person=><li key={person.personId} className="q-person" style={{marginBottom:"1.25rem"}}>
              <p>
                <Link href={`/person/${person.personId}`}><strong>{person.personName}</strong></Link>
                {person.headline&&<span className="quiet small"> — {person.headline}</span>}
              </p>
              <div className="q-pattern-signals" style={{marginTop:"0.5rem"}}>
                <p className="quiet small" style={{fontWeight:500,marginBottom:"0.25rem"}}>Supporting signals:</p>
                <ul style={{listStyleType:"none",paddingLeft:0,margin:0}}>
                  {person.signals.map((sig,idx)=><li key={idx} className="quiet small" style={{padding:"0.15rem 0"}}>
                    {sig.supportKind==="owner_authored_note"?(
                      <span>Your note: &ldquo;{sig.value}&rdquo;</span>
                    ):sig.supportKind==="structured_fact"?(
                      <span>Structured {sig.label.toLowerCase()}: {sig.value}</span>
                    ):sig.supportKind==="reviewed_fact"?(
                      <span>Reviewed fact: {sig.value}</span>
                    ):(
                      <span>{sig.label}: {sig.value}</span>
                    )}
                    {sig.detail&&<p>{sig.detail}</p>}
                    {sig.provenance?.legacyStatus==="legacy_unverified"&&<p>Earlier saved role text; domain classification is inferred, not reviewed proof.</p>}
                  </li>)}
                </ul>
              </div>
            </li>)}
          </ol>
        </article>)}
      </div>
    ):(
      <ol className="q-people__list">{block.items.map(item=><li key={item.id} className="q-person">
        <p><Link href={`/${item.kind}/${item.id}`}>{item.label}</Link></p>
        {item.retrievalReason&&<div className="retrieval-reason quiet small" style={{marginBottom:"0.5rem"}}>
          <span style={{fontWeight:500}}>{item.retrievalReason.headline}</span>
          {item.retrievalReason.conceptBridge&&<span> · Connected via concept: <em>{item.retrievalReason.conceptBridge}</em></span>}
          {item.retrievalReason.userSalienceBoost&&<span> · Includes your notes</span>}
          {item.retrievalReason.score!==undefined&&<span title="Ephemeral retrieval score, not a graph fact"> ({Math.round(item.retrievalReason.score*100)}% match)</span>}
        </div>}
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
    )}
    {block.state==="matches"&&<p className="quiet small">{block.matchedTotal} matching memories; {block.uncertainTotal} with uncertain filters. Showing a finite selection of stored evidence.</p>}
  </section>;
}

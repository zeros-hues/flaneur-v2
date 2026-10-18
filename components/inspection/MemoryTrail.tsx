import Link from "next/link";
import type { TrailView } from "@/lib/trail/postgres";
import { ObservationEvidence } from "./ObservationEvidence";
import "./inspection.css";

const associationLabel=(association:string)=>association==="hashtag"?"Source-authored hashtag association (legacy; source support has not been migrated)":
  association==="inferred"?"Inferred concept association (legacy; unverified)":association==="legacy_person"?
  "Earlier Person association; authorship is not established":"Associated through a recorded Encounter; authorship is not established";

export function MemoryTrail({view,query}:{view:TrailView;query:Record<string,string>}) {
  const page=(key:string,value:string)=>`/${view.kind}/${view.id}?${new URLSearchParams({...query,[key]:value})}`;
  return <div className="memory-detail">
    <section aria-label="Recorded encounters">
      <h2>Encounters in your trail</h2>
      <p className="quiet small">Newest recorded encounter time first. Historical clocks are not independently verified. Each association below is a recorded link, not proof of authorship or a relationship.</p>
      {!view.encounters.length&&<p>No eligible Encounters on this page. Earlier captures may still await historical backfill.</p>}
      <ol>{view.encounters.map(encounter=><li key={encounter.id}>
        <Link href={`/encounter/${encounter.id}`}>{encounter.kind} · {encounter.occurredAt}</Link>
        {!encounter.direct&&<p className="quiet small">Appears through an Artifact’s legacy concept association.</p>}
        {encounter.context!==null&&<><p className="quiet small">Explicit context recorded with this Encounter</p><pre>{encounter.context}{encounter.clipped?"…":""}</pre></>}
        {encounter.links.length>0&&<ul>{encounter.links.map(link=><li key={`${link.id}:${link.relation}`}>
          {link.relation}: <Link href={`/${link.kind}/${link.id}`}>{link.label}</Link>
        </li>)}</ul>}
      </li>)}</ol>
      {view.nextEncounter&&<Link href={page("encounters",view.nextEncounter)}>older encounters</Link>}
    </section>
    <section aria-label="Saved work and appearances">
      <h2>{view.kind==="person"?"Saved work and context":"Appearances in saved Artifacts"}</h2>
      {!view.artifacts.length&&<p>No eligible Artifact associations on this page.</p>}
      <ol>{view.artifacts.map(artifact=><li key={artifact.id}>
        <Link href={`/artifact/${artifact.id}`}>{artifact.type} · saved {artifact.capturedAt}</Link>
        <p className="quiet small">{associationLabel(artifact.association)}</p>
        {artifact.text!==null&&<pre>{artifact.text}{artifact.clipped?"…":""}</pre>}
      </li>)}</ol>
      {view.nextArtifact&&<Link href={page("artifacts",view.nextArtifact)}>older saved Artifacts</Link>}
    </section>
    {view.observationPage&&<section aria-label="Observations and evidence">
      <h2>Your observations and recorded assertions</h2>
      <ObservationEvidence observations={view.observationPage.observations}/>
      {view.observationPage.nextCursor&&<Link href={page("observations",view.observationPage.nextCursor)}>more observation history</Link>}
    </section>}
  </div>;
}

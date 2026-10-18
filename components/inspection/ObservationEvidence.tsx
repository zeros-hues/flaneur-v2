import Link from "next/link";
import type { InspectionPage } from "@/lib/review/inspection";

export function ObservationEvidence({observations}:{observations:InspectionPage["observations"]}) {
  return <>
    {!observations.length&&<p>No observations are recorded directly on this object.</p>}
    <p className="quiet small">Your words establish authorship, not external factual verification. Matching a quotation verifies its text, not the assertion or association.</p>
    {observations.map(observation=><section key={observation.id}>
      <p className="quiet small">{observation.layer==="user"?"Your words":observation.layer==="source"?"Source text":observation.layer==="inferred"?"Inference":"Extracted text"} · {observation.active?"current":"historical / inactive"} · {observation.semanticRole} · support {observation.supportStatus}</p>
      <pre>{observation.bodyText}</pre>
      {observation.evidence.map(evidence=><div key={evidence.id}>
        {evidence.quote&&<blockquote>{evidence.quote}</blockquote>}
        <p className="quiet small">{evidence.role} · {evidence.quoteVerified?"Quote matches the stored representation.":"Quote support is unavailable or unverified."}</p>
        {evidence.snapshotId&&<Link href={`/snapshot/${evidence.snapshotId}`}>inspect captured source</Link>}
        {evidence.supportingObservationId&&<p className="quiet small">Support references another stored observation.</p>}
      </div>)}
      {observation.reviews.map((review,index)=><p key={index}>{review.decision} · {review.reviewedAt}{review.comment&&`: ${review.comment}`}</p>)}
    </section>)}
  </>;
}

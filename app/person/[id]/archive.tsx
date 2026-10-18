import type { PersonView } from "@/lib/views/person";
import { formatRange } from "@/lib/views/format";

/** Earlier projections remain inspectable without promoting them to supported current facts. */
export function Archive({view}:{view:PersonView}) {
  if(!view.roles.length&&!view.schools.length&&!view.synthesis)return null;
  return <details className="person-archive memory-detail">
    <summary>Earlier profile and generated context (unverified)</summary>
    <p className="quiet small">These projections were created by the earlier app. Their source support and current accuracy have not been established. Dates and “current” labels describe the stored projection.</p>
    {view.roles.length>0&&<section className="person-section"><h2 className="sheet-label">Earlier role records</h2>
      <ol className="person-roles">{view.roles.map(role=><li key={role.id} className="person-role">
        <p>{role.title}</p><p className="sheet-sub">{[role.company,formatRange(role.startDate,role.startPrecision,role.endDate,role.endPrecision,role.isCurrent)].filter(Boolean).join(" · ")}</p>
      </li>)}</ol></section>}
    {view.schools.length>0&&<section className="person-section"><h2 className="sheet-label">Earlier education records</h2>
      <ol className="person-schools">{view.schools.map(school=><li key={school.id}>
        <p>{school.school}</p><p>{[school.degree,school.fieldOfStudy,formatRange(school.startDate,school.startPrecision,school.endDate,school.endPrecision)].filter(Boolean).join(" · ")}</p>
      </li>)}</ol></section>}
    {view.synthesis&&<section><h2>Earlier generated synthesis · Inference</h2><pre>{view.synthesis}</pre></section>}
  </details>;
}

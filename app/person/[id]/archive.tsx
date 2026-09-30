// Bottom half of the person page: captured fact, archive register.
import Link from "next/link";
import type { PersonView } from "@/lib/views/person";
import { formatDay, formatRange, snippet } from "@/lib/views/format";

const LOW_CONFIDENCE = 0.6;

const DOMAIN_NAMES: Record<string, string> = { ml: "machine learning", "ui-ux": "ui/ux" };
const domainName = (d: string) => DOMAIN_NAMES[d] ?? d.replace(/^other:/, "").replace(/-/g, " ");
const MODE_NAMES: Record<string, string> = { ic: "individual contributor" };
const modeName = (m: string) => MODE_NAMES[m] ?? m;

function coverageLine(view: PersonView, section: "experience" | "education"): string | null {
  const row = view.coverage.find((c) => c.section === section);
  if (!row || row.isComplete) return null;
  const [n, noun] = section === "experience" ? [view.roles.length, "roles"] : [view.schools.length, "education entries"];
  return row.knownTotal ? `${n} of ${row.knownTotal} ${noun} captured` : `${n} ${noun} captured; the full list wasn't loaded`;
}

export function Archive({ view }: { view: PersonView }) {
  const experienceGap = coverageLine(view, "experience");
  const educationGap = coverageLine(view, "education");

  return (
    <div className="archive stack-lg">
      {view.roles.length > 0 && (
        <section>
          <h2 className="section-title">experience</h2>
          <ol className="timeline">
            {view.roles.map((r) => {
              const range = formatRange(r.startDate, r.startPrecision, r.endDate, r.endPrecision, r.isCurrent);
              return (
              <li key={r.id}>
                <p>
                  {r.title}
                  {r.company && <span className="quiet"> · {r.company}</span>}
                </p>
                <p className="timeline__meta">
                  {range && <span>{range}</span>}
                  {r.domain && <span>{domainName(r.domain)}</span>}
                  {r.mode && <span>{modeName(r.mode)}</span>}
                  {r.domainConfidence !== null && r.domainConfidence < LOW_CONFIDENCE && <span>low confidence</span>}
                </p>
              </li>
              );
            })}
          </ol>
          {experienceGap && <p className="quiet small">{experienceGap}</p>}
        </section>
      )}

      {view.schools.length > 0 && (
        <section>
          <h2 className="section-title">education</h2>
          <ol className="timeline">
            {view.schools.map((e) => {
              const detail = [e.degree, e.fieldOfStudy].filter(Boolean).join(", ");
              const range = formatRange(e.startDate, e.startPrecision, e.endDate, e.endPrecision);
              return (
              <li key={e.id}>
                <p>{e.school}</p>
                <p className="timeline__meta">
                  {detail && <span>{detail}</span>}
                  {range && <span>{range}</span>}
                </p>
              </li>
              );
            })}
          </ol>
          {educationGap && <p className="quiet small">{educationGap}</p>}
        </section>
      )}

      {view.concepts.length > 0 && (
        <section>
          <h2 className="section-title">concepts</h2>
          <ul className="tags">
            {view.concepts.map((c) => (
              <li key={c.id}>
                <Link href={`/concept/${c.id}`}>{c.label}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.posts.length > 0 && (
        <section>
          <h2 className="section-title">posts</h2>
          {/* Anchored so answers on the home search can link to the post they drew on. */}
          <ol className="timeline">
            {view.posts.map((post) => (
              <li key={post.id} id={`post-${post.id}`}>
                <p>{snippet(post.bodyText, 200) ?? "(no text)"}</p>
                <p className="timeline__meta">{formatDay(post.capturedAt)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

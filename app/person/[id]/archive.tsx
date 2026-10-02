// Bottom half of the person page: captured fact, archive register.
import Link from "next/link";
import type { PersonView } from "@/lib/views/person";
import { domainName, formatDay, formatRange, snippet } from "@/lib/views/format";

const LOW_CONFIDENCE = 0.6;
const FILL_IN = "visit their profile to fill this in";

const MODE_NAMES: Record<string, string> = { ic: "individual contributor" };
const modeName = (m: string) => MODE_NAMES[m] ?? m;

/** What the archive is missing, in the reference's words; null when the capture is complete. */
function caveat(view: PersonView): string | null {
  if (!view.roles.length && !view.schools.length) return `captured from a post only — ${FILL_IN}`;
  const experience = view.coverage.find((c) => c.section === "experience");
  if (!experience || experience.isComplete) return null;
  return experience.knownTotal
    ? `${view.roles.length} of ${experience.knownTotal} roles captured — ${FILL_IN}`
    : `${view.roles.length} roles captured; the full list wasn't loaded — ${FILL_IN}`;
}

export function Archive({ view }: { view: PersonView }) {
  const missing = caveat(view);
  return (
    <div className="person-archive">
      {view.roles.length > 0 && (
        <section className="person-section">
          <h2 className="sheet-label">roles</h2>
          <ol className="person-roles">
            {view.roles.map((r) => {
              const range = formatRange(r.startDate, r.startPrecision, r.endDate, r.endPrecision, r.isCurrent);
              const unsure = r.domainConfidence !== null && r.domainConfidence < LOW_CONFIDENCE;
              return (
                <li key={r.id} className="person-role">
                  <p className="person-role__title">{r.title}</p>
                  <p className="sheet-sub">{[r.company, range].filter(Boolean).join(" · ")}</p>
                  {(r.domain || r.mode) && (
                    <p className="person-role__meta">
                      {r.domain && (
                        <span>
                          {domainName(r.domain)}
                          {unsure && <span title="domain uncertain"> ?</span>}
                        </span>
                      )}
                      {r.mode && <span>{modeName(r.mode)}</span>}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {view.schools.length > 0 && (
        <section className="person-section">
          <h2 className="sheet-label">education</h2>
          <ol className="person-schools">
            {view.schools.map((e) => {
              const detail = [[e.degree, e.fieldOfStudy].filter(Boolean).join(", "), formatRange(e.startDate, e.startPrecision, e.endDate, e.endPrecision)]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={e.id} className="person-school">
                  <p className="person-school__name">{e.school}</p>
                  {detail && <p className="person-school__detail">{detail}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {view.concepts.length > 0 && (
        <section className="person-section">
          <h2 className="sheet-label">concepts</h2>
          <ul className="person-concepts">
            {view.concepts.map((c) => (
              <li key={c.id}>
                <Link href={`/concept/${c.id}`}>{c.label}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.posts.length > 0 && (
        <section className="person-section">
          <h2 className="sheet-label">posts</h2>
          {/* Anchored so answers on the home surface can link to the post they drew on. */}
          <ol className="person-posts">
            {view.posts.map((post) => (
              <li key={post.id} id={`post-${post.id}`}>
                <p>{snippet(post.bodyText, 200) ?? "(no text)"}</p>
                <p className="person-post__date">{formatDay(post.capturedAt)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {missing && <p className="person-caveat">{missing}</p>}
    </div>
  );
}

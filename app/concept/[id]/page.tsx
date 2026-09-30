import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { loadConcept, loadConceptLabel } from "@/lib/views/concept";
import { formatDay, snippet } from "@/lib/views/format";

type Params = { params: Promise<{ id: string }> };

const validId = (id: string) => z.uuid().safeParse(id).success;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const label = validId(id) ? await loadConceptLabel(id) : null;
  return { title: label ?? "flaneur" };
}

export default async function ConceptPage({ params }: Params) {
  await requireSession();
  const { id } = await params;
  if (!validId(id)) notFound();
  const view = await loadConcept(id);
  if (!view) notFound();

  return (
    <main className="page archive">
      <article className="page__main stack-lg">
        <header>
          <h1 className="heading">{view.label}</h1>
          <p className="quiet small">
            {view.kind} · appears in {view.documentFrequency} {view.documentFrequency === 1 ? "artifact" : "artifacts"}
          </p>
        </header>

        {view.artifacts.length > 0 && (
          <ol className="timeline">
            {view.artifacts.map((a) => (
              <li key={a.id}>
                <p>
                  {a.personId ? <Link href={`/person/${a.personId}`}>{a.author}</Link> : a.author}
                  <span className="quiet small"> · {formatDay(a.capturedAt)}</span>
                </p>
                {snippet(a.bodyText, 100) && <p className="quiet">{snippet(a.bodyText, 100)}</p>}
              </li>
            ))}
          </ol>
        )}

        {view.neighbours.length > 0 && (
          <section>
            <h2 className="section-title">appears alongside</h2>
            <ol className="stack small">
              {view.neighbours.map((n) => (
                <li key={n.id}>
                  <Link href={`/concept/${n.id}`}>{n.label}</Link>
                  <span className="quiet"> {n.rawCount}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>
    </main>
  );
}

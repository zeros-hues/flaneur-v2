import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { loadConcept, loadConceptLabel } from "@/lib/views/concept";
import { formatDay, snippet } from "@/lib/views/format";
import "@/components/sheet/sheet.css";
import "@/components/sheet/concept.css";

type Params = { params: Promise<{ id: string }> };

const validId = (id: string) => z.uuid().safeParse(id).success;
// Hand-placed, not ruled: the margin is a loose column.
const INDENTS = [0, 14, 4, 22, 8];

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
    <main className="sheet">
      <article className="sheet__main">
        <header className="concept-head">
          <h1 className="concept-title">{view.label}</h1>
          <span className="concept-kind">{view.kind}</span>
        </header>

        {view.artifacts.length > 0 && (
          <ol className="concept-artifacts">
            {view.artifacts.map((a) => {
              const text = snippet(a.bodyText, 100);
              return (
                <li key={a.id} className="concept-artifact">
                  {a.personId ? (
                    <Link href={`/person/${a.personId}`} className="concept-artifact__author">
                      {a.author}
                    </Link>
                  ) : (
                    <span className="concept-artifact__author">{a.author}</span>
                  )}
                  <span className="concept-artifact__date">{formatDay(a.capturedAt)}</span>
                  {text && <span className="concept-artifact__snippet">{text}</span>}
                </li>
              );
            })}
          </ol>
        )}

        {view.neighbours.length > 0 && (
          <section className="concept-cooccur">
            <h2 className="concept-cooccur__label">often found with</h2>
            <ol>
              {view.neighbours.map((n) => (
                <li key={n.id}>
                  <Link href={`/concept/${n.id}`}>{n.label}</Link>
                  <span className="concept-cooccur__count">{n.rawCount}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="concept-appears">
          appears in {view.documentFrequency} {view.documentFrequency === 1 ? "artifact" : "artifacts"}
        </p>
      </article>

      {view.people.length > 0 && (
        <aside className="sheet__margin concept-margin" aria-label="People">
          <p className="sheet__margin-label">also in this neighbourhood</p>
          {view.people.map((p, i) => (
            <div key={p.id} className="sheet__margin-item" style={{ "--indent": `${INDENTS[i] ?? 0}px` } as CSSProperties}>
              <Link href={`/person/${p.id}`}>{p.name}</Link>
              {p.headline && <span>{p.headline}</span>}
            </div>
          ))}
        </aside>
      )}
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { z } from "zod";
import { InkLine } from "@/components/ink/InkLine";
import { Notes } from "@/components/person/Notes";
import { requireSession } from "@/lib/auth";
import { loadNearby, loadPerson, loadPersonName } from "@/lib/views/person";
import { Archive } from "./archive";
import "@/components/sheet/sheet.css";
import "@/components/person/person.css";

type Params = { params: Promise<{ id: string }> };

const validId = (id: string) => z.uuid().safeParse(id).success;
const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
// Hand-placed, not ruled: the margin is a loose column.
const INDENTS = [0, 14, 4, 22, 8];

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const name = validId(id) ? await loadPersonName(id) : null;
  return { title: name ?? "flaneur" };
}

async function Nearby({ id }: { id: string }) {
  const people = await loadNearby(id);
  if (!people.length) return null;
  return (
    <aside className="sheet__margin person-margin" aria-label="Nearby">
      <p className="sheet__margin-label">also in this neighbourhood</p>
      {people.map((p, i) => (
        <div key={p.id} className="sheet__margin-item" style={{ "--indent": `${INDENTS[i] ?? 0}px` } as CSSProperties}>
          <Link href={`/person/${p.id}`}>{p.name}</Link>
          <Link href={`/concept/${p.conceptId}`}>{p.conceptLabel}</Link>
        </div>
      ))}
    </aside>
  );
}

export default async function PersonPage({ params }: Params) {
  await requireSession();
  const { id } = await params;
  if (!validId(id)) notFound();
  const view = await loadPerson(id);
  if (!view) notFound();

  return (
    <main className="sheet">
      <article className="sheet__main">
        <header className="person-head">
          <h1 className="sheet-name">{view.name}</h1>
          {view.headline && <p className="sheet-sub">{view.headline}</p>}
        </header>

        {/* Reading register: the user's own notes, then the model's synthesis. */}
        <div className="person-reading">
          <Notes personId={view.id} initial={view.notes} />
          {view.synthesis && (
            <div className="person-synthesis" data-generated="true">
              {paragraphs(view.synthesis).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
          {/* The only place the profile is linked from. */}
          <p className="person-linkedin">
            <a href={view.profileUrl} target="_blank" rel="noopener noreferrer">
              view on LinkedIn ↗
            </a>
          </p>
        </div>

        <InkLine className="person-rule" weight="rule" seed={`rule:${view.id}`} delay={800} delayFromLoad duration={600} />

        <Archive view={view} />
      </article>

      <Suspense fallback={null}>
        <Nearby id={id} />
      </Suspense>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { loadNearby, loadPerson, loadPersonName } from "@/lib/views/person";
import { Archive } from "./archive";

type Params = { params: Promise<{ id: string }> };

const validId = (id: string) => z.uuid().safeParse(id).success;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const name = validId(id) ? await loadPersonName(id) : null;
  return { title: name ?? "flaneur" };
}

async function Nearby({ id }: { id: string }) {
  const people = await loadNearby(id);
  if (!people.length) return null;
  return (
    <section>
      <h2 className="label">also nearby</h2>
      <ul className="stack">
        {people.map((p) => (
          <li key={p.id}>
            <Link href={`/person/${p.id}`}>{p.name}</Link>
            {p.headline && <p className="quiet">{p.headline}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function PersonPage({ params }: Params) {
  await requireSession();
  const { id } = await params;
  if (!validId(id)) notFound();
  const view = await loadPerson(id);
  if (!view) notFound();

  return (
    <main className="page">
      <article className="page__main">
        <header className="archive">
          <h1 className="heading">{view.name}</h1>
          {view.headline && <p className="quiet">{view.headline}</p>}
        </header>

        {/* Reading register: the user's own notes, then the model's synthesis. */}
        <div className="stack-lg reading-block">
          {view.notes.map((n) => (
            <p key={n.id} className="reading reading--lead">
              {n.body}
            </p>
          ))}
          {view.synthesis && <p className="reading quiet">{view.synthesis}</p>}
        </div>

        <hr className="divider" />

        <Archive view={view} />
      </article>

      <aside className="page__margin archive">
        <Suspense fallback={null}>
          <Nearby id={id} />
        </Suspense>
      </aside>
    </main>
  );
}

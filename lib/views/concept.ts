// Server-side data for /concept/[id].
import { asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { artifact, concept, conceptEdge, conceptLink, organisation, person } from "@/db/schema";
import { db } from "@/lib/db";

export async function loadConcept(id: string) {
  const [c] = await db
    .select({ id: concept.id, label: concept.label, kind: concept.kind, documentFrequency: concept.documentFrequency })
    .from(concept)
    .where(eq(concept.id, id));
  if (!c) return null;

  const other = alias(concept, "other");
  const [artifacts, neighbours] = await Promise.all([
    db
      .select({
        id: artifact.id,
        personId: artifact.personId,
        author: sql<string | null>`coalesce(${person.name}, ${organisation.displayName})`,
        bodyText: artifact.bodyText,
        capturedAt: artifact.capturedAt,
      })
      .from(conceptLink)
      .innerJoin(artifact, eq(artifact.id, conceptLink.artifactId))
      .leftJoin(person, eq(person.id, artifact.personId))
      .leftJoin(organisation, eq(organisation.id, artifact.organisationId))
      .where(eq(conceptLink.conceptId, id))
      .orderBy(asc(artifact.capturedAt)),
    // Edges are stored once per pair (a < b); this concept can be on either side.
    db
      .select({ id: other.id, label: other.label, rawCount: conceptEdge.rawCount })
      .from(conceptEdge)
      .innerJoin(
        other,
        sql`${other.id} = case when ${conceptEdge.conceptAId} = ${id} then ${conceptEdge.conceptBId} else ${conceptEdge.conceptAId} end`,
      )
      .where(sql`(${or(eq(conceptEdge.conceptAId, id), eq(conceptEdge.conceptBId, id))}) and ${gt(conceptEdge.rawCount, 0)}`)
      .orderBy(desc(conceptEdge.rawCount), asc(other.label)),
  ]);

  // The people who wrote about it, most often first: the concept page's margin.
  const counts = new Map<string, number>();
  for (const a of artifacts) if (a.personId) counts.set(a.personId, (counts.get(a.personId) ?? 0) + 1);
  const topIds = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([pid]) => pid);
  const rows = topIds.length
    ? await db.select({ id: person.id, name: person.name, headline: person.headline }).from(person).where(inArray(person.id, topIds))
    : [];
  const people = topIds.flatMap((pid) => rows.filter((r) => r.id === pid));

  return { ...c, artifacts, neighbours, people };
}

export const loadConceptLabel = async (id: string) =>
  (await db.select({ label: concept.label }).from(concept).where(eq(concept.id, id)))[0]?.label ?? null;

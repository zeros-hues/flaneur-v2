// Server-side data for /concept/[id].
import { asc, desc, eq, gt, or, sql } from "drizzle-orm";
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

  return { ...c, artifacts, neighbours };
}

export const loadConceptLabel = async (id: string) =>
  (await db.select({ label: concept.label }).from(concept).where(eq(concept.id, id)))[0]?.label ?? null;

// Server-side data for /person/[id].
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { artifact, concept, conceptLink, education, note, organisation, person, role, sectionCoverage } from "@/db/schema";
import { db } from "@/lib/db";

export async function loadPerson(id: string) {
  const [p] = await db
    .select({ id: person.id, name: person.name, headline: person.headline, synthesis: person.synthesis, profileUrl: person.profileUrl })
    .from(person)
    .where(eq(person.id, id));
  if (!p) return null;

  const [notes, roles, schools, concepts, coverage, posts] = await Promise.all([
    db.select({ id: note.id, body: note.body }).from(note).where(eq(note.personId, id)).orderBy(desc(note.createdAt)),
    db
      .select({
        id: role.id,
        title: role.title,
        company: organisation.displayName,
        startDate: role.startDate,
        startPrecision: role.startPrecision,
        endDate: role.endDate,
        endPrecision: role.endPrecision,
        isCurrent: role.isCurrent,
        domain: role.domain,
        domainConfidence: role.domainConfidence,
        mode: role.mode,
      })
      .from(role)
      .leftJoin(organisation, eq(role.organisationId, organisation.id))
      .where(eq(role.personId, id))
      .orderBy(asc(role.sortIndex)),
    db
      .select({
        id: education.id,
        school: education.school,
        degree: education.degree,
        fieldOfStudy: education.fieldOfStudy,
        startDate: education.startDate,
        startPrecision: education.startPrecision,
        endDate: education.endDate,
        endPrecision: education.endPrecision,
      })
      .from(education)
      .where(eq(education.personId, id))
      .orderBy(asc(education.sortIndex)),
    db
      .selectDistinct({ id: concept.id, label: concept.label })
      .from(concept)
      .innerJoin(conceptLink, eq(conceptLink.conceptId, concept.id))
      .innerJoin(artifact, eq(artifact.id, conceptLink.artifactId))
      .where(eq(artifact.personId, id))
      .orderBy(asc(concept.label)),
    db
      .select({ section: sectionCoverage.section, isComplete: sectionCoverage.isComplete, knownTotal: sectionCoverage.knownTotal })
      .from(sectionCoverage)
      .where(and(eq(sectionCoverage.personId, id), inArray(sectionCoverage.section, ["experience", "education"]))),
    db
      .select({ id: artifact.id, bodyText: artifact.bodyText, capturedAt: artifact.capturedAt })
      .from(artifact)
      .where(and(eq(artifact.personId, id), eq(artifact.type, "post")))
      .orderBy(desc(artifact.capturedAt)),
  ]);

  return { ...p, notes, roles, schools, concepts, coverage, posts };
}

export type PersonView = NonNullable<Awaited<ReturnType<typeof loadPerson>>>;

export const loadPersonName = async (id: string) =>
  (await db.select({ name: person.name }).from(person).where(eq(person.id, id)))[0]?.name ?? null;

/**
 * Up to 5 other people whose posts share a concept with this person's, most shared first,
 * each with one concept they share (alphabetically first, so it is stable).
 */
export async function loadNearby(id: string) {
  const shared = db
    .select({ conceptId: conceptLink.conceptId })
    .from(conceptLink)
    .innerJoin(artifact, eq(artifact.id, conceptLink.artifactId))
    .where(eq(artifact.personId, id));

  return db
    .select({
      id: person.id,
      name: person.name,
      conceptId: sql<string>`(array_agg(${concept.id} order by ${concept.label}))[1]`,
      conceptLabel: sql<string>`(array_agg(${concept.label} order by ${concept.label}))[1]`,
    })
    .from(person)
    .innerJoin(artifact, eq(artifact.personId, person.id))
    .innerJoin(conceptLink, eq(conceptLink.artifactId, artifact.id))
    .innerJoin(concept, eq(concept.id, conceptLink.conceptId))
    .where(and(sql`${person.id} <> ${id}`, isNotNull(artifact.personId), inArray(conceptLink.conceptId, shared)))
    .groupBy(person.id, person.name)
    .orderBy(desc(sql`count(distinct ${conceptLink.conceptId})`), asc(person.name))
    .limit(5);
}

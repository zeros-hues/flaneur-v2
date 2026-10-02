// Everything in the notebook, as plain JSON. Embeddings and raw page snapshots are left out:
// they are derived, large, and rebuilt from what is here.
import { asc, eq } from "drizzle-orm";
import { artifact, concept, conceptLink, education, note, organisation, person, role } from "@/db/schema";
import { db } from "@/lib/db";

function groupBy<T>(rows: T[], key: (row: T) => string | null): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();
  for (const row of rows) {
    const k = key(row);
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return groups;
}

export async function exportEverything() {
  const [people, schools, roles, artifacts, notes, concepts, links] = await Promise.all([
    db
      .select({
        id: person.id,
        name: person.name,
        headline: person.headline,
        about: person.about,
        location: person.location,
        profile_url: person.profileUrl,
        synthesis: person.synthesis,
        first_captured_at: person.firstCapturedAt,
        last_profile_sync_at: person.lastProfileSyncAt,
      })
      .from(person)
      .orderBy(asc(person.name)),
    db
      .select({
        person_id: education.personId,
        school: education.school,
        degree: education.degree,
        field_of_study: education.fieldOfStudy,
        start_date: education.startDate,
        end_date: education.endDate,
      })
      .from(education)
      .orderBy(asc(education.sortIndex)),
    db
      .select({
        id: role.id,
        person_id: role.personId,
        title: role.title,
        organisation: organisation.displayName,
        description: role.description,
        start_date: role.startDate,
        start_precision: role.startPrecision,
        end_date: role.endDate,
        end_precision: role.endPrecision,
        is_current: role.isCurrent,
        is_primary: role.isPrimary,
        domain: role.domain,
        mode: role.mode,
      })
      .from(role)
      .leftJoin(organisation, eq(organisation.id, role.organisationId))
      .orderBy(asc(role.personId), asc(role.sortIndex)),
    db
      .select({
        id: artifact.id,
        type: artifact.type,
        person_id: artifact.personId,
        organisation: organisation.displayName,
        source_url: artifact.sourceUrl,
        urn: artifact.urn,
        post_type: artifact.postType,
        body_text: artifact.bodyText,
        hashtags: artifact.hashtags,
        status: artifact.status,
        captured_at: artifact.capturedAt,
      })
      .from(artifact)
      .leftJoin(organisation, eq(organisation.id, artifact.organisationId))
      .orderBy(asc(artifact.capturedAt)),
    db
      .select({ id: note.id, person_id: note.personId, artifact_id: note.artifactId, body: note.body, created_at: note.createdAt })
      .from(note)
      .orderBy(asc(note.createdAt)),
    db
      .select({ id: concept.id, label: concept.label, kind: concept.kind, first_seen_at: concept.firstSeenAt })
      .from(concept)
      .orderBy(asc(concept.label)),
    db.select({ concept_id: conceptLink.conceptId, artifact_id: conceptLink.artifactId, source: conceptLink.source }).from(conceptLink),
  ]);

  const educationOf = groupBy(schools, (s) => s.person_id);
  const linksOf = groupBy(links, (l) => l.concept_id);
  return {
    exported_at: new Date().toISOString(),
    people: people.map((p) => ({ ...p, education: (educationOf.get(p.id) ?? []).map(({ person_id: _, ...e }) => e) })),
    roles,
    artifacts,
    notes,
    concepts: concepts.map((c) => ({ ...c, artifacts: (linksOf.get(c.id) ?? []).map(({ artifact_id, source }) => ({ artifact_id, source })) })),
  };
}

export const exportFilename = () => `flaneur-${new Date().toISOString().slice(0, 10)}.json`;

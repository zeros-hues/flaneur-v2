import { and, eq } from "drizzle-orm";
import { education, sectionCoverage, skill } from "@/db/schema";
import { precisionRank } from "@/lib/parsers/dates";
import type { ParsedEducation, Section } from "@/lib/parsers/types";
import type { SnapshotRef, Tx } from "./merge";

type SectionName = (typeof sectionCoverage.$inferSelect)["section"];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const normalise = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Records how complete a section is. A partial capture that still found new entries means an
 * earlier "complete" capture is stale, so completeness is only carried over when nothing was added.
 */
export async function upsertCoverage(
  tx: Tx,
  personId: string,
  section: SectionName,
  parsed: { complete: boolean; knownTotal: number | null; shown: number; added: number },
  snap: SnapshotRef,
): Promise<string> {
  const [previous] = await tx
    .select()
    .from(sectionCoverage)
    .where(and(eq(sectionCoverage.personId, personId), eq(sectionCoverage.section, section)));
  const isComplete = parsed.complete || (previous?.isComplete === true && parsed.added === 0);
  const knownTotal = parsed.knownTotal ?? previous?.knownTotal ?? null;
  const values = { isComplete, knownTotal, lastCapturedAt: snap.capturedAt };
  await tx
    .insert(sectionCoverage)
    .values({ personId, section, ...values })
    .onConflictDoUpdate({ target: [sectionCoverage.personId, sectionCoverage.section], set: values });

  if (isComplete) return `${section} now complete${knownTotal !== null ? ` (${knownTotal})` : ""}`;
  return `${section} partial (${parsed.shown} shown${knownTotal ? ` of ${knownTotal}` : ""}; open "Show all" to capture the rest)`;
}

export async function mergeEducation(tx: Tx, personId: string, section: Section<ParsedEducation>, snap: SnapshotRef) {
  const existing = await tx.select().from(education).where(eq(education.personId, personId));
  const identity = (slug: string | null, school: string, degree: string | null) =>
    `${slug ?? `name:${normalise(school)}`}|${normalise(degree)}`;
  const matched = new Set<string>();
  let added = 0;

  for (const [sortIndex, parsed] of section.items.entries()) {
    const key = identity(parsed.schoolSlug, parsed.school, parsed.degree);
    const old = existing.find((e) => !matched.has(e.id) && identity(e.schoolSlug, e.school, e.degree) === key);
    if (!old) {
      added++;
      await tx.insert(education).values({
        personId,
        school: parsed.school,
        schoolSlug: parsed.schoolSlug,
        degree: parsed.degree,
        fieldOfStudy: parsed.fieldOfStudy,
        startDate: parsed.start.value,
        startPrecision: parsed.start.precision,
        endDate: parsed.end.value,
        endPrecision: parsed.end.precision,
        sortIndex,
      });
      continue;
    }
    matched.add(old.id);
    const patch: Partial<typeof education.$inferInsert> = { sortIndex };
    if (parsed.fieldOfStudy && !old.fieldOfStudy) patch.fieldOfStudy = parsed.fieldOfStudy;
    if (precisionRank(parsed.start.precision) > precisionRank(old.startPrecision)) {
      Object.assign(patch, { startDate: parsed.start.value, startPrecision: parsed.start.precision });
    }
    if (precisionRank(parsed.end.precision) > precisionRank(old.endPrecision)) {
      Object.assign(patch, { endDate: parsed.end.value, endPrecision: parsed.end.precision });
    }
    await tx.update(education).set(patch).where(eq(education.id, old.id));
  }

  const changes = added ? [`added ${added} education ${added === 1 ? "entry" : "entries"}`] : [];
  changes.push(await upsertCoverage(tx, personId, "education", { ...section, shown: section.items.length, added }, snap));
  return changes;
}

export async function mergeSkills(tx: Tx, personId: string, section: Section<string>, snap: SnapshotRef) {
  const inserted = section.items.length
    ? await tx
        .insert(skill)
        .values(section.items.map((name) => ({ personId, name })))
        .onConflictDoNothing()
        .returning({ id: skill.id })
    : [];
  const changes = inserted.length ? [`added ${plural(inserted.length, "skill")}`] : [];
  changes.push(
    await upsertCoverage(tx, personId, "skills", { ...section, shown: section.items.length, added: inserted.length }, snap),
  );
  return changes;
}

import { desc, eq } from "drizzle-orm";
import { headlineHistory, organisation, person, role } from "@/db/schema";
import type { Db } from "@/lib/db";
import { precisionRank } from "@/lib/parsers/dates";
import type { ParsedDate, ParsedProfile, ParsedRole, Section } from "@/lib/parsers/types";
import { mergeEducation, mergeSkills, upsertCoverage } from "./merge-details";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface SnapshotRef {
  id: string;
  capturedAt: Date;
}

export interface MergeDiff {
  personId: string | null;
  artifactId: string | null;
  changes: string[];
  summary: string;
}

export const summarise = (changes: string[]) => (changes.length ? changes.join("; ") : "no changes");

const normaliseTitle = (t: string) => t.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ").trim();
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Organisations are keyed on slug. Companies without a link get a stable name-derived key. */
export function organisationKey(slug: string | null, name: string | null): string | null {
  if (slug) return slug;
  return name ? `name:${normaliseTitle(name)}` : null;
}

export async function upsertOrganisation(tx: Tx, slug: string, name: string | null): Promise<string> {
  const [existing] = await tx.select().from(organisation).where(eq(organisation.slug, slug));
  if (existing) {
    if (name && name !== existing.displayName) {
      await tx.update(organisation).set({ displayName: name }).where(eq(organisation.id, existing.id));
    }
    return existing.id;
  }
  const [row] = await tx
    .insert(organisation)
    .values({ slug, displayName: name ?? slug })
    .returning({ id: organisation.id });
  if (!row) throw new Error("organisation insert returned no row");
  return row.id;
}

async function recordHeadline(tx: Tx, personId: string, headline: string, at: Date): Promise<string | null> {
  const [latest] = await tx
    .select()
    .from(headlineHistory)
    .where(eq(headlineHistory.personId, personId))
    .orderBy(desc(headlineHistory.observedAt))
    .limit(1);
  if (latest?.headline === headline) return null;
  await tx.insert(headlineHistory).values({ personId, headline, observedAt: at });
  return latest ? `headline changed: "${latest.headline}" → "${headline}"` : null;
}

type RoleRow = typeof role.$inferSelect & { orgSlug: string | null };

const richerDate = (oldPrecision: ParsedDate["precision"], next: ParsedDate) =>
  precisionRank(next.precision) > precisionRank(oldPrecision) ? next : null;

/** Field-by-field: keep what the old row has unless the new parse is strictly richer. */
function rolePatch(old: RoleRow, next: ParsedRole, organisationId: string | null) {
  const patch: Partial<typeof role.$inferInsert> = {};
  if (next.description && next.description.length > (old.description?.length ?? 0)) {
    patch.description = next.description;
  }
  const start = richerDate(old.startPrecision, next.start);
  if (start) Object.assign(patch, { startDate: start.value, startPrecision: start.precision });
  const end = richerDate(old.endPrecision, next.end);
  if (end) Object.assign(patch, { endDate: end.value, endPrecision: end.precision, isCurrent: false });
  else if (old.endPrecision === "absent" && next.isCurrent !== old.isCurrent) patch.isCurrent = next.isCurrent;
  if (!old.organisationId && organisationId) patch.organisationId = organisationId;
  return patch;
}

async function mergeExperience(tx: Tx, personId: string, section: Section<ParsedRole>, snap: SnapshotRef) {
  const existing: RoleRow[] = (
    await tx
      .select({ r: role, orgSlug: organisation.slug })
      .from(role)
      .leftJoin(organisation, eq(role.organisationId, organisation.id))
      .where(eq(role.personId, personId))
  ).map(({ r, orgSlug }) => ({ ...r, orgSlug }));

  const identity = (slug: string | null, title: string, start: string | null) =>
    `${slug ?? ""}|${normaliseTitle(title)}|${start ?? ""}`;
  const matched = new Set<string>();
  let added = 0;
  let enriched = 0;

  for (const [sortIndex, parsed] of section.items.entries()) {
    const slug = organisationKey(parsed.companySlug, parsed.companyName);
    const organisationId = slug ? await upsertOrganisation(tx, slug, parsed.companyName) : null;
    const key = identity(slug, parsed.title, parsed.start.value);
    const old = existing.find((r) => !matched.has(r.id) && identity(r.orgSlug, r.title, r.startDate) === key);

    if (old) {
      matched.add(old.id);
      const patch = rolePatch(old, parsed, organisationId);
      if (Object.keys(patch).length > 0) enriched++;
      await tx.update(role).set({ ...patch, sortIndex }).where(eq(role.id, old.id));
      continue;
    }
    added++;
    await tx.insert(role).values({
      personId,
      organisationId,
      title: parsed.title,
      description: parsed.description,
      startDate: parsed.start.value,
      startPrecision: parsed.start.precision,
      endDate: parsed.end.value,
      endPrecision: parsed.end.precision,
      isCurrent: parsed.isCurrent,
      sortIndex,
    });
  }

  const changes: string[] = [];
  if (added) changes.push(`added ${plural(added, "role")}`);
  if (enriched) changes.push(`enriched ${plural(enriched, "role")}`);
  changes.push(await upsertCoverage(tx, personId, "experience", { ...section, shown: section.items.length, added }, snap));
  return changes;
}

/** Merges only the sections present in this snapshot. Never touches notes. */
export async function mergeProfile(tx: Tx, parsed: ParsedProfile, snap: SnapshotRef): Promise<MergeDiff> {
  const changes: string[] = [];
  const top = parsed.topcard;
  let [current] = await tx.select().from(person).where(eq(person.profileUrl, parsed.profileUrl));

  if (!current) {
    if (!top) throw new Error("cannot create a person without a top card (validation should have caught this)");
    [current] = await tx
      .insert(person)
      .values({
        profileUrl: parsed.profileUrl,
        name: top.name,
        headline: top.headline,
        about: parsed.about ?? null,
        location: top.location,
        photoUrl: top.photoUrl,
        firstCapturedAt: snap.capturedAt,
        lastProfileSyncAt: snap.capturedAt,
      })
      .returning();
    if (!current) throw new Error("person insert returned no row");
    changes.push(`new person ${top.name}`);
  } else if (!current.lastProfileSyncAt || current.lastProfileSyncAt <= snap.capturedAt) {
    // Scalar fields: the newest snapshot wins, but an absent value never blanks a present one.
    const patch: Partial<typeof person.$inferInsert> = { lastProfileSyncAt: snap.capturedAt };
    const fields = {
      name: top?.name,
      headline: top?.headline,
      location: top?.location,
      photoUrl: top?.photoUrl,
      about: parsed.about,
    } as const;
    const updated: string[] = [];
    for (const [field, value] of Object.entries(fields) as [keyof typeof fields, string | null | undefined][]) {
      if (value && value !== current[field]) {
        patch[field] = value;
        if (field !== "photoUrl") updated.push(field); // photo URLs are signed and rotate every capture
      }
    }
    await tx.update(person).set(patch).where(eq(person.id, current.id));
    if (updated.length) changes.push(`updated ${updated.join(", ")}`);
  }

  if (top?.headline) {
    const change = await recordHeadline(tx, current.id, top.headline, snap.capturedAt);
    if (change) changes.push(change);
  }

  if (parsed.about !== undefined) {
    await upsertCoverage(tx, current.id, "about", { complete: true, knownTotal: null, shown: 1, added: 0 }, snap);
  }
  if (parsed.experience) changes.push(...(await mergeExperience(tx, current.id, parsed.experience, snap)));
  if (parsed.education) changes.push(...(await mergeEducation(tx, current.id, parsed.education, snap)));
  if (parsed.skills) changes.push(...(await mergeSkills(tx, current.id, parsed.skills, snap)));

  return { personId: current.id, artifactId: null, changes, summary: `${current.name}: ${summarise(changes)}` };
}

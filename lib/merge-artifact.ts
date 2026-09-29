import { eq } from "drizzle-orm";
import { artifact, person } from "@/db/schema";
import type { ParsedArtifact, ParsedAuthor } from "@/lib/parsers/types";
import { summarise, upsertOrganisation, type MergeDiff, type SnapshotRef, type Tx } from "./merge";

/** Post authors are created if unknown but never updated here: a post carries no profile sections. */
async function resolveAuthor(tx: Tx, author: ParsedAuthor, snap: SnapshotRef, changes: string[]) {
  if (author.kind === "organisation") {
    return { personId: null, organisationId: await upsertOrganisation(tx, author.slug, author.name) };
  }
  const [known] = await tx.select({ id: person.id }).from(person).where(eq(person.profileUrl, author.url));
  if (known) return { personId: known.id, organisationId: null };

  const [created] = await tx
    .insert(person)
    .values({ profileUrl: author.url, name: author.name, firstCapturedAt: snap.capturedAt })
    .returning({ id: person.id });
  if (!created) throw new Error("person insert returned no row");
  changes.push(`new person ${author.name} (from post)`);
  return { personId: created.id, organisationId: null };
}

export async function mergeArtifact(tx: Tx, parsed: ParsedArtifact, snap: SnapshotRef): Promise<MergeDiff> {
  const changes: string[] = [];
  const author = await resolveAuthor(tx, parsed.author, snap, changes);

  const [existing] = parsed.urn
    ? await tx.select().from(artifact).where(eq(artifact.urn, parsed.urn))
    : [];

  if (existing) {
    // Richer text wins; engagement counts are point-in-time, so the latest capture wins.
    const patch: Partial<typeof artifact.$inferInsert> = {
      hashtags: [...new Set([...existing.hashtags, ...parsed.hashtags])],
      postType: parsed.postType,
    };
    if (parsed.bodyText && parsed.bodyText.length > (existing.bodyText?.length ?? 0)) patch.bodyText = parsed.bodyText;
    if (parsed.author.headline) patch.authorHeadlineSnapshot = parsed.author.headline;
    if (parsed.reactionCount !== null) patch.reactionCount = parsed.reactionCount;
    if (parsed.commentCount !== null) patch.commentCount = parsed.commentCount;
    await tx.update(artifact).set(patch).where(eq(artifact.id, existing.id));
    changes.push("post already captured; refreshed");
    return { personId: author.personId, artifactId: existing.id, changes, summary: `${parsed.author.name}: ${summarise(changes)}` };
  }

  const [created] = await tx
    .insert(artifact)
    .values({
      ...author,
      type: "post",
      sourceUrl: parsed.urn ? `https://www.linkedin.com/feed/update/${parsed.urn}/` : parsed.sourceUrl,
      urn: parsed.urn,
      postType: parsed.postType,
      bodyText: parsed.bodyText,
      hashtags: parsed.hashtags,
      authorHeadlineSnapshot: parsed.author.headline,
      reactionCount: parsed.reactionCount,
      commentCount: parsed.commentCount,
      capturedAt: snap.capturedAt,
    })
    .returning({ id: artifact.id });
  if (!created) throw new Error("artifact insert returned no row");
  changes.push(`saved ${parsed.postType} post${parsed.hashtags.length ? ` (#${parsed.hashtags.join(" #")})` : ""}`);

  return { personId: author.personId, artifactId: created.id, changes, summary: `${parsed.author.name}: ${summarise(changes)}` };
}

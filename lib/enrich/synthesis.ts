import { asc, desc, eq, isNotNull, and } from "drizzle-orm";
import { artifact, organisation, person, role } from "@/db/schema";
import { db } from "@/lib/db";
import { EMBEDDING_MODEL, PROMPT_VERSIONS } from "./config";
import { embed } from "./gemini";
import { generateJson } from "./groq";
import { synthesisPrompt, synthesisResult, synthesisSchema } from "./prompts";

const MAX_POSTS = 10;
const MAX_POST_CHARS = 1500;
const MAX_EMBED_CHARS = 8000;

const period = (start: string | null, end: string | null, current: boolean) => {
  const year = (d: string | null) => d?.slice(0, 4);
  const from = year(start);
  const to = current ? "present" : year(end);
  return from || to ? ` (${from ?? "?"}–${to ?? "?"})` : "";
};

/**
 * Writes the person's 2–3 sentence synthesis from about, roles and posts, then embeds the
 * synthesis (profile_embedding) and the about text (about_embedding) in one batched call.
 * Returns false when there is nothing to synthesise from.
 */
export async function synthesisePerson(personId: string): Promise<boolean> {
  const [p] = await db
    .select({ name: person.name, headline: person.headline, about: person.about })
    .from(person)
    .where(eq(person.id, personId));
  if (!p) return false;

  const roles = await db
    .select({
      title: role.title,
      company: organisation.displayName,
      startDate: role.startDate,
      endDate: role.endDate,
      isCurrent: role.isCurrent,
    })
    .from(role)
    .leftJoin(organisation, eq(role.organisationId, organisation.id))
    .where(eq(role.personId, personId))
    .orderBy(asc(role.sortIndex));

  const posts = await db
    .select({ bodyText: artifact.bodyText })
    .from(artifact)
    .where(and(eq(artifact.personId, personId), isNotNull(artifact.bodyText)))
    .orderBy(desc(artifact.capturedAt))
    .limit(MAX_POSTS);

  const about = p.about?.trim() || null;
  const roleLines = roles.map(
    (r) => `${r.title}${r.company ? ` at ${r.company}` : ""}${period(r.startDate, r.endDate, r.isCurrent)}`,
  );
  const postBodies = posts.map((a) => (a.bodyText ?? "").trim().slice(0, MAX_POST_CHARS)).filter(Boolean);
  if (!about && !roleLines.length && !postBodies.length) return false;

  const { synthesis } = await generateJson(
    synthesisPrompt({ name: p.name, headline: p.headline, about, roles: roleLines, posts: postBodies }),
    synthesisSchema,
    synthesisResult,
  );

  const texts = about ? [synthesis, about.slice(0, MAX_EMBED_CHARS)] : [synthesis];
  const [profileEmbedding, aboutEmbedding] = await embed(texts, "RETRIEVAL_DOCUMENT");

  await db
    .update(person)
    .set({
      synthesis,
      profileEmbedding: profileEmbedding ?? null,
      aboutEmbedding: aboutEmbedding ?? null,
      embeddingModel: EMBEDDING_MODEL,
      enrichmentPromptVersion: PROMPT_VERSIONS.synthesis,
    })
    .where(eq(person.id, personId));
  return true;
}

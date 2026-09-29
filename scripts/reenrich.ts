// Re-runs enrichment regardless of stored prompt versions.
//   npm run reenrich                 every person, then every organisation-authored post
//   npm run reenrich -- --person <id> one person (roles, their posts, synthesis)
import { asc, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { artifact, person } from "@/db/schema";
import { db } from "@/lib/db";
import { enrichArtifact, enrichPerson, type EnrichSummary } from "@/lib/enrich";

function personArg(): string | null | Error {
  const i = process.argv.indexOf("--person");
  if (i === -1) return null;
  const id = z.uuid().safeParse(process.argv[i + 1]);
  return id.success ? id.data : new Error("--person needs a person id (uuid)");
}

const describe = (s: EnrichSummary) =>
  `${s.roles} role(s), ${s.artifacts} post(s), synthesis ${s.synthesis ? "written" : "skipped"}` +
  (s.promoted.length ? `, promoted to topic: ${s.promoted.join(", ")}` : "");

async function main(): Promise<void> {
  const target = personArg();
  if (target instanceof Error) {
    console.error(target.message);
    process.exitCode = 1;
    return;
  }

  const people = target
    ? [{ id: target, name: "" }]
    : await db.select({ id: person.id, name: person.name }).from(person).orderBy(asc(person.firstCapturedAt));
  for (const p of people) {
    console.log(`person ${p.name || p.id}: ${describe(await enrichPerson(p.id, { force: true }))}`);
  }
  if (target) return;

  const orgPosts = await db
    .select({ id: artifact.id })
    .from(artifact)
    .where(isNotNull(artifact.organisationId))
    .orderBy(asc(artifact.capturedAt));
  for (const a of orgPosts) {
    console.log(`organisation post ${a.id}: ${describe(await enrichArtifact(a.id, { force: true }))}`);
  }
}

try {
  await main();
} finally {
  await db.$client.end();
}

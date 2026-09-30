import { and, eq, isNull, ne, or } from "drizzle-orm";
import { organisation, role } from "@/db/schema";
import { db } from "@/lib/db";
import { PROMPT_VERSIONS } from "./config";
import { generateJson } from "./groq";
import { roleResult, rolePrompt, roleSchema, type RoleResult } from "./prompts";

/**
 * Classifies the person's roles that were never classified, or were classified by an older
 * prompt, in a single LLM call. Roles missing from the reply stay unclassified and are
 * picked up on the next run.
 */
export async function classifyRoles(personId: string, force: boolean): Promise<number> {
  const version = PROMPT_VERSIONS.role;
  const stale = or(isNull(role.enrichmentPromptVersion), ne(role.enrichmentPromptVersion, version));
  const rows = await db
    .select({
      id: role.id,
      title: role.title,
      description: role.description,
      company: organisation.displayName,
      startDate: role.startDate,
      endDate: role.endDate,
      isCurrent: role.isCurrent,
    })
    .from(role)
    .leftJoin(organisation, eq(role.organisationId, organisation.id))
    .where(force ? eq(role.personId, personId) : and(eq(role.personId, personId), stale));
  if (!rows.length) return 0;

  const ids = rows.map((r) => r.id);
  const { roles } = await generateJson(rolePrompt(rows), roleSchema(ids), roleResult);

  // First answer per role wins; ids not in this batch are ignored.
  const byId = new Map<string, RoleResult>();
  for (const r of roles) if (ids.includes(r.roleId) && !byId.has(r.roleId)) byId.set(r.roleId, r);
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) console.error(`[enrich] no classification returned for role(s) ${missing.join(", ")}`);

  // Low-confidence classifications are stored as-is; readers decide what to trust.
  await db.transaction(async (tx) => {
    for (const r of byId.values()) {
      await tx
        .update(role)
        .set({
          domain: r.domain,
          domainConfidence: r.domain_confidence,
          mode: r.mode,
          isPrimary: r.is_primary,
          enrichmentPromptVersion: version,
        })
        .where(eq(role.id, r.roleId));
    }
  });
  return byId.size;
}

import { createHash } from "node:crypto";
import { build } from "esbuild";
import postgres from "postgres";
import { databaseUrl, safeFailure } from "../phase0/environment.mjs";

async function load(entry) {
  const bundled = await build({ entryPoints: [entry], bundle: true, write: false,
    platform: "node", format: "esm", logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);
}

// No apply mode. Outputs aggregate counts/fingerprint only, never user/source text or IDs.
let client;
try {
  const { planPhase1 } = await load("lib/migration/phase1-plan.ts");
  const { phase1Batches } = await load("lib/migration/phase1-batches.ts");
  const { sourceCandidates } = await load("lib/migration/source-candidates.ts");
  client = postgres(databaseUrl(), { max: 1, connect_timeout: 10, onnotice: () => {} });
  const summary = await client.begin("isolation level repeatable read read only", async (tx) => {
    await tx`set local statement_timeout = '15s'`;
    const [guard] = await tx`select current_setting('transaction_read_only') as read_only`;
    if (guard.read_only !== "on") throw Object.assign(new Error("Read-only guard failed"), { code: "READ_ONLY_GUARD" });
    const objects = await tx`select id, 'person' as kind from person union all
      select id, 'artifact' from artifact union all select id, 'concept' from concept union all
      select id, 'organisation' from organisation`;
    const snapshots = await tx`select id, person_id as "personId", artifact_id as "artifactId",
      captured_at as "capturedAt", capture_type as "captureType", source_url as "sourceUrl" from snapshot`;
    const notes = await tx`select id, person_id as "personId", artifact_id as "artifactId",
      snapshot_id as "snapshotId", body, created_at as "createdAt" from note`;
    const people = await tx`select id, profile_url, synthesis, enrichment_prompt_version, embedding_model from person`;
    const roles = await tx`select id, person_id, domain, domain_confidence, mode, is_primary,
      enrichment_prompt_version from role where enrichment_prompt_version is not null`;
    const artifacts = await tx`select id, person_id as "personId", source_url as "sourceUrl", type,
      organisation_id as "organisationId", urn from artifact`;
    const factRoles = await tx`select id, person_id, organisation_id, title, description, start_date,
      start_precision, end_date, end_precision, is_current from role`;
    const educations = await tx`select id, person_id, school, school_slug, degree, field_of_study,
      start_date, start_precision, end_date, end_precision from education`;
    const skills = await tx`select id, person_id, name from skill`;
    const conceptLinks = await tx`select artifact_id, concept_id, source from concept_link`;
    const schedules = await tx`select artifact_id as "artifactId", last_surfaced_at as "lastSurfacedAt",
      last_action as "lastAction", ease, interval_days from schedule`;
    const inferences = people.filter((p) => p.synthesis !== null).map((p) => ({ key: `person:${p.id}:synthesis:legacy`, subjectId: p.id,
      body: p.synthesis, role: "summary", metadata: { prompt_version: p.enrichment_prompt_version,
        embedding_model: p.embedding_model } }));
    for (const r of roles) {
      for (const field of ["domain", "mode", "is_primary"]) {
        if (r[field] === null) continue;
        inferences.push({ key: `role:${r.id}:${field}:legacy`, subjectId: r.person_id,
          body: String(r[field]), role: "classification", metadata: { legacy_role_id: r.id,
            field, prompt_version: r.enrichment_prompt_version, confidence: r.domain_confidence } });
      }
    }
    const structuredRows = [["role", factRoles], ["education", educations], ["skill", skills]].flatMap(([kind, rows]) =>
      rows.map(({ id, person_id: personId, organisation_id, ...fields }) => ({ kind, id, personId,
        fields: JSON.parse(JSON.stringify(fields)) })));
    const associations = artifacts.flatMap((a) => {
      const author = a.personId ?? a.organisationId;
      // Connection requests are not authored work.
      return author && a.type === "post" ? [{ key: `artifact:${a.id}:legacy:author`, fromId: a.id,
        toId: author, predicate: "authored_by", layer: "extracted", metadata: { legacy_authorship_projection: true } }] : [];
    });
    associations.push(...factRoles.filter((r) => r.organisation_id).map((r) => ({
      key: `role:${r.id}:legacy:employer`, fromId: r.person_id, toId: r.organisation_id,
      predicate: "employed_by", layer: "extracted", metadata: { legacy_role_id: r.id } })),
    ...conceptLinks.map((l) => ({ key: `concept_link:${l.artifact_id}:${l.concept_id}:legacy`,
      fromId: l.artifact_id, toId: l.concept_id,
      predicate: l.source === "hashtag" ? "mentions_concept" : "associated_with_concept",
      layer: l.source === "hashtag" ? "source" : "inferred", metadata: { legacy_link_source: l.source,
        exact_original_term_unknown: true } })));
    const input = { objects, snapshots: snapshots.map((s) => ({ ...s, capturedAt: s.capturedAt.toISOString() })),
      notes: notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })), inferences, structuredRows,
      associations, artifacts: artifacts.map((a) => ({ ...a, migrationKey: null })),
      schedules: schedules.map((s) => ({ ...s, lastSurfacedAt: s.lastSurfacedAt?.toISOString() ?? null,
        metadata: { ease: s.ease, interval_days: s.interval_days } })) };
    const plan = planPhase1(input);
    const repeat = planPhase1(input);
    if (JSON.stringify(plan) !== JSON.stringify(repeat)) throw new Error("PHASE1_NONDETERMINISTIC_PLAN");
    const batches = phase1Batches(plan);
    const identities = sourceCandidates([...people.map((p) => ({ objectId: p.id, kind: "person", url: p.profile_url })),
      ...artifacts.map((a) => ({ objectId: a.id, kind: "artifact", url: a.sourceUrl, urn: a.urn }))]);
    return { mode: "read-only", version: plan.version, object_refs: plan.objectRefs.length,
      encounters: plan.encounters.length, encounter_links: plan.links.length,
      user_observations: plan.observations.filter((o) => o.truthLayer === "user").length,
      legacy_inferences: plan.observations.filter((o) => o.truthLayer === "inferred").length,
      unverified_structured_facts: plan.observations.filter((o) => o.semanticRole === "fact").length,
      candidate_relationships: plan.relationships.length, structured_support_links: plan.structuredLinks.length,
      profile_artifacts: plan.profileArtifacts.length, profile_snapshot_mappings: plan.snapshotArtifactMappings.length,
      prepared_batches: batches.length, prepared_target_rows: batches.reduce((n, b) => n + b.rows.length, 0),
      source_identity_candidates: identities.candidates.length, conflicting_source_identity_keys: identities.conflictingKeys,
      unresolved_notes: plan.unresolvedNoteIds.length,
      pending_profile_artifact_mappings: plan.profileArtifactSnapshotIds.length,
      repeat_plan_identical: true,
      plan_sha256: createHash("sha256").update(JSON.stringify(plan)).digest("hex") };
  });
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  safeFailure(error); process.exitCode = 1;
} finally {
  await client?.end({ timeout: 2 });
}

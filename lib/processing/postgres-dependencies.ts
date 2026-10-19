import type postgres from "postgres";
import { dependentObservationIds, type ObservationDependency } from "./dependencies";
import { inputFingerprint } from "./fingerprint";

interface Node { id: string; subjectId: string; layer: string; bodyText: string; inactive: boolean; identityProof: boolean; relationshipReview:boolean }
export async function readReviewGraph(sql: postgres.TransactionSql) {
  const nodes = await sql<Node[]>`select o.id, o.subject_id as "subjectId", o.truth_layer as layer, o.body_text as "bodyText",
    (o.field_key = 'identity_for_snapshot' or o.structured_value ? 'identity_for_snapshot'
      or (o.field_key='reviewed_profile' and o.origin_key like 'reviewed-profile-assertion-v1:%')
      or (o.field_key='reviewed_authorship' and o.origin_key like 'reviewed-authorship-decision-v1:%')) is true as "identityProof",
    ((o.field_key='reviewed_concept' and o.origin_key like 'reviewed-concept-decision-v1:%') or (o.field_key='reviewed_career' and o.origin_key like 'reviewed-career-decision-v1:%') or (o.field_key='reviewed_trajectory' and o.origin_key like 'explicit-trajectory-v1:%')) is true as "relationshipReview",
    (r.archived_at is not null or s.archived_at is not null
      or exists (select 1 from public.object_alias a where a.former_object_id in (o.id,o.subject_id))
      or exists (select 1 from public.observation_review v where v.observation_id = o.id)
      or exists (select 1 from public.observation n where n.supersedes_id = o.id)
      or (o.field_key='reviewed_trajectory' and o.origin_key like 'explicit-trajectory-v1:%' and exists(
       select 1 from jsonb_array_elements(jsonb_build_array(o.structured_value#>'{request,from}',o.structured_value#>'{request,to}')) endpoint
       where not exists(select 1 from public.concept c join public.object_ref cr on cr.id=c.id and cr.archived_at is null
        where c.id::text=endpoint->>'id' and c.label=endpoint->>'label' and c.kind::text=endpoint->>'kind'
         and not exists(select 1 from public.object_alias a where a.former_object_id=c.id))))
      or (o.field_key='reviewed_career' and o.origin_key like 'reviewed-career-decision-v1:%' and not exists(
        select 1 from public.organisation org join public.object_ref cr on cr.id=org.id and cr.kind='organisation' and cr.archived_at is null
        where org.id::text=o.structured_value->>'to_object_id' and org.display_name=o.structured_value#>>'{request,expectedOrganisation}'
         and not exists(select 1 from public.object_alias a where a.former_object_id=org.id)))
      or (o.field_key='reviewed_concept' and o.origin_key like 'reviewed-concept-decision-v1:%' and not exists(
        select 1 from public.concept c join public.object_ref cr on cr.id=c.id and cr.archived_at is null
        where c.id::text=o.structured_value->>'to_object_id' and c.label=o.structured_value#>>'{request,expectedConcept,label}'
          and c.kind::text=o.structured_value#>>'{request,expectedConcept,kind}'
          and not exists(select 1 from public.object_alias alias where alias.former_object_id=c.id)))
      or coalesce(o.field_key like 'capture_field:%' and not exists (
        select 1 from public.observation_derivation d join public.processing_head h
          on h.scope_key = 'parse:snapshot:' || d.snapshot_id::text and h.input_fingerprint = d.input_fingerprint
        where d.observation_id = o.id), false)) as inactive
    from public.observation o join public.object_ref r on r.id = o.id join public.object_ref s on s.id = o.subject_id`;
  const edges = await sql<ObservationDependency[]>`select observation_id as "observationId",
    supporting_observation_id as "supportingObservationId", support_role as role from public.observation_evidence
    where supporting_observation_id is not null
    union all select observation_id, identity_observation_id, 'supports' from public.observation_derivation`;
  if (nodes.length > 50000 || edges.length > 50000) throw new Error("REVIEW_DEPENDENCY_LIMIT");
  return { nodes, edges };
}
function affected(data: Awaited<ReturnType<typeof readReviewGraph>>, roots: string[], extraScopes: string[]) {
  const ids = dependentObservationIds(data.nodes, data.edges, roots);
  const subjects = [...new Set(data.nodes.filter((node) => ids.has(node.id)).map((node) => node.subjectId))].sort();
  if (subjects.length > 1000) throw new Error("REVIEW_SCOPE_LIMIT");
  const scopes = [...new Set([...extraScopes,
    ...subjects.flatMap((subject) => [`enrich:object:${subject}`, `index:object:${subject}`])])].sort();
  return { ids: [...ids], scopes };
}
export interface DependencyContext {
  nodes: Node[]; inactive: Set<string>; ids: string[]; scopes: string[];
}

/** Every affected processing scope precedes the graph lock, including identity's parse scope. */
export async function withDependencyTransaction<T>(connection: ReturnType<typeof postgres>,
  roots: (sql: postgres.TransactionSql) => Promise<string[]>,
  extraScopes: string[] | ((sql: postgres.TransactionSql) => Promise<string[]>),
  work: (sql: postgres.TransactionSql, context: DependencyContext) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const output = await connection.begin("isolation level read committed", async (sql) => {
        await sql`set local statement_timeout = '20s'`;
        // Honor a caller's tighter timeout (including rollback-only contention validation).
        await sql`select set_config('lock_timeout', case
          when current_setting('lock_timeout')::interval > interval '0 seconds'
            and current_setting('lock_timeout')::interval < interval '5 seconds'
          then current_setting('lock_timeout') else '5s' end, true)`;
        const scopes = () => typeof extraScopes === "function" ? extraScopes(sql) : Promise.resolve(extraScopes);
        const planned = affected(await readReviewGraph(sql), await roots(sql), await scopes());
        for (const scope of planned.scopes) await sql`select pg_advisory_xact_lock(hashtextextended(${`processing:${scope}`}, 0))`;
        await sql`select pg_advisory_xact_lock(1790703955, 1)`;
        const data = await readReviewGraph(sql), current = affected(data, await roots(sql), await scopes());
        if (current.scopes.some((scope) => !planned.scopes.includes(scope))) throw new Error("REVIEW_DEPENDENCY_CHANGED");
        const inactive = dependentObservationIds(data.nodes, data.edges, data.nodes.filter((node) => node.inactive).map((node) => node.id));
        return { result: await work(sql, { ...current, nodes: data.nodes, inactive }) };
      });
      return output.result;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "REVIEW_DEPENDENCY_CHANGED" || attempt === 2) throw error;
    }
  }
  throw new Error("REVIEW_DEPENDENCY_CHANGED");
}

/** Historical identity roots also retain downstream support that may still have queued work. */
export async function snapshotIdentityRoots(sql: postgres.TransactionSql, snapshotId: string) {
  const rows = await sql`select id from public.observation where structured_value->>'identity_for_snapshot' = ${snapshotId}`;
  return rows.map((row) => row.id as string);
}

export async function invalidateDependencies(sql: postgres.TransactionSql, current: DependencyContext, decisionId: string,
  options: { invalidateParse?: boolean } = {}) {
  await sql`update public.relationship set state = 'candidate' where state = 'active'
    and id in (select relationship_id from public.relationship_support where observation_id = any(${current.ids}))`;
  const scopes = current.scopes.filter((scope) => options.invalidateParse || !scope.startsWith('parse:'));
  const heads = await sql`select scope_key, input_fingerprint from public.processing_head
    where scope_key = any(${scopes}) order by scope_key for update`;
  for (const head of heads) {
    const fingerprint = inputFingerprint({ invalidated_by: decisionId, previous_input: head.input_fingerprint }, {});
    await sql`update public.processing_head set input_fingerprint = ${fingerprint}, updated_at = now() where scope_key = ${head.scope_key}`;
  }
  // Identity review owns parse enqueueing; Person archival fences parse work without fabricating replacement inputs.
  await sql`select id from public.processing_job where scope_key = any(${scopes}) and state in ('queued','leased') order by id for update`;
  await sql`update public.processing_run r set outcome = 'superseded', finished_at = now()
    from public.processing_job j where r.lease_token = j.lease_token and r.outcome = 'running'
      and j.scope_key = any(${scopes}) and j.state in ('queued','leased')`;
  await sql`update public.processing_job set state = 'superseded', lease_token = null, leased_until = null
    where scope_key = any(${scopes}) and state in ('queued','leased')`;
}

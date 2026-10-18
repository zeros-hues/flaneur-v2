import type postgres from "postgres";
import { z } from "zod";
import { readReviewGraph } from "../processing/postgres-dependencies";
import { dependentObservationIds } from "../processing/dependencies";
import { inspectionView, type InspectionObservation, type InspectionEvidence, type InspectionPage } from "./inspection";

/** Shared query body for rollback fixtures; the application wrapper below enforces a read-only transaction. */
export async function inspectPersonTransaction(sql: postgres.TransactionSql, personId: string, cursor?: string,
  kind:"person"|"artifact"|"encounter"|"concept"="person") {
    const id = z.uuid().parse(personId).toLowerCase(), after = cursor ? z.uuid().parse(cursor).toLowerCase() : null;
      const [person] = await sql`select archived_at is not null as archived from public.object_ref r where id = ${id} and kind = ${kind}
        and not exists (select 1 from public.object_alias a where a.former_object_id = r.id)`;
      if (!person) return { page: null };
      const rows = await sql<Omit<InspectionObservation, "active" | "identityProof" | "evidence" | "reviews">[]>`
        select id, body_text as "bodyText", truth_layer as layer, semantic_role as "semanticRole", support_status as "supportStatus",
        to_char(recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "recordedAt", supersedes_id as "supersedesId"
        from public.observation where subject_id = ${id} and (${after}::uuid is null or id > ${after}::uuid) order by id limit 21`;
      const selected = rows.slice(0, 20), ids = selected.map(row => row.id);
      if (!ids.length) return { page: { personId: id, archived: person.archived, observations: [], nextCursor: null } as InspectionPage };
      const graph = await readReviewGraph(sql), nodes = new Map(graph.nodes.map(node => [node.id, node]));
      const inactive = dependentObservationIds(graph.nodes, graph.edges, graph.nodes.filter(node => node.inactive).map(node => node.id));
      const evidence = await sql<(InspectionEvidence & { observationId: string })[]>`select e.id, e.observation_id as "observationId",
        e.support_role as role, e.snapshot_id as "snapshotId", e.supporting_observation_id as "supportingObservationId",
        s.source_url as "sourceUrl", e.excerpt, t.quote, t.start_codepoint as start, t.end_codepoint as end,
        r.text, r.snapshot_id as "representationSnapshotId" from public.observation_evidence e
        left join public.snapshot s on s.id = e.snapshot_id left join public.text_evidence t on t.evidence_id = e.id
        left join public.snapshot_representation r on r.id = t.representation_id
        where e.observation_id = any(${ids}::uuid[]) order by e.id limit 2001`;
      const reviews = await sql<(InspectionObservation["reviews"][number] & { observationId: string })[]>`
        select observation_id as "observationId", decision, comment, replacement_observation_id as "replacementId",
        to_char(reviewed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "reviewedAt"
        from public.observation_review where observation_id = any(${ids}::uuid[]) order by reviewed_at,id limit 2001`;
      if (evidence.length > 2000 || reviews.length > 2000) throw new Error("INSPECTION_SUPPORT_LIMIT");
      const observations = selected.map(row => inspectionView({ ...row, active: !inactive.has(row.id),
        identityProof: nodes.get(row.id)?.identityProof ?? true,
        relationshipReview:nodes.get(row.id)?.relationshipReview??false,
        evidence: evidence.filter(item => item.observationId === row.id).map(({ observationId: _id, ...item }) => item),
        reviews: reviews.filter(item => item.observationId === row.id).map(({ observationId: _id, ...item }) => item) }));
      return { page: { personId: id, archived: person.archived, observations,
        nextCursor: rows.length > 20 ? selected.at(-1)!.id : null } as InspectionPage };
}

export function postgresInspectionReader(connection: ReturnType<typeof postgres>) {
  return async (personId: string, cursor?: string): Promise<InspectionPage | null> => {
    const result = await connection.begin("isolation level repeatable read read only", async sql => {
      await sql`set local statement_timeout = '15s'`;
      const [guard] = await sql`select current_setting('transaction_read_only') as mode`;
      if (guard!.mode !== "on") throw new Error("INSPECTION_NOT_READ_ONLY");
      return inspectPersonTransaction(sql, personId, cursor);
    });
    return result.page;
  };
}

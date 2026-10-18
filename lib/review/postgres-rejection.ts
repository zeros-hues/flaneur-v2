import type postgres from "postgres";
import type { ConfirmationStore, ConfirmationTransaction } from "./confirmation";
import { withDependencyTransaction, invalidateDependencies } from "../processing/postgres-dependencies";

/** Prepared only. Locks affected object processing scopes before the memory graph, then rechecks closure. */
export function postgresReviewStore(connection: ReturnType<typeof postgres>): ConfirmationStore {
  return { async transaction<T>(observationId: string, work: (tx: ConfirmationTransaction) => Promise<T>) {
    return withDependencyTransaction(connection, async () => [observationId], [], async (sql, current) => {
      const { nodes, inactive } = current;
      return work({
        async confirmationReceipt(id) {
          const rows = await sql`select v.observation_id, v.decision, v.comment, v.replacement_observation_id,
            n.body_text, n.truth_layer, n.supersedes_id from public.observation_review v
            left join public.observation n on n.id = v.replacement_observation_id where v.id = ${id}`;
          const row = rows[0];
          if (row && (row.decision !== 'confirmed' || row.truth_layer !== 'user' || row.supersedes_id !== row.observation_id))
            throw new Error("REVIEW_REQUEST_CONFLICT");
          return row ? { id, observationId: row.observation_id, comment: row.comment,
            replacementId: row.replacement_observation_id, bodyText: row.body_text } : null;
        },
        async insertConfirmationReplacement(review) {
          await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, structured_value,
            field_key, support_status, supersedes_id, origin_key)
            select ${review.replacementId}, subject_id, 'user', semantic_role, ${review.bodyText},
              ${sql.json({ confirmed_observation_id: review.observationId, confirmation_review_id: review.id })},
              null, 'verified', id, ${`observation-confirmation:${review.id}:replacement`}
            from public.observation where id = ${review.observationId}`;
        },
        async insertConfirmationReview(review) {
          await sql`insert into public.observation_review (id, observation_id, decision, replacement_observation_id, comment)
            values (${review.id}, ${review.observationId}, 'confirmed', ${review.replacementId}, ${review.comment})`;
        },
        async correctionReceipt(id) {
          const rows = await sql`select v.observation_id, v.decision, v.comment, v.replacement_observation_id,
            n.body_text, n.truth_layer, n.supersedes_id from public.observation_review v
            left join public.observation n on n.id = v.replacement_observation_id where v.id = ${id}`;
          const row = rows[0];
          if (row && (row.decision !== 'corrected' || row.truth_layer !== 'user' || row.supersedes_id !== row.observation_id))
            throw new Error("REVIEW_REQUEST_CONFLICT");
          return row ? { id, observationId: row.observation_id, comment: row.comment,
            replacementId: row.replacement_observation_id, bodyText: row.body_text } : null;
        },
        async receipt(id) {
          const rows = await sql`select observation_id, decision, comment from public.observation_review where id = ${id}`;
          const row = rows[0];
          if (row && row.decision !== 'rejected') throw new Error("REVIEW_REQUEST_CONFLICT");
          return row ? { id, observationId: row.observation_id, comment: row.comment } : null;
        },
        async observation(id) {
          const node = nodes.find((item) => item.id === id);
          return node ? { layer: node.layer, bodyText: node.bodyText, identityProof: node.identityProof,relationshipReview:node.relationshipReview, active: !inactive.has(id) } : null;
        },
        async insertReview(review) {
          await sql`insert into public.observation_review (id, observation_id, decision, replacement_observation_id, comment)
            values (${review.id}, ${review.observationId}, 'rejected', null, ${review.comment})`;
        },
        async insertReplacement(review) {
          // Authored replacement inherits the subject/semantic purpose, never extracted metadata or field projections.
          await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, structured_value,
            field_key, support_status, supersedes_id, origin_key)
            select ${review.replacementId}, subject_id, 'user', semantic_role, ${review.bodyText},
              ${sql.json({ corrected_observation_id: review.observationId, correction_review_id: review.id })},
              null, 'verified', id, ${`observation-correction:${review.id}:replacement`}
            from public.observation where id = ${review.observationId}`;
        },
        async insertCorrectionReview(review) {
          await sql`insert into public.observation_review (id, observation_id, decision, replacement_observation_id, comment)
            values (${review.id}, ${review.observationId}, 'corrected', ${review.replacementId}, ${review.comment})`;
        },
        async invalidate(review) { await invalidateDependencies(sql, current, review.id); },
      });
    });
  } };
}

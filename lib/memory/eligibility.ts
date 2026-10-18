import { sql, type SQLWrapper } from "drizzle-orm";

/** Canonical active registry membership, used before ranking/limits by legacy compatibility readers. */
export const activePerson = (id: SQLWrapper) => sql`exists (select 1 from public.object_ref active_person_ref
  where active_person_ref.id = ${id} and active_person_ref.kind = 'person' and active_person_ref.archived_at is null
    and not exists (select 1 from public.object_alias active_person_alias where active_person_alias.former_object_id = active_person_ref.id))`;
export const activeArtifact = (id: SQLWrapper, personId: SQLWrapper) => sql`exists (select 1 from public.object_ref active_artifact_ref
  where active_artifact_ref.id = ${id} and active_artifact_ref.kind = 'artifact' and active_artifact_ref.archived_at is null
    and not exists (select 1 from public.object_alias active_artifact_alias where active_artifact_alias.former_object_id = active_artifact_ref.id))
  and (${personId} is null or ${activePerson(personId)})`;
/** Require at least one currently eligible shared artifact before showing old stored co-occurrence edges. */
export const activeConceptPair = (left: SQLWrapper, right: SQLWrapper) => sql`exists (
  select 1 from public.concept_link active_link_left join public.concept_link active_link_right
    on active_link_right.artifact_id = active_link_left.artifact_id
  join public.artifact active_pair_artifact on active_pair_artifact.id = active_link_left.artifact_id
  where active_link_left.concept_id = ${left} and active_link_right.concept_id = ${right}
    and ${activeArtifact(sql`active_pair_artifact.id`, sql`active_pair_artifact.person_id`)})`;

import type postgres from "postgres";
import { readCandidates, type ReaderData, type ObservationRow, type LocatorRow } from "./reader";
import type { RetrievalReader } from "./pipeline";
import type { Request } from "./evidence";
import type { CapturedSourceRow } from "./captured-source";
import { TEXT_NORMALIZER_VERSION } from "../processing/parse-input";
import {addRelationshipFilters} from './postgres-relationships';
import {relationshipKinds} from './relationship-filters';
import { generateSemanticCandidates } from "./postgres-semantic";
import type { SemanticCandidate } from "./semantic-types";

/** Prepared v2 reader only: repeatable-read, read-only; no pool, credentials or application imports. */
export async function readRetrievalTransaction(sql:postgres.TransactionSql,request:Request){
    const kinds = relationshipKinds(request) ?? ["person", "artifact", "encounter"];
    if (!kinds.length || kinds.some((kind) => !["person", "artifact", "encounter"].includes(kind)))
      throw new Error("INVALID_READER_SCOPE");
      // Defined type population: active canonical objects. No semantic top-k cap.
      const objects = await sql<ReaderData["objects"]>`select id, kind from public.object_ref r
        where kind = any(${kinds}) and archived_at is null
          and not exists (select 1 from public.object_alias a where a.former_object_id = r.id) order by id`;
      if (objects.length > 5000) throw new Error("READER_POPULATION_LIMIT");
      const observations = await sql<ObservationRow[]>`select o.id, o.subject_id as "subjectId", o.truth_layer as layer,
        o.body_text as text, o.support_status as "supportStatus",
        (r.archived_at is not null or s.archived_at is not null
          or exists (select 1 from public.object_alias a where a.former_object_id in (o.id, o.subject_id))
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
              and not exists(select 1 from public.object_alias alias where alias.former_object_id=c.id)))) as inactive,
        case when o.field_key like 'capture_field:%' then jsonb_build_object(
          'snapshotId', d.snapshot_id, 'fingerprint', d.input_fingerprint,
          'identityObservationId', d.identity_observation_id, 'representationId', d.representation_id) else null end as derivation
        from public.observation o
        left join public.observation_derivation d on d.observation_id = o.id
        join public.object_ref r on r.id = o.id join public.object_ref s on s.id = o.subject_id
        order by o.id`;
      if (observations.length > 50000) throw new Error("READER_EVIDENCE_LIMIT");
      const dependencies = await sql<NonNullable<ReaderData["dependencies"]>>`select observation_id as "observationId",
        supporting_observation_id as "supportingObservationId", support_role as role from public.observation_evidence
        where supporting_observation_id is not null
        union all select observation_id, identity_observation_id, 'supports' from public.observation_derivation`;
      if (dependencies.length > 50000) throw new Error("READER_DEPENDENCY_LIMIT");
      const derivationHeads = await sql<NonNullable<ReaderData["derivationHeads"]>>`select split_part(h.scope_key, ':', 3) as "snapshotId",
        h.input_fingerprint as fingerprint, case when count(o.id) = 1 then min(o.id::text) else null end as "identityObservationId",
        count(o.id) = 1 as "identityActive" from public.processing_head h left join public.observation o
          on h.scope_key = 'parse:snapshot:' || (o.structured_value->>'identity_for_snapshot')
          and o.support_status = 'verified' and o.truth_layer in ('user','source','extracted')
          and exists (select 1 from public.object_ref r where r.id = o.id and r.archived_at is null)
          and exists (select 1 from public.object_ref r where r.id = o.subject_id and r.kind = 'person' and r.archived_at is null)
          and not exists (select 1 from public.object_alias a where a.former_object_id = o.subject_id)
          and not exists (select 1 from public.observation_review v where v.observation_id = o.id)
          and not exists (select 1 from public.observation n where n.supersedes_id = o.id)
          and exists (select 1 from public.encounter e join public.encounter_object x on x.encounter_id = e.id
            where e.snapshot_id::text = o.structured_value->>'identity_for_snapshot'
              and x.object_id = o.subject_id and x.relation = 'noticed')
          and not exists (select 1 from public.encounter e join public.encounter_object x on x.encounter_id = e.id
            join public.object_ref r on r.id = x.object_id where e.snapshot_id::text = o.structured_value->>'identity_for_snapshot'
              and x.relation = 'noticed' and r.kind = 'person' and x.object_id <> o.subject_id)
        where h.scope_key like 'parse:snapshot:%' group by h.scope_key, h.input_fingerprint`;
      const locators = await sql<LocatorRow[]>`select e.id as "evidenceId", e.observation_id as "observationId",
        e.snapshot_id as "snapshotId", r.snapshot_id as "representationSnapshotId", r.id as "representationId", r.text,
        t.start_codepoint as start, t.end_codepoint as end, t.quote, e.excerpt, e.support_role as role
        ,s.source_url as "sourceUrl" from public.observation_evidence e join public.text_evidence t on t.evidence_id = e.id
        join public.snapshot s on s.id=e.snapshot_id
        join public.snapshot_representation r on r.id = t.representation_id order by e.id`;
      const facts = await sql<ReaderData["facts"]>`select x.observation_id as "observationId", 'school' as field, e.school as value
        from public.education_observation x join public.education e on e.id = x.education_id where x.field_key = 'school'
        union all select x.observation_id, 'role', r.title from public.role_observation x
          join public.role r on r.id = x.role_id where x.field_key = 'title'
        union all select x.observation_id, 'organization', o.display_name from public.role_observation x
          join public.role r on r.id = x.role_id join public.organisation o on o.id = r.organisation_id
          where x.field_key = 'organisation_id'
        union all select o.id, o.structured_value->>'retrieval_field', o.structured_value->>'value'
          from public.observation o where o.truth_layer = 'extracted' and o.semantic_role = 'fact'
            and o.field_key = 'capture_field:' || (o.structured_value->>'retrieval_field')
            and o.structured_value->>'retrieval_field' in ('school','role','organization')
            and o.structured_value->>'value' = o.body_text`;
      const encounters = await sql<ReaderData["encounters"]>`select e.id, e.snapshot_id as "snapshotId",
        to_char(e.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "occurredAt",
        false as "clockVerified" from public.encounter e join public.object_ref r on r.id = e.id
        where r.archived_at is null and not exists (select 1 from public.object_alias a where a.former_object_id = e.id)`;
      const links = await sql<ReaderData["links"]>`select encounter_id as "encounterId", object_id as "objectId", relation
        from public.encounter_object order by encounter_id, object_id, relation`;
      const legacyNotes=await sql<NonNullable<ReaderData["legacyNotes"]>>`select n.id,n.person_id as "personId",
        n.artifact_id as "artifactId",n.snapshot_id as "snapshotId",n.body from public.note n
        where not exists(select 1 from public.observation o where o.id=n.id or o.structured_value->>'legacy_note_id'=n.id::text)
        and not exists(select 1 from public.encounter e join public.object_ref er on er.id=e.id
          where e.snapshot_id=n.snapshot_id and (er.archived_at is not null
            or exists(select 1 from public.object_alias ea where ea.former_object_id=e.id)))
        order by n.id limit 50001`;
      if (legacyNotes.length>50000 || locators.length > 50000 || facts.length > 50000 || links.length > 50000 || encounters.length > 5000 || derivationHeads.length > 5000)
        throw new Error("READER_EVIDENCE_LIMIT");
      const capturedSources = await sql<CapturedSourceRow[]>`select r.id, r.snapshot_id as "snapshotId",
        r.normalizer_version as "normalizerVersion", r.text, r.text_hash as "textHash",
        s.artifact_id as "artifactId", e.id as "encounterId", s.source_url as "sourceUrl",
        s.content_hash as "contentHash", s.adapter_id as "adapterId",
        case when s.capture_type = 'profile' then 'profile_page' else 'social_post' end as kind,
        j.input_fingerprint as fingerprint
        from public.snapshot_representation r join public.snapshot s on s.id=r.snapshot_id
        join public.capture_request request on request.snapshot_id=s.id
        join public.encounter e on e.id=request.encounter_id and e.snapshot_id=s.id
        join public.artifact a on a.id=s.artifact_id and a.migration_key like 'capture-source-v1:%'
        join public.object_ref ar on ar.id=a.id and ar.kind='artifact' and ar.archived_at is null
        join public.object_ref er on er.id=e.id and er.archived_at is null
        join public.processing_head h on h.scope_key='parse:snapshot:' || s.id::text
        join public.processing_job j on j.scope_key=h.scope_key and j.input_fingerprint=h.input_fingerprint
          and j.snapshot_id=s.id and j.kind='parse' and j.state='succeeded'
        where r.normalizer_version=${TEXT_NORMALIZER_VERSION} || ':' ||
          case when s.capture_type='profile' then 'profile_page' else 'social_post' end
          and exists(select 1 from public.encounter_object x where x.encounter_id=e.id and x.object_id=a.id and x.relation='source')
          and not exists(select 1 from public.object_alias alias where alias.former_object_id in (a.id,e.id))
        order by r.id limit 50001`;
      if (capturedSources.length > 50000) throw new Error("READER_EVIDENCE_LIMIT");
      const output=readCandidates({ objects, observations, locators, facts, encounters, links, derivationHeads, dependencies,legacyNotes,capturedSources });
      await addRelationshipFilters(sql,request,output.candidates);
      if (request.mode === "resurface") {
        const queryText = request.question || request.terms.join(" ");
        let semanticCandidates: SemanticCandidate[] = [];
        if (request.semanticScorer) {
          try {
            semanticCandidates = await request.semanticScorer.scoreCandidates(queryText);
          } catch {
            semanticCandidates = [];
          }
        } else {
          try {
            semanticCandidates = await generateSemanticCandidates(sql, queryText);
          } catch {
            semanticCandidates = [];
          }
        }
        if (semanticCandidates.length > 0) {
          const semanticById = new Map(semanticCandidates.map((c) => [c.id, c]));
          for (const candidate of output.candidates) {
            const match = semanticById.get(candidate.id);
            if (match) {
              candidate.semanticScore = match.score;
              if (match.conceptMatches?.length) {
                candidate.semanticConceptMatches = match.conceptMatches;
              }
              if (match.authorId) {
                candidate.authorId = match.authorId;
              }
              if (match.sourceDomain) {
                candidate.sourceDomain = match.sourceDomain;
              }
            }
          }
        }
      }
      return {output};
}
export function postgresRetrievalReader(connection:ReturnType<typeof postgres>):RetrievalReader{
  return {async read(request){
    const result=await connection.begin("isolation level repeatable read read only",async sql=>{
      await sql`set local statement_timeout = '15s'`;
      const [guard]=await sql`select current_setting('transaction_read_only') as read_only`;
      if(guard?.read_only!=="on")throw new Error("READER_NOT_READ_ONLY");
      return readRetrievalTransaction(sql,request);
    });return result.output;
  } };
}

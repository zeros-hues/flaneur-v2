import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { databaseTimestamp } from "../database-timestamp";
import { composeContextualWalk } from "./contextual";
import { contextualCandidatesTransaction } from "./postgres-contextual";
import type { WalkFeedback, ContextualCandidate } from "./contextual";
import type { OpenWalk, RecordWalkEvent, StoredWalkSession, StoredWalkStop, WalkSessionStore } from "./sessions";

type Tx = postgres.TransactionSql;
const stamp = (value: unknown) => value === null ? null : databaseTimestamp(value).toISOString();
const terminal = ["kept", "useful", "reduced", "dismissed", "passed", "unavailable"];
async function lock(tx: Tx, ownerId: string) {
  await tx`set local statement_timeout = '20s'`; await tx`set local lock_timeout = '5s'`;
  await tx`select pg_advisory_xact_lock(hashtextextended(${`flaneur:walk-owner:${ownerId}`},0))`;
  // Review/archive writers take this graph lock exclusively. No processing scopes are written here.
  await tx`select pg_advisory_xact_lock_shared(1790703955,1)`;
}
export async function loadWalkSessionTransaction(tx: Tx, id: string, ownerId: string): Promise<StoredWalkSession> {
  const [row] = await tx`select id,owner_id,local_day::text,timezone,explicit_context,created_at,completed_at
    from public.walk_session where id=${id} and owner_id=${ownerId}`;
  if (!row) throw new Error("WALK_SESSION_UNAVAILABLE");
  const stops = await tx`select id,object_id,position,selection_reasons,selection_support,selection_inputs,resolution,resolved_at
    from public.walk_stop where session_id=${id} order by position`;
  return { id: row.id, ownerId: row.owner_id, localDay: row.local_day, timezone: row.timezone,
    context: row.explicit_context, createdAt: stamp(row.created_at)!, completedAt: stamp(row.completed_at),
    stops: stops.map(stop => ({ id: stop.id, objectId: stop.object_id, position: stop.position,
      selectionReasons: stop.selection_reasons, selectionSupport: stop.selection_support, selectionInputs: stop.selection_inputs,
      resolution: stop.resolution, resolvedAt: stamp(stop.resolved_at) }) as StoredWalkStop) };
}
const load=loadWalkSessionTransaction;
async function complete(tx: Tx, sessionId: string) {
  await tx`update public.walk_session set completed_at=clock_timestamp()
    where id=${sessionId} and completed_at is null and not exists(
      select 1 from public.walk_stop where session_id=${sessionId} and resolved_at is null)`;
}
async function insertEvent(tx: Tx, stopId: string, id: string, kind: string) {
  await tx`insert into public.attention_event(id,stop_id,kind)values(${id},${stopId},${kind})`;
  if (terminal.includes(kind)) await tx`update public.walk_stop t set resolution=${kind},resolved_at=e.recorded_at
    from public.attention_event e where t.id=${stopId} and e.id=${id}`;
}
async function withdrawUnavailable(tx: Tx, sessionId: string,reader:(tx:Tx)=>Promise<ContextualCandidate[]>) {
  const remaining=await tx`select id,object_id from public.walk_stop where session_id=${sessionId} and resolved_at is null order by position`;
  if(remaining.length){
    const available=new Set((await reader(tx)).filter(candidate=>candidate.evidence.some(item=>item.text.trim()&&!item.provenance?.encounterId)).map(candidate=>candidate.id));
    for(const stop of remaining)if(!available.has(stop.object_id))await insertEvent(tx,stop.id,randomUUID(),"unavailable");
  }
  await complete(tx, sessionId);
}
async function feedback(tx: Tx, ownerId: string): Promise<WalkFeedback[]> {
  const rows = await tx`select t.object_id,count(*) filter(where e.kind in ('dismissed','reduced'))::int as dismissals,
    max(e.recorded_at) filter(where e.kind='shown') as last_exposed_at
    from public.attention_event e join public.walk_stop t on t.id=e.stop_id join public.walk_session s on s.id=t.session_id
    where s.owner_id=${ownerId} group by t.object_id`;
  return rows.map(row => ({ objectId: row.object_id, dismissals: row.dismissals, lastExposedAt: stamp(row.last_exposed_at) }));
}

/** Prepared supplied-connection stores only. No env, runtime pool, routes, or applied DDL. */
export function postgresWalkSessionStore(connection: ReturnType<typeof postgres>,
  candidatesReader: (tx: Tx) => Promise<ContextualCandidate[]> = contextualCandidatesTransaction): WalkSessionStore {
  return {
    async open(input: OpenWalk) {
      const result = await connection.begin("isolation level read committed", async tx => {
        await lock(tx, input.ownerId);
        const [anchor] = await tx`select timezone from public.walk_session where owner_id=${input.ownerId} order by created_at,id limit 1`;
        if (anchor && anchor.timezone !== input.timezone) throw new Error("WALK_TIMEZONE_LOCKED");
        const [clock] = await tx`select clock_timestamp() as now`;
        const instant = databaseTimestamp(clock!.now).toISOString();
        const [day] = await tx`select (${instant}::timestamptz at time zone ${input.timezone})::date::text as day`;
        const [existing] = await tx`select id from public.walk_session where owner_id=${input.ownerId} and local_day=${day!.day}::date`;
        if (existing) {
          await withdrawUnavailable(tx, existing.id,candidatesReader);
          return { session: await load(tx, existing.id, input.ownerId) };
        }
        const id = randomUUID();
        const candidates = await candidatesReader(tx);
        const selected = composeContextualWalk(candidates, { referenceInstant: instant, context: input.context, feedback: await feedback(tx, input.ownerId) });
        await tx`insert into public.walk_session(id,owner_id,local_day,timezone,explicit_context,created_at,stop_count)
          values(${id},${input.ownerId},${day!.day}::date,${input.timezone},${input.context ?? null},${instant},0)`;
        for (const [position, stop] of selected.entries()) {
          // Keep evidence IDs/truth layers/provenance, not duplicated notebook or source text.
          const support = stop.selectionSupport.map(e => ({ id: e.id, layer: e.layer, verified: e.verified,
            provenance: {
              ...(e.provenance?.observationId ? { observationId: e.provenance.observationId } : {}),
              ...(e.provenance?.legacyNoteId ? { legacyNoteId: e.provenance.legacyNoteId } : {}),
              ...(e.provenance?.encounterId ? { encounterId: e.provenance.encounterId } : {}),
              ...(e.provenance?.snapshotId ? { snapshotId: e.provenance.snapshotId } : {}),
              ...(e.provenance?.representationId ? { representationId: e.provenance.representationId,
                startCodepoint: e.provenance.startCodepoint, endCodepoint: e.provenance.endCodepoint } : {}),
            } }));
          const inputs = { savedAt: stop.savedAt, lastEncounterAt: stop.lastEncounterAt, encounterCount: stop.encounterCount };
          await tx`insert into public.walk_stop(id,session_id,object_id,position,selection_reasons,selection_support,selection_inputs,rank_version)
            values(${randomUUID()},${id},${stop.id},${position + 1},${tx.json(stop.reasons)},${tx.json(support)},${tx.json(inputs)},'contextual-v1')`;
        }
        await tx`update public.walk_session set sealed_at=clock_timestamp(),stop_count=${selected.length} where id=${id}`;
        if (!selected.length) await complete(tx, id);
        return { session: await load(tx, id, input.ownerId) };
      });
      return result.session;
    },
    async record(input: RecordWalkEvent) {
      const result = await connection.begin("isolation level read committed", async tx => {
        await lock(tx, input.ownerId);
        const [prior] = await tx`select e.stop_id,e.kind,t.session_id,s.owner_id from public.attention_event e
          join public.walk_stop t on t.id=e.stop_id join public.walk_session s on s.id=t.session_id where e.id=${input.eventId}`;
        if (prior) {
          if (prior.owner_id !== input.ownerId || prior.session_id !== input.sessionId || prior.stop_id !== input.stopId || prior.kind !== input.kind)
            throw new Error("WALK_EVENT_CONFLICT");
          return { session: await load(tx, input.sessionId, input.ownerId), eventId: input.eventId, replayed: true };
        }
        const [target] = await tx`select t.id,s.local_day=(clock_timestamp() at time zone s.timezone)::date as current_day
          from public.walk_stop t join public.walk_session s on s.id=t.session_id
          where t.id=${input.stopId} and s.id=${input.sessionId} and s.owner_id=${input.ownerId}`;
        if (!target) throw new Error("WALK_STOP_UNAVAILABLE");
        if (!target.current_day) throw new Error("WALK_SESSION_EXPIRED");
        // An explicit action cannot act on withdrawn objects. Resume performs historical withdrawal separately.
        const [active] = await tx`select r.id from public.object_ref r join public.walk_stop t on t.object_id=r.id
          where t.id=${input.stopId} and r.archived_at is null and not exists(select 1 from public.object_alias a where a.former_object_id=r.id)`;
        if (!active) throw new Error("WALK_STOP_UNAVAILABLE");
        await insertEvent(tx, input.stopId, input.eventId, input.kind);
        await complete(tx, input.sessionId);
        return { session: await load(tx, input.sessionId, input.ownerId), eventId: input.eventId, replayed: false };
      });
      return result;
    },
  };
}

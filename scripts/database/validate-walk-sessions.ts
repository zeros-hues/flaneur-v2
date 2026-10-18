import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { postgresWalkSessionStore } from "../../lib/walk/postgres-sessions";
import { openWalk, recordWalkEvent } from "../../lib/walk/sessions";
import { contextualCandidatesTransaction } from "../../lib/walk/postgres-contextual";
import { markValidationStage } from "./validation-stage";
import { exportCatalog, exportRows } from "../../lib/export/postgres-v2";
import { buildMemoryExport } from "../../lib/export/v2";
import { readWalkViewTransaction,postgresWalkView } from "../../lib/walk/postgres-view";

async function state(connection:Connection){
  return connection.begin('isolation level repeatable read read only',async tx=>{
    const [row]=await tx`select to_regclass('public.walk_session') is not null as session,
      to_regclass('public.walk_stop') is not null as stop,to_regclass('public.attention_event') is not null as event`;
    if(row!.session!==row!.stop||row!.session!==row!.event)throw new Error('WALK_PARTIAL_SCHEMA');
    const [counts]=row!.session?await tx`select (select count(*)::int from public.walk_session) as sessions,
      (select count(*)::int from public.walk_stop) as stops,(select count(*)::int from public.attention_event) as events`:[];
    return {exists:row!.session as boolean,counts:counts??null};
  });
}
export async function validateWalkSessions(connection: Connection) {
  markValidationStage("walk_sessions_proposed"); let checks=0;
  const before=await state(connection);
  if(before.exists){assert.deepEqual(await postgresWalkView(connection)(randomUUID()),{timezone:null,session:null});checks++;}
  const rollback=new Error("WALK_SESSIONS_FIXTURE_ROLLBACK");
  try{await connection.begin("isolation level read committed",async tx=>{
    await tx`set local statement_timeout = '30s'`;await tx`set local lock_timeout = '5s'`;
    if(!before.exists)for(const statement of readFileSync("db/migrations/0016_walk_sessions.sql","utf8").split("--> statement-breakpoint"))
      if(statement.trim())await tx.unsafe(statement);
    const ids: string[]=Array.from({length:4},()=>randomUUID());const owner=randomUUID(),other=randomUUID();
    for(const id of ids){
      await tx`insert into public.person(id,profile_url,name,first_captured_at)values(${id},${`https://www.linkedin.com/in/walk-session-${id}/`},'Walk session fixture','2025-01-01T00:00:00Z')`;
      await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status)
        values(${randomUUID()},${id},'user','note','  Exact User words for Walk  ','verified')`;
    }
    const target=fixtureConnection(tx),store=postgresWalkSessionStore(target,async sql=>(await contextualCandidatesTransaction(sql)).filter(item=>ids.includes(item.id)));
    const context='  Exact current context 😀\n  ';
    const session=await openWalk({ownerId:owner,timezone:'UTC',context},store);
    assert.equal(session.stops.length,3);assert.equal(session.context,context);checks+=2;
    assert.ok(session.stops.every(stop=>stop.selectionSupport.some(item=>item.layer==='user'&&item.provenance?.observationId)));checks++;
    assert.equal(JSON.stringify(session.stops).includes('Exact User words for Walk'),false);checks++;
    const initialView=await readWalkViewTransaction(tx,owner);assert.equal(initialView.session!.stops.length,3);checks++;
    assert.equal(JSON.stringify(initialView).includes(owner),false);checks++;
    const [selected]=await tx`select count(*)::int as count from public.attention_event e join public.walk_stop t on t.id=e.stop_id
      join public.walk_session s on s.id=t.session_id where s.owner_id=${owner}`;
    assert.equal(selected!.count,0);checks++;
    assert.deepEqual(await openWalk({ownerId:owner,timezone:'UTC',context:'Changed context'},store),session);checks++;
    await assert.rejects(openWalk({ownerId:owner,timezone:'Asia/Calcutta'},store),/WALK_TIMEZONE_LOCKED/);checks++;
    const stop=session.stops[0]!,shown=randomUUID(),dismissed=randomUUID();
    const event={ownerId:owner,sessionId:session.id,stopId:stop.id,eventId:shown,kind:'shown' as const};
    assert.equal((await recordWalkEvent(event,store)).replayed,false);checks++;
    assert.equal((await readWalkViewTransaction(tx,owner)).session!.stops.find(item=>item.id===stop.id)!.shown,true);checks++;
    assert.equal((await recordWalkEvent(event,store)).replayed,true);checks++;
    await assert.rejects(recordWalkEvent({...event,kind:'opened'},store),/WALK_EVENT_CONFLICT/);checks++;
    await assert.rejects(recordWalkEvent({...event,ownerId:other},store),/WALK_EVENT_CONFLICT/);checks++;
    await assert.rejects(recordWalkEvent({...event,eventId:randomUUID(),stopId:session.stops[1]!.id,kind:'kept'},store));checks++;
    await recordWalkEvent({...event,eventId:dismissed,kind:'dismissed'},store);
    const replay=await recordWalkEvent({...event,eventId:dismissed,kind:'dismissed'},store);
    assert.equal(replay.replayed,true);assert.equal(replay.session.stops[0]!.resolution,'dismissed');checks+=2;
    for(const remaining of session.stops.slice(1)){
      const base={ownerId:owner,sessionId:session.id,stopId:remaining.id};
      await recordWalkEvent({...base,eventId:randomUUID(),kind:'shown'},store);
      await recordWalkEvent({...base,eventId:randomUUID(),kind:'passed'},store);
    }
    const completed=await openWalk({ownerId:owner,timezone:'UTC'},store);
    assert.ok(completed.completedAt);assert.equal(completed.stops.length,3);assert.equal(completed.id,session.id);checks+=3;
    const completedView=await readWalkViewTransaction(tx,owner);assert.equal(completedView.session!.completed,true);assert.equal(completedView.session!.stops.length,0);checks+=2;
    assert.equal((await recordWalkEvent({...event,eventId:dismissed,kind:'dismissed'},store)).replayed,true);checks++;
    await assert.rejects(recordWalkEvent({...event,eventId:randomUUID(),kind:'opened'},store));checks++;
    async function reject(work:()=>Promise<unknown>,code='23514'){
      let actual;try{await tx.savepoint(async()=>{await work();await tx`set constraints all immediate`;});}catch(error){actual=(error as {code?:string}).code;}
      assert.equal(actual,code);checks++;
    }
    await reject(()=>tx`update public.walk_session set completed_at=null where id=${session.id}`);
    await reject(()=>tx`update public.walk_session set explicit_context='changed' where id=${session.id}`);
    await reject(()=>tx`insert into public.walk_stop(id,session_id,object_id,position,selection_reasons,selection_support,selection_inputs,rank_version)
      values(${randomUUID()},${session.id},${ids.find(id=>!session.stops.some(s=>s.objectId===id))!},1,'[{"code":"user_words","text":"User words"}]','[{"id":"fixture"}]','{}','contextual-v1')`);
    await reject(()=>tx`delete from public.attention_event where id=${shown}`);
    await reject(()=>tx`update public.walk_stop set resolved_at=null,resolution=null where id=${stop.id}`);
    await reject(()=>tx`update public.attention_event set kind='opened' where id=${shown}`);
    await reject(()=>tx`update public.walk_session set stop_count=0 where id=${session.id}`);
    await reject(()=>tx`insert into public.walk_session(id,owner_id,local_day,timezone,stop_count)
      values(${randomUUID()},${randomUUID()},current_date,'UTC',0)`);
    const emptyOwner=randomUUID(),emptyStore=postgresWalkSessionStore(target,async()=>[]);
    const empty=await openWalk({ownerId:emptyOwner,timezone:'UTC'},emptyStore);
    assert.equal(empty.stops.length,0);assert.ok(empty.completedAt);checks+=2;
    assert.deepEqual(await openWalk({ownerId:emptyOwner,timezone:'UTC',context:'No refill'},store),empty);checks++;
    // Previous local-day history affects selection; the service does not accept caller dates.
    const historyOwner=randomUUID(),suppressed=ids[0]!,recent=ids[1]!;
    async function history(objectId:string,days:number,kind:'dismissed'|'passed'){
      const id=randomUUID(),stopId=randomUUID(),eventId=randomUUID();
      const [clock]=await tx`select (date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')
        - ${days} * interval '1 day' + interval '12 hours' as instant`;
      const instant=clock!.instant;
      await tx`insert into public.walk_session(id,owner_id,local_day,timezone,created_at,stop_count)
        values(${id},${historyOwner},(${instant}::timestamptz at time zone 'UTC')::date,'UTC',${instant},0)`;
      await tx`insert into public.walk_stop(id,session_id,object_id,position,selection_reasons,selection_support,selection_inputs,rank_version)
        values(${stopId},${id},${objectId},1,'[{"code":"user_words","text":"Includes your saved words"}]','[{"id":"synthetic-history"}]','{}','contextual-v1')`;
      await tx`update public.walk_session set sealed_at=created_at,stop_count=1 where id=${id}`;
      await assert.rejects(recordWalkEvent({ownerId:historyOwner,sessionId:id,stopId,eventId:randomUUID(),kind:'shown'},store),/WALK_SESSION_EXPIRED/);checks++;
      await tx`insert into public.attention_event(id,stop_id,kind,recorded_at)values(${randomUUID()},${stopId},'shown',${instant})`;
      await tx`insert into public.attention_event(id,stop_id,kind,recorded_at)values(${eventId},${stopId},${kind},${instant})`;
      await tx`update public.walk_stop t set resolved_at=e.recorded_at,resolution=e.kind from public.attention_event e where t.id=${stopId} and e.id=${eventId}`;
      await tx`update public.walk_session set completed_at=sealed_at where id=${id}`;
    }
    for(const days of [10,11,12])await history(suppressed,days,'dismissed');
    await history(recent,1,'passed');
    const nextDay=await openWalk({ownerId:historyOwner,timezone:'UTC'},store);
    assert.equal(nextDay.stops.length,2);checks++;
    assert.equal(nextDay.stops.some(item=>item.objectId===suppressed||item.objectId===recent),false);checks++;
    assert.deepEqual(await openWalk({ownerId:historyOwner,timezone:'UTC',context:'Edited intent'},store),nextDay);checks++;
    const unsupportedOwner=randomUUID(),unsupported=await openWalk({ownerId:unsupportedOwner,timezone:'UTC'},store);
    await tx`update public.object_ref set archived_at=clock_timestamp() where id in
      (select id from public.observation where subject_id=${unsupported.stops[0]!.objectId})`;
    const unsupportedView=await readWalkViewTransaction(tx,unsupportedOwner);
    assert.equal(unsupportedView.session!.needsResume,true);assert.equal(unsupportedView.session!.stops.length,2);checks+=2;
    const withdrawnSupport=await openWalk({ownerId:unsupportedOwner,timezone:'UTC'},store);
    assert.equal(withdrawnSupport.stops[0]!.resolution,'unavailable');assert.equal(withdrawnSupport.stops.length,3);checks+=2;
    const archivedSession=await openWalk({ownerId:other,timezone:'UTC'},store);
    await tx`update public.object_ref set archived_at=clock_timestamp() where id=${archivedSession.stops[0]!.objectId}`;
    const inactiveView=await readWalkViewTransaction(tx,other);assert.equal(inactiveView.session!.stops.length,2);checks++;
    const resumed=await openWalk({ownerId:other,timezone:'UTC'},store);
    assert.equal(resumed.stops[0]!.resolution,'unavailable');assert.equal(resumed.stops.length,3);checks+=2;
    const [archiveShown]=await tx`select count(*)::int as count from public.attention_event where stop_id=${resumed.stops[0]!.id} and kind='shown'`;
    assert.equal(archiveShown!.count,0);checks++;
    await assert.rejects(recordWalkEvent({ownerId:other,sessionId:resumed.id,stopId:resumed.stops[0]!.id,eventId:randomUUID(),kind:'shown'},store),/WALK_STOP_UNAVAILABLE/);checks++;
    for(const remaining of archivedSession.stops.slice(1))await tx`update public.object_ref set archived_at=clock_timestamp() where id=${remaining.objectId}`;
    const withdrawn=await openWalk({ownerId:other,timezone:'UTC'},store);
    assert.ok(withdrawn.completedAt);assert.ok(withdrawn.stops.every(item=>item.resolution==='unavailable'));checks+=2;
    assert.equal(withdrawn.stops.length,3);checks++;
    await tx`set constraints all immediate`;checks++;
    markValidationStage("walk_migration_export_fidelity");
    await tx`set local timezone = 'UTC'`;await tx`set local datestyle = 'ISO, YMD'`;
    const catalog=await exportCatalog(tx);assert.equal(catalog.length,41);checks++;
    const sample={walk_session:session.id,walk_stop:stop.id,attention_event:dismissed};
    const manifest=await buildMemoryExport({async transaction(work){return work({
      async capturedAt(){return '2026-10-13T00:00:00.123456Z';},async catalog(){return catalog;},
      async *rows(table){const id=sample[table.name as keyof typeof sample];if(id)yield*exportRows(tx,table,{column:'id',value:id});},
    });}});
    assert.equal(manifest.version,3);assert.equal(manifest.schemaTag,'0016');checks+=2;
    function cells(name:string){const table=manifest.tables.find(t=>t.name===name)!;assert.equal(table.rows.length,1);checks++;
      return Object.fromEntries(table.columns.map((column,index)=>[column.name,table.rows[0]![index]]));}
    const exportedSession=cells('walk_session');assert.equal(exportedSession.explicit_context,context);checks++;
    const exportedStop=cells('walk_stop');assert.equal(exportedStop.resolution,'dismissed');checks++;
    assert.deepEqual(JSON.parse(exportedStop.selection_support!),session.stops[0]!.selectionSupport);checks++;
    const exportedEvent=cells('attention_event');assert.equal(exportedEvent.kind,'dismissed');checks++;
    assert.equal(exportedStop.resolved_at,exportedEvent.recorded_at);checks++;
    assert.equal(manifest.tables.some(t=>t.name==='session'||t.name==='login_throttle'),false);checks++;
    throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
  assert.deepEqual(await state(connection),before);checks++;
  return {checks,schemaMode:before.exists?'existing_schema':'rollback_ddl'};
}

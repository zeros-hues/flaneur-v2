import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { fixtureConnection,type Connection } from "./fixture-connection";
import { postgresWalkSessionStore } from "../../lib/walk/postgres-sessions";
import { openWalk } from "../../lib/walk/sessions";
import { markValidationStage } from "./validation-stage";

/** Two real connections; empty synthetic sessions are never committed. */
export async function validateWalkContention(connection:Connection){
 let checks=0;const rollback=new Error("WALK_CONTENTION_ROLLBACK"),ownerId=randomUUID(),otherId=randomUUID();
 const state=()=>connection.begin("isolation level repeatable read read only",async tx=>{
  const [row]=await tx`select (select count(*)::int from public.walk_session) as sessions,
    (select count(*)::int from public.walk_stop) as stops,(select count(*)::int from public.attention_event) as events`;
  return row;
 });
 const before=await state();
 async function rolled(work:(tx:postgres.TransactionSql)=>Promise<void>){
  try{await connection.begin("isolation level read committed",async tx=>{await work(tx);throw rollback;});}
  catch(error){if(error!==rollback)throw error;}
 }
 const store=(tx:postgres.TransactionSql)=>postgresWalkSessionStore(fixtureConnection(tx),async()=>[]);
 async function blocked(work:(tx:postgres.TransactionSql)=>Promise<unknown>){
  let code;try{await rolled(async tx=>{await work(tx);});}catch(error){code=(error as {code?:string}).code;}
  assert.equal(code,"55P03");checks++;
 }
 markValidationStage("walk_owner_contention");
 await rolled(async tx=>{
  const first=await openWalk({ownerId,timezone:"UTC"},store(tx));
  assert.ok(first.completedAt);checks++;
  await blocked(peer=>openWalk({ownerId,timezone:"UTC",context:"Competing context"},store(peer)));
  assert.deepEqual(await openWalk({ownerId,timezone:"UTC",context:"Changed context"},store(tx)),first);checks++;
  // A separate owner can proceed while the first owner's transaction is still open.
  await rolled(async peer=>{
   const distinct=await openWalk({ownerId:otherId,timezone:"UTC"},store(peer));
   assert.notEqual(distinct.id,first.id);checks++;
  });
 });
 markValidationStage("walk_graph_contention");
 await rolled(async tx=>{
  await tx`set local statement_timeout = '15s'`;
  await tx`select pg_advisory_xact_lock(1790703955,1)`;
  await blocked(peer=>openWalk({ownerId,timezone:"UTC"},store(peer)));
 });
 markValidationStage("walk_contention_release");
 await rolled(async tx=>{
  const [locks]=await tx`select pg_try_advisory_xact_lock(hashtextextended(${`flaneur:walk-owner:${ownerId}`},0)) as owner,
    pg_try_advisory_xact_lock_shared(1790703955,1) as graph`;
  assert.equal(locks!.owner,true);assert.equal(locks!.graph,true);checks+=2;
  const retry=await openWalk({ownerId,timezone:"UTC"},store(tx));assert.ok(retry.completedAt);checks++;
  await tx`set constraints all immediate`;checks++;
 });
 assert.deepEqual(await state(),before);checks++;
 return checks;
}

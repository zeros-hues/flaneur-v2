import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtureConnection,type Connection } from "./fixture-connection";
import { createUserNote } from "../../lib/notes/authoring";
import { postgresUserNoteStore } from "../../lib/notes/postgres-authoring";
import { readUserNotesTransaction,postgresUserNoteReader } from "../../lib/notes/postgres-read";
import { correctObservation } from "../../lib/review/correction";
import { postgresReviewStore } from "../../lib/review/postgres-rejection";
import { archivePerson } from "../../lib/review/person-archive";
import { postgresPersonArchiveStore } from "../../lib/review/postgres-person-archive";
import { markValidationStage } from "./validation-stage";

export async function validateNoteAuthoring(connection:Connection){
  markValidationStage("immutable_note_authoring");let checks=0;
  markValidationStage("note_authoring_readonly_wrapper");
  assert.deepEqual(await postgresUserNoteReader(connection)(randomUUID()),[]);checks++;
  const rollback=new Error("NOTE_AUTHORING_FIXTURE_ROLLBACK");
  try{await connection.begin("isolation level read committed",async sql=>{
    await sql`set local statement_timeout = '20s'`;
    const person=randomUUID(),legacy=randomUUID(),requestId=randomUUID(),body='  Exact User words 😀\n  ';
    await sql`insert into public.person(id,profile_url,name)values(${person},${`https://www.linkedin.com/in/note-authoring-${person}/`},'Note fixture')`;
    await sql`insert into public.note(id,person_id,body)values(${legacy},${person},'Retained legacy words')`;
    const target=fixtureConnection(sql),store=postgresUserNoteStore(target),request={requestId,personId:person,body};
    markValidationStage("note_authoring_create_replay");
    const first=await createUserNote(request,store),replay=await createUserNote(request,store);
    assert.equal(replay.replayed,true);assert.equal(replay.note.id,first.note.id);checks+=2;
    const [row]=await sql`select truth_layer,body_text,semantic_role from public.observation where id=${first.note.id}`;
    assert.equal(row!.truth_layer,'user');assert.equal(row!.body_text,body);assert.equal(row!.semantic_role,'note');checks+=3;
    await assert.rejects(createUserNote({...request,body:'Changed retry'},store),/NOTE_REQUEST_CONFLICT/);checks++;
    const correction=await correctObservation({requestId:randomUUID(),observationId:first.note.id,bodyText:'  Revised User words  '},postgresReviewStore(target));
    markValidationStage("note_authoring_revision_read");
    const current=(await readUserNotesTransaction(sql,person)).rows;
    assert.equal(current.length,1);assert.equal(current[0]!.id,correction.review.replacementId);assert.equal(current[0]!.body,'  Revised User words  ');checks+=3;
    const [history]=await sql`select body_text from public.observation where id=${first.note.id}`;
    assert.equal(history!.body_text,body);checks++;
    const [old]=await sql`select body from public.note where id=${legacy}`;assert.equal(old!.body,'Retained legacy words');checks++;
    const [legacyCount]=await sql`select count(*)::int as count from public.note where person_id=${person}`;
    assert.equal(legacyCount!.count,1);checks++;
    markValidationStage("note_authoring_archive_history");
    await archivePerson({requestId:randomUUID(),personId:person},postgresPersonArchiveStore(target));
    await assert.rejects(createUserNote({...request,requestId:randomUUID()},store),/NOTE_PERSON_UNAVAILABLE/);checks++;
    assert.equal((await createUserNote(request,store)).replayed,true);checks++;
    assert.equal((await readUserNotesTransaction(sql,person)).rows[0]!.body,'  Revised User words  ');checks++;
    throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
  return checks;
}

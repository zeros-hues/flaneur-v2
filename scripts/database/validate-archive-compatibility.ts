import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql as query,eq,and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../db/schema";
import { fixtureConnection,type Connection } from "./fixture-connection";
import { activePerson,activeArtifact,activeConceptPair } from "../../lib/memory/eligibility";
import { legacyNoteStore } from "../../lib/notes/store";
import { archivePerson } from "../../lib/review/person-archive";
import { postgresPersonArchiveStore } from "../../lib/review/postgres-person-archive";
import { markValidationStage } from "./validation-stage";
import { issueSession } from "../../lib/session/service";
import { postgresSessionStore } from "../../lib/session/postgres";
import { validateSessionModes } from "./validate-session";

export async function validateArchiveCompatibility(connection:Connection) {
  markValidationStage("archive_compatibility");let checks=0;
  const rollback=new Error("ARCHIVE_COMPATIBILITY_FIXTURE_ROLLBACK");
  checks+=(await validateSessionModes(connection)).checks;
  try{
    await connection.begin("isolation level read committed",async sql=>{
      await sql`set local statement_timeout = '20s'`;
      const person=randomUUID(),other=randomUUID(),owned=randomUUID(),independent=randomUUID(),a=randomUUID(),b=randomUUID();
      for(const id of [person,other])await sql`insert into public.person(id,profile_url,name)
        values(${id},${`https://www.linkedin.com/in/archive-compatibility-${id}/`},'Archive compatibility fixture')`;
      await sql`insert into public.artifact(id,type,person_id,source_url,body_text)
        values(${owned},'post',${person},'https://example.test/owned','Stored source words'),
          (${independent},'article',null,'https://example.test/independent','Independent work')`;
      for(const id of [a,b])await sql`insert into public.concept(id,label,kind)values(${id},${`Fixture ${id}`},'concept')`;
      for(const id of [a,b])await sql`insert into public.concept_link(concept_id,artifact_id,source)values(${id},${owned},'inferred')`;
      const target=fixtureConnection(sql);
      // Drizzle's test construction must not mutate the direct driver's codecs, just as app pools are isolated.
      const options={...connection.options,parsers:{...connection.options.parsers},serializers:{...connection.options.serializers}};
      const adapter=new Proxy(target,{get(client,key){return key==="options"?options:Reflect.get(client,key);}});
      const db=drizzle(adapter,{schema}),notes=legacyNoteStore(db);
      const session=await issueSession({principalId:randomUUID(),permission:"write"},postgresSessionStore(target));
      assert.ok(Number.isFinite(Date.parse(session.expiresAt)));checks++;
      markValidationStage("archive_compatibility_note_create");
      const created=await notes.create(person,'  Stored User words  ');assert.ok(created);checks++;
      markValidationStage("archive_compatibility_note_update");
      assert.equal((await notes.update(created!.id,'  Revised User words  '))!.body,'  Revised User words  ');checks++;
      const readPeople=()=>db.select({id:schema.person.id}).from(schema.person)
        .where(and(eq(schema.person.id,person),activePerson(schema.person.id)));
      const readArtifacts=()=>db.select({id:schema.artifact.id}).from(schema.artifact)
        .where(and(eq(schema.artifact.id,owned),activeArtifact(schema.artifact.id,schema.artifact.personId)));
      const pair=async()=>{
        const [row]=await db.execute<{eligible:boolean}>(query`select ${activeConceptPair(query`${a}::uuid`,query`${b}::uuid`)} as eligible`);
        return row!.eligible;
      };
      markValidationStage("archive_compatibility_active_reads");
      assert.equal((await readPeople()).length,1);assert.equal((await readArtifacts()).length,1);assert.equal(await pair(),true);checks+=3;
      markValidationStage("archive_compatibility_archive");
      const archiveRequest={requestId:randomUUID(),personId:person},archiveStore=postgresPersonArchiveStore(target);
      const archived=await archivePerson(archiveRequest,archiveStore),replay=await archivePerson(archiveRequest,archiveStore);
      assert.equal(replay.replayed,true);assert.equal(replay.archivedAt,archived.archivedAt);checks+=2;
      markValidationStage("archive_compatibility_archived_reads");
      assert.equal((await readPeople()).length,0);assert.equal((await readArtifacts()).length,0);assert.equal(await pair(),false);checks+=3;
      assert.equal(await notes.create(person,'Do not add'),null);assert.equal(await notes.update(created!.id,'Do not overwrite'),null);checks+=2;
      const [retained]=await sql`select body from public.note where id=${created!.id}`;
      assert.equal(retained!.body,'  Revised User words  ');checks++;
      const [history]=await sql`select body_text from public.artifact where id=${owned}`;
      assert.equal(history!.body_text,'Stored source words');checks++;
      const independentRows=await db.select({id:schema.artifact.id}).from(schema.artifact)
        .where(and(eq(schema.artifact.id,independent),activeArtifact(schema.artifact.id,schema.artifact.personId)));
      assert.equal(independentRows.length,1);checks++;
      for(const id of [a,b])await sql`insert into public.concept_link(concept_id,artifact_id,source)values(${id},${independent},'inferred')`;
      assert.equal(await pair(),true);checks++;
      await sql`update public.object_ref set archived_at=now() where id=${independent}`;
      assert.equal(await pair(),false);checks++;
      assert.ok(await notes.create(other,'Other Person remains active'));checks++;
      assert.equal(await notes.create(randomUUID(),'Missing Person'),null);checks++;
      const former=randomUUID(),decision=randomUUID();
      await sql`insert into public.person(id,profile_url,name)values(${former},${`https://www.linkedin.com/in/alias-fixture-${former}/`},'Former identity fixture')`;
      await sql`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status)
        values(${decision},${other},'user','fact','Synthetic explicit alias decision','verified')`;
      await sql`insert into public.object_alias(former_object_id,canonical_object_id,decision_observation_id)values(${former},${other},${decision})`;
      const [alias]=await db.execute<{eligible:boolean}>(query`select ${activePerson(query`${former}::uuid`)} as eligible`);
      assert.equal(alias!.eligible,false);assert.equal(await notes.create(former,'Former identity'),null);checks+=2;
      throw rollback;
    });
  }catch(error){if(error!==rollback)throw error;}
  return checks;
}

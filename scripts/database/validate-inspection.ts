import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { Connection } from "./fixture-connection";
import { inspectPersonTransaction, postgresInspectionReader } from "../../lib/review/postgres-inspection";
import { markValidationStage } from "./validation-stage";

export async function validateInspection(connection: Connection) {
  markValidationStage("observation_inspection"); let checks = 0;
  const rollback = new Error("INSPECTION_FIXTURE_ROLLBACK");
  assert.equal(await postgresInspectionReader(connection)(randomUUID()),null); checks++;
  try {
    await connection.begin("isolation level read committed", async sql => {
      await sql`set local statement_timeout = '20s'`;
      const person = randomUUID(), other = randomUUID(), snapshot = randomUUID(), representation = randomUUID(), evidence = randomUUID();
      const observed = randomUUID(), root = randomUUID(), child = randomUUID(), user = randomUUID(), text = "a😀z";
      for (const id of [person, other]) await sql`insert into public.person (id,profile_url,name)
        values (${id}, ${`https://www.linkedin.com/in/inspection-${id}/`}, 'Inspection fixture')`;
      await sql`insert into public.snapshot (id,capture_type,source_url,content_gzip,parser_version)
        values (${snapshot},'profile','https://example.test/inspection',${gzipSync(text)},'fixture')`;
      await sql`insert into public.snapshot_representation (id,snapshot_id,normalizer_version,text,text_hash)
        values (${representation},${snapshot},'inspection-fixture',${text},${createHash('sha256').update(text).digest('hex')})`;
      await sql`insert into public.observation (id,subject_id,truth_layer,semantic_role,body_text,support_status)
        values (${observed},${person},'source','fact','  Exact source words  ','verified'),
          (${root},${other},'inferred','summary','Other subject root','partial'),
          (${child},${person},'inferred','summary','Dependent words','partial'),
          (${user},${person},'user','note','User words survive','verified')`;
      await sql`insert into public.observation_evidence (id,observation_id,snapshot_id,excerpt,support_role,evidence_version)
        values (${evidence},${observed},${snapshot},'😀','supports','fixture')`;
      await sql`insert into public.text_evidence (evidence_id,representation_id,start_codepoint,end_codepoint,quote)
        values (${evidence},${representation},1,2,'😀')`;
      for (const observation of [child,user]) await sql`insert into public.observation_evidence
        (observation_id,supporting_observation_id,support_role,evidence_version) values (${observation},${root},'supports','fixture')`;
      await sql`update public.object_ref set archived_at = now() where id = ${root}`;
      const read = async (id: string, cursor?: string) => (await inspectPersonTransaction(sql,id,cursor)).page;
      const page = await read(person);
      assert.equal(page!.observations.length,3); checks++;
      const source = page!.observations.find(row => row.id === observed)!;
      assert.equal(source.bodyText,'  Exact source words  '); assert.equal(source.evidence[0]!.quoteVerified,true); checks += 2;
      assert.equal('text' in source.evidence[0]!,false); checks++;
      assert.equal(page!.observations.find(row => row.id === child)!.active,false); checks++;
      assert.equal(page!.observations.find(row => row.id === user)!.active,true); checks++;
      assert.equal(await read(randomUUID()),null); checks++;
      for (let i=0;i<20;i++) await sql`insert into public.observation (id,subject_id,truth_layer,semantic_role,body_text,support_status)
        values (${randomUUID()},${person},'source','fact','Pagination fixture','partial')`;
      const first = (await read(person))!, second = (await read(person,first.nextCursor!))!;
      assert.equal(first.observations.length,20); assert.equal(second.observations.length,3); checks += 2;
      assert.equal(new Set([...first.observations,...second.observations].map(row=>row.id)).size,23); checks++;
      assert.equal(second.nextCursor,null); checks++;
      await sql`update public.object_ref set archived_at = now() where id = ${person}`;
      const archived = (await read(person))!;
      assert.equal(archived.archived,true); assert.equal(archived.observations.every(row=>!row.active),true); checks += 2;
      throw rollback;
    });
  } catch(error) { if(error!==rollback) throw error; }
  return checks;
}

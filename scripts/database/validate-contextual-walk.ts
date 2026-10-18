import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../db/schema";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { contextualCandidatesTransaction, postgresContextualCandidates } from "../../lib/walk/postgres-contextual";
import { composeContextualWalk } from "../../lib/walk/contextual";
import { legacyWalkAnswer } from "../../lib/walk/legacy-actions";
import { createUserNote } from "../../lib/notes/authoring";
import { postgresUserNoteStore } from "../../lib/notes/postgres-authoring";
import { correctObservation } from "../../lib/review/correction";
import { postgresReviewStore } from "../../lib/review/postgres-rejection";
import { archivePerson } from "../../lib/review/person-archive";
import { postgresPersonArchiveStore } from "../../lib/review/postgres-person-archive";
import { markValidationStage } from "./validation-stage";

export async function validateContextualWalk(connection: Connection) {
  markValidationStage("contextual_walk"); let checks = 0;
  const readonly = await postgresContextualCandidates(connection)();
  assert.ok(Array.isArray(readonly.candidates)); checks++;
  const rollback = new Error("CONTEXTUAL_WALK_FIXTURE_ROLLBACK");
  try { await connection.begin("isolation level read committed", async tx => {
    await tx`set local statement_timeout = '20s'`;
    const person = randomUUID(), request = randomUUID(), artifact = randomUUID(), independent = randomUUID();
    await tx`insert into public.person(id,profile_url,name,first_captured_at)
      values(${person},${`https://www.linkedin.com/in/walk-${person}/`},'Profile-only Walk fixture','2025-01-01T00:00:00Z')`;
    const target = fixtureConnection(tx);
    const note = await createUserNote({ requestId: request, personId: person, body: '  Exact computational robotics User words  ' }, postgresUserNoteStore(target));
    const read = async () => (await contextualCandidatesTransaction(tx)).filter(item => item.id === person || item.id === artifact || item.id === independent);
    const first = await read(); assert.equal(first.length, 1); checks++;
    assert.equal(first[0]!.kind, 'person'); checks++;
    assert.equal(first[0]!.evidence[0]!.text, '  Exact computational robotics User words  '); checks++;
    const stops = composeContextualWalk(first, { referenceInstant: '2026-10-13T00:00:00Z' });
    assert.equal(stops[0]!.id, person); assert.ok(stops[0]!.reasons.some(reason => reason.code === 'user_words')); checks += 2;
    await correctObservation({ requestId: randomUUID(), observationId: note.note.id, bodyText: 'Revised exact words' }, postgresReviewStore(target));
    const revised = await read(); assert.ok(revised[0]!.evidence.some(item => item.text === 'Revised exact words')); checks++;
    assert.equal(revised[0]!.evidence.some(item => item.text.includes('computational robotics')), false); checks++;
    await tx`insert into public.artifact(id,type,person_id,source_url,status)values(${artifact},'connection_request',${person},'https://example.test/walk-contact','pending')`;
    await tx`insert into public.artifact(id,type,source_url,body_text)values(${independent},'article','https://example.test/independent','Original independent source')`;
    const options = { ...connection.options, parsers: { ...connection.options.parsers }, serializers: { ...connection.options.serializers } };
    const adapter = new Proxy(target, { get(client, key) { return key === 'options' ? options : Reflect.get(client, key); } });
    const db = drizzle(adapter, { schema });
    assert.equal(await legacyWalkAnswer(db, artifact, 'say_hello'), true); checks++;
    const [contact] = await tx`select status from public.artifact where id=${artifact}`;
    assert.equal(contact!.status, 'pending'); checks++;
    await archivePerson({ requestId: randomUUID(), personId: person }, postgresPersonArchiveStore(target));
    const archived = await read(); assert.equal(archived.some(item => item.id === person), false); checks++;
    assert.ok(archived.some(item => item.id === independent)); checks++;
    assert.equal(await legacyWalkAnswer(db, artifact, 'say_hello'), false); checks++;
    const [retained] = await tx`select body_text from public.observation where id=${note.note.id}`;
    assert.equal(retained!.body_text, '  Exact computational robotics User words  '); checks++;
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
  return checks;
}

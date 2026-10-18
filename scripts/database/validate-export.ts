import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";
import { exportCatalog, exportRows, postgresExportSource } from "../../lib/export/postgres-v2";

export async function validateExport(connection: Connection) {
  markValidationStage("memory_export");
  const rollback = new Error("EXPORT_FIXTURE_ROLLBACK"); let checks = 0;
  const metadata = await postgresExportSource(connection).transaction(async (tx) =>
    ({ capturedAt: await tx.capturedAt(), catalog: await tx.catalog() }));
  assert.ok([38,41].includes(metadata.catalog.length)); assert.ok(Number.isFinite(Date.parse(metadata.capturedAt))); checks += 2;
  try {
    await connection.begin("isolation level read committed", async (sql) => {
      const person = randomUUID(), snapshot = randomUUID(), note = randomUUID(), observation = randomUUID();
      const bytes = Buffer.from([0, 255, 1, 128, 13, 10]), text = '  Exact User words 😀\n  ';
      await sql`set local timezone = 'UTC'`; await sql`set local datestyle = 'ISO, YMD'`; await sql`set local bytea_output = 'hex'`;
      await sql`insert into public.person (id, profile_url, name)
        values (${person}, ${`https://www.linkedin.com/in/export-fixture-${person}/`}, 'Export fixture')`;
      await sql`insert into public.snapshot (id, capture_type, source_url, content_gzip, parser_version)
        values (${snapshot}, 'profile', 'https://www.linkedin.com/in/export-fixture/', ${bytes}, 'fixture')`;
      await sql`insert into public.note (id, person_id, body, created_at) values (${note}, ${person}, ${text}, '2026-10-12T00:00:00.123456Z')`;
      await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, structured_value, support_status)
        values (${observation}, ${person}, 'user', 'note', ${text},
          '{"large":900719925474099312345,"nested":[null,"😀"]}'::jsonb, 'verified')`;
      await sql`update public.object_ref set archived_at = now() where id = ${person}`;
      const tables = await exportCatalog(sql);
      async function row(tableName: string, id: string) {
        const table = tables.find((t) => t.name === tableName)!;
        const rows: (string | null)[][] = [];
        for await (const value of exportRows(sql, table, { column: 'id', value: id })) rows.push(value);
        assert.equal(rows.length, 1); checks++;
        return Object.fromEntries(table.columns.map((column, i) => [column.name, rows[0]![i]]));
      }
      const exportedSnapshot = await row('snapshot', snapshot);
      assert.equal(exportedSnapshot.content_gzip, `\\x${bytes.toString('hex')}`); checks++;
      const exportedNote = await row('note', note);
      assert.equal(exportedNote.body, text); assert.equal(exportedNote.created_at, '2026-10-12 00:00:00.123456+00'); checks += 2;
      const exportedObservation = await row('observation', observation);
      assert.equal(exportedObservation.body_text, text); assert.equal(exportedObservation.truth_layer, 'user'); checks += 2;
      assert.ok(exportedObservation.structured_value!.includes('900719925474099312345')); checks++;
      const exportedReference = await row('object_ref', person);
      assert.ok(exportedReference.archived_at); checks++;
      await sql`set constraints all immediate`; throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  return checks;
}

import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/export/v2.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { buildMemoryExport, EXPORT_TABLES, EXPORT_WALK_CATALOG } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const catalog = () => EXPORT_TABLES.map((name) => ({ name, columns: [{ name: "id", type: "uuid", nullable: false },
  { name: "value", type: "text", nullable: true }], primaryKey: ["id"] }));
function source(tables = catalog(), rows = {}) {
  return { async transaction(work) { return work({ async capturedAt() { return "2026-10-12T00:00:00.123456Z"; },
    async catalog() { return tables; }, async *rows(table) { yield* rows[table.name] ?? []; } }); } };
}
test("export retains every declared table and exact textual cells through JSON serialization", async () => {
  const cells = ["\\x00ff", "900719925474099312345", "2026-10-12 00:00:00.123456+00", "  Words 😀\n  ", '{"big":900719925474099312345}', null];
  const result = await buildMemoryExport(source(catalog(), { snapshot: cells.map((cell, i) => [String(i), cell]) }));
  assert.equal(result.version, 2); assert.equal(result.tables.length, 38);
  assert.deepEqual(JSON.parse(JSON.stringify(result)).tables.find((t) => t.name === "snapshot").rows.map((r) => r[1]), cells);
});
test("missing, duplicate and unreviewed tables fail before reading records", async () => {
  for (const tables of [catalog().slice(1), [...catalog(), catalog()[0]], [...catalog().slice(1), { ...catalog()[0], name: "credentials" }]])
    await assert.rejects(buildMemoryExport(source(tables)), /SCHEMA_UNREVIEWED/);
});
test("invalid columns, keys and credential columns are rejected", async () => {
  for (const change of [
    (t) => { t[0].columns.push(t[0].columns[0]); }, (t) => { t[0].primaryKey = ["missing"]; },
    (t) => { t[0].columns.push({ name: "api_key", type: "text", nullable: true }); },
  ]) { const tables = catalog(); change(tables); await assert.rejects(buildMemoryExport(source(tables))); }
});
test("duplicate keys, NULL keys and non-text cells fail instead of corrupting records", async () => {
  for (const rows of [[["same", "a"], ["same", "b"]], [[null, "a"]], [["id", 9007199254740992]], [["id"]]])
    await assert.rejects(buildMemoryExport(source(catalog(), { person: rows })));
});
test("export limits fail explicitly and never return partial output", async () => {
  const data = source(catalog(), { note: [["one", "words"], ["two", "more"]] });
  await assert.rejects(buildMemoryExport(data, { maxRows: 1 }), /SIZE_LIMIT/);
  await assert.rejects(buildMemoryExport(data, { maxBytes: 100 }), /SIZE_LIMIT/);
  await assert.rejects(buildMemoryExport(data, { maxRows: 0 }));
});
test("source failures propagate without substituting incomplete tables", async () => {
  const data = source(); data.transaction = async () => { throw new Error("source failed"); };
  await assert.rejects(buildMemoryExport(data), /source failed/);
});
test("the complete Walk catalog selects v3 and retains immutable session/event history",async()=>{
 const tables=[...catalog(),...structuredClone(EXPORT_WALK_CATALOG)];
 const rows={walk_session:[["session","owner","2026-10-13","UTC","  Exact context 😀  ","2026-10-13 00:00:00.123456+00",null,null,"0"]]};
 const result=await buildMemoryExport(source(tables,rows));
 assert.equal(result.version,3);assert.equal(result.schemaTag,"0016");assert.equal(result.tables.length,41);
 assert.deepEqual(result.tables.find(t=>t.name==="walk_session").rows,rows.walk_session);
});
test("partial Walk families and unreviewed Walk column changes fail before data export",async()=>{
 for(const extra of [[EXPORT_WALK_CATALOG[0]],EXPORT_WALK_CATALOG.slice(0,2)])await assert.rejects(buildMemoryExport(source([...catalog(),...extra])),/SCHEMA_UNREVIEWED/);
 for(const change of [t=>t.columns.pop(),t=>t.columns.push({name:"extra",type:"text",nullable:true}),t=>t.columns[0].type="text",t=>t.columns[0].nullable=true,t=>t.primaryKey=["stop_id"]]){
  const tables=[...catalog(),...structuredClone(EXPORT_WALK_CATALOG)];change(tables.at(-1));await assert.rejects(buildMemoryExport(source(tables)),/SCHEMA_UNREVIEWED/);
 }
});
test('source-neutral people preserve NULL profile URLs with schema tag 0017 and the existing v3 encoding',async()=>{
 const tables=[...catalog(),...structuredClone(EXPORT_WALK_CATALOG)],person=tables.find(t=>t.name==='person');
 person.columns[1]={name:'profile_url',type:'text',nullable:true};
 const result=await buildMemoryExport(source(tables,{person:[['fixture',null],['other',null]]}));
 assert.equal(result.version,3);assert.equal(result.schemaTag,'0017');assert.deepEqual(result.tables.find(t=>t.name==='person').rows,[['fixture',null],['other',null]]);
 await assert.rejects(buildMemoryExport(source(tables.filter(t=>!EXPORT_WALK_CATALOG.some(w=>w.name===t.name)))),/SCHEMA_UNREVIEWED/);
});

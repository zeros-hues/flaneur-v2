import { z } from "zod";

export const EXPORT_TABLES = ["artifact", "capture_request", "concept", "concept_edge", "concept_link", "education",
  "education_observation", "encounter", "encounter_object", "headline_history", "migration_receipt", "note", "object_alias",
  "object_ref", "observation", "observation_derivation", "observation_evidence", "observation_review", "organisation",
  "parser_health", "person", "processing_head", "processing_job", "processing_run", "quarantine", "relationship",
  "relationship_support", "role", "role_observation", "saved_query", "schedule", "section_coverage", "skill",
  "skill_observation", "snapshot", "snapshot_representation", "source_identity", "text_evidence"] as const;
const identifier = z.string().regex(/^[a-z][a-z0-9_]*$/);
const column = z.object({ name: identifier, type: z.string().min(1), nullable: z.boolean() }).strict();
const tableSchema = z.object({ name: identifier, columns: z.array(column).min(1), primaryKey: z.array(identifier).min(1) }).strict();
export type ExportTable = z.infer<typeof tableSchema>;
export const EXPORT_WALK_CATALOG: ExportTable[] = [
  {name:"walk_session",primaryKey:["id"],columns:[
    ["id","uuid",false],["owner_id","uuid",false],["local_day","date",false],["timezone","text",false],
    ["explicit_context","text",true],["created_at","timestamp with time zone",false],["sealed_at","timestamp with time zone",true],
    ["completed_at","timestamp with time zone",true],["stop_count","smallint",false],
  ].map(([name,type,nullable])=>({name:name as string,type:type as string,nullable:nullable as boolean}))},
  {name:"walk_stop",primaryKey:["id"],columns:[
    ["id","uuid",false],["session_id","uuid",false],["object_id","uuid",false],["position","smallint",false],
    ["selection_reasons","jsonb",false],["selection_support","jsonb",false],["selection_inputs","jsonb",false],
    ["rank_version","text",false],["resolved_at","timestamp with time zone",true],["resolution","text",true],
  ].map(([name,type,nullable])=>({name:name as string,type:type as string,nullable:nullable as boolean}))},
  {name:"attention_event",primaryKey:["id"],columns:[
    ["id","uuid",false],["stop_id","uuid",false],["kind","text",false],["recorded_at","timestamp with time zone",false],
  ].map(([name,type,nullable])=>({name:name as string,type:type as string,nullable:nullable as boolean}))},
];
export interface ExportTransaction {
  capturedAt(): Promise<string>;
  catalog(): Promise<ExportTable[]>;
  rows(table: ExportTable): AsyncIterable<(string | null)[]>;
}
export interface ExportSource {
  /** One checked repeatable-read read-only snapshot includes archived and historical rows. */
  transaction<T>(work: (tx: ExportTransaction) => Promise<T>): Promise<T>;
}

export function validateExportCatalog(raw: unknown): ExportTable[] {
  const tables = z.array(tableSchema).parse(raw);
  const expected: string[] = tables.length === EXPORT_TABLES.length ? [...EXPORT_TABLES] :
    [...EXPORT_TABLES,...EXPORT_WALK_CATALOG.map(t=>t.name)];
  if (tables.length !== expected.length || new Set(tables.map((t) => t.name)).size !== tables.length ||
      expected.some((name) => !tables.some((t) => t.name === name))) throw new Error("EXPORT_SCHEMA_UNREVIEWED");
  for (const table of tables) {
    const names = table.columns.map((c) => c.name);
    if (new Set(names).size !== names.length || new Set(table.primaryKey).size !== table.primaryKey.length ||
        table.primaryKey.some((name) => !names.includes(name))) throw new Error("EXPORT_SCHEMA_INVALID");
    if (names.some((name) => /password|credential|secret|api_key|access_token|refresh_token/.test(name)))
      throw new Error("EXPORT_CREDENTIAL_COLUMN");
    const walk = EXPORT_WALK_CATALOG.find(t=>t.name===table.name);
    if (walk && (JSON.stringify(table.primaryKey)!==JSON.stringify(walk.primaryKey) ||
      table.columns.length!==walk.columns.length || walk.columns.some(expected=>!table.columns.some(actual=>
        actual.name===expected.name&&actual.type===expected.type&&actual.nullable===expected.nullable))))
      throw new Error("EXPORT_SCHEMA_UNREVIEWED");
  }
  return tables.sort((a, b) => a.name.localeCompare(b.name));
}

/** PostgreSQL textual cells preserve bytea, numeric precision, UTC microseconds, arrays and JSON without JS coercion. */
export async function buildMemoryExport(source: ExportSource, rawLimits: unknown = {}) {
  const limits = z.object({ maxRows: z.number().int().min(1).max(100000).default(100000),
    maxBytes: z.number().int().min(1).max(64 * 1024 * 1024).default(64 * 1024 * 1024) }).strict().parse(rawLimits);
  return source.transaction(async (tx) => {
    const capturedAt = z.iso.datetime().parse(await tx.capturedAt());
    const tables = validateExportCatalog(await tx.catalog());
    const withWalk = tables.length === EXPORT_TABLES.length + EXPORT_WALK_CATALOG.length;
    const sourceNeutral=tables.find(table=>table.name==='person')?.columns.some(column=>column.name==='profile_url'&&column.nullable)===true;
    if(sourceNeutral&&!withWalk)throw new Error('EXPORT_SCHEMA_UNREVIEWED');
    const result = { format: "flaneur-memory", version: withWalk ? 3 : 2, schemaTag: sourceNeutral ? "0017" : withWalk ? "0016" : "0013", capturedAt,
      encoding: "postgresql-text-cells", settings: { timezone: "UTC", dateStyle: "ISO, YMD",
        intervalStyle: "iso_8601", byteaOutput: "hex", extraFloatDigits: 3 },
      tables: [] as (ExportTable & { rows: (string | null)[][] })[] };
    let count = 0, bytes = Buffer.byteLength(JSON.stringify(result));
    for (const table of tables) {
      const output = { ...table, rows: [] as (string | null)[][] }, keys = new Set<string>();
      bytes += Buffer.byteLength(JSON.stringify(output)) + 1;
      if (bytes > limits.maxBytes) throw new Error("EXPORT_SIZE_LIMIT");
      for await (const row of tx.rows(table)) {
        if (row.length !== table.columns.length || row.some((cell, index) =>
          (cell !== null && typeof cell !== "string") || (cell === null && !table.columns[index]!.nullable)))
          throw new Error("EXPORT_ROW_INVALID");
        const keyCells = table.primaryKey.map((key) => row[table.columns.findIndex((c) => c.name === key)]);
        if (keyCells.some((cell) => cell === null)) throw new Error("EXPORT_KEY_INVALID");
        const key = JSON.stringify(keyCells);
        if (keys.has(key)) throw new Error("EXPORT_DUPLICATE_KEY");
        keys.add(key);
        bytes += Buffer.byteLength(JSON.stringify(row)) + 1;
        if (++count > limits.maxRows || bytes > limits.maxBytes) throw new Error("EXPORT_SIZE_LIMIT");
        output.rows.push([...row]);
      }
      result.tables.push(output);
    }
    if (Buffer.byteLength(JSON.stringify(result)) > limits.maxBytes) throw new Error("EXPORT_SIZE_LIMIT");
    return result;
  });
}

import type postgres from "postgres";
import { validateExportCatalog, type ExportTable, type ExportSource } from "./v2";
interface CatalogRow { name: string; column: string; type: string; nullable: boolean; position: number; key_position: number | null }
type CatalogTable = ExportTable & { keys: { name: string; position: number }[] };

export async function exportCatalog(sql: postgres.TransactionSql) {
  const tables = await sql<CatalogRow[]>`select c.relname as name, a.attname as "column", format_type(a.atttypid,a.atttypmod) as type,
    not a.attnotnull as nullable, a.attnum as position,
    array_position(i.indkey::smallint[], a.attnum) as key_position
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      left join pg_index i on i.indrelid = c.oid and i.indisprimary
    where n.nspname = 'public' and c.relkind in ('r','p') order by c.relname, a.attnum`;
  const grouped = new Map<string, CatalogTable>();
  for (const row of tables) {
    const table: CatalogTable = grouped.get(row.name) ?? { name: row.name, columns: [], primaryKey: [], keys: [] };
    table.columns.push({ name: row.column, type: row.type, nullable: row.nullable });
    if (row.key_position !== null) table.keys.push({ name: row.column, position: row.key_position });
    grouped.set(row.name, table);
  }
  return validateExportCatalog([...grouped.values()].map(({ keys, ...table }) =>
    ({ ...table, primaryKey: keys.sort((a, b) => a.position - b.position).map((key) => key.name) })));
}

/** Optional key restriction is for synthetic SQL validation, never used by the complete export source. */
export async function* exportRows(sql: postgres.TransactionSql, table: ExportTable, key?: { column: string; value: string }) {
  const names = [table.name, ...table.columns.map((c) => c.name), ...table.primaryKey, ...(key ? [key.column] : [])];
  if (names.some((name) => !/^[a-z][a-z0-9_]*$/.test(name)) || !table.primaryKey.length ||
      (key && !table.primaryKey.includes(key.column))) throw new Error("EXPORT_IDENTIFIER_INVALID");
  const query = `select json_build_array(${table.columns.map((c) => `"${c.name}"::text`).join(',')})::text as row
    from public."${table.name}"${key ? ` where "${key.column}"::text = $1` : ''}
    order by ${table.primaryKey.map((name) => `"${name}"`).join(',')}`;
  for await (const batch of sql.unsafe(query, key ? [key.value] : []).cursor(100)) {
    for (const row of batch) yield JSON.parse(row.row) as (string | null)[];
  }
}

/** Prepared only; no environment loading, file writing or live route imports. */
export function postgresExportSource(connection: ReturnType<typeof postgres>): ExportSource {
  return { async transaction(work) {
    const output = await connection.begin("isolation level repeatable read read only", async (sql) => {
      await sql`set local statement_timeout = '20s'`;
      await sql`set local timezone = 'UTC'`;
      await sql`set local datestyle = 'ISO, YMD'`;
      await sql`set local intervalstyle = 'iso_8601'`;
      await sql`set local bytea_output = 'hex'`;
      await sql`set local extra_float_digits = 3`;
      const [guard] = await sql`select current_setting('transaction_read_only') as read_only`;
      if (guard?.read_only !== 'on') throw new Error("EXPORT_NOT_READ_ONLY");
      return { result: await work({
        async capturedAt() {
          const [row] = await sql`select to_char(transaction_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as time`;
          return row!.time;
        },
        catalog: () => exportCatalog(sql), rows: (table) => exportRows(sql, table),
      }) };
    });
    return output.result;
  } };
}

import type postgres from "postgres";
export type Connection = ReturnType<typeof postgres>;

/** Nested adapters use savepoints inside an enclosing rollback-only SQL fixture. */
export function fixtureConnection(sql: postgres.TransactionSql): Connection {
  return new Proxy(sql, { get(target, property) {
    if (property === "begin") return (options: string | ((tx: postgres.TransactionSql) => Promise<unknown>),
      work?: (tx: postgres.TransactionSql) => Promise<unknown>) => sql.savepoint(typeof options === "function" ? options : work!);
    return Reflect.get(target, property);
  } }) as unknown as Connection;
}

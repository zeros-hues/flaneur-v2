/** postgres-js yields Dates by default; Drizzle configures the shared pool to yield timestamp strings. */
export function databaseTimestamp(value:unknown):Date {
  if(!(value instanceof Date) && (typeof value!=="string" || !/(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value)))
    throw new Error("DATABASE_TIMESTAMP_INVALID");
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error("DATABASE_TIMESTAMP_INVALID");
  return date;
}

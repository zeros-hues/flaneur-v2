import {
  customType,
  index,
  timestamp,
  vector,
  type ExtraConfigColumn,
} from "drizzle-orm/pg-core";

/** Dimension of every embedding column. */
export const EMBEDDING_DIMENSIONS = 384;

export const embedding = (name: string) => vector(name, { dimensions: EMBEDDING_DIMENSIONS });

/** timestamptz */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Drizzle has no built-in bytea column. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** ivfflat index using cosine distance, shared by all vector columns. */
export const ivfflatCosine = (name: string, column: ExtraConfigColumn) =>
  index(name).using("ivfflat", column.op("vector_cosine_ops")).with({ lists: 100 });

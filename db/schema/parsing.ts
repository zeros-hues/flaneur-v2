import { boolean, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { snapshot } from "./artifacts";
import { timestamptz } from "./columns";

// Parses that failed validation. Nothing here ever reaches the graph.
export const quarantine = pgTable(
  "quarantine",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => snapshot.id, { onDelete: "cascade" }),
    adapterId: text("adapter_id").notNull(),
    parserVersion: text("parser_version").notNull(),
    reason: text("reason").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("quarantine_snapshot_id_idx").on(t.snapshotId)],
);

// One row per adapter. While suspect is true for the current parser version, nothing is written.
export const parserHealth = pgTable("parser_health", {
  adapterId: text("adapter_id").primaryKey(),
  parserVersion: text("parser_version").notNull(),
  suspect: boolean("suspect").notNull().default(false),
  reason: text("reason"),
  missingCanaries: text("missing_canaries").array().notNull().default([]),
  snapshotId: uuid("snapshot_id").references(() => snapshot.id, { onDelete: "set null" }),
  since: timestamptz("since").notNull().defaultNow(),
});

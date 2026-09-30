import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./columns";

// A query the user chose to keep. routed_json is stored so re-runs skip routing and stay stable.
export const savedQuery = pgTable("saved_query", {
  id: uuid("id").primaryKey().defaultRandom(),
  text: text("text").notNull(),
  routedJson: jsonb("routed_json").notNull(),
  lastRunAt: timestamptz("last_run_at"),
  lastResultPersonIds: uuid("last_result_person_ids").array(),
});

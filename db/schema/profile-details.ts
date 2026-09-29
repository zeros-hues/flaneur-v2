import { date, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./columns";
import { datePrecision } from "./enums";
import { person } from "./people";

// Every distinct headline a person has shown, in the order we observed them.
export const headlineHistory = pgTable(
  "headline_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    headline: text("headline").notNull(),
    observedAt: timestamptz("observed_at").notNull(),
  },
  (t) => [index("headline_history_person_id_idx").on(t.personId, t.observedAt)],
);

export const education = pgTable(
  "education",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    school: text("school").notNull(),
    schoolSlug: text("school_slug"),
    degree: text("degree"),
    fieldOfStudy: text("field_of_study"),
    startDate: date("start_date", { mode: "string" }),
    startPrecision: datePrecision("start_precision").notNull().default("absent"),
    endDate: date("end_date", { mode: "string" }),
    endPrecision: datePrecision("end_precision").notNull().default("absent"),
    sortIndex: integer("sort_index").notNull(),
  },
  (t) => [index("education_person_id_idx").on(t.personId)],
);

// The unique index leads with person_id, so it also serves as the FK index.
export const skill = pgTable(
  "skill",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("skill_person_id_name_idx").on(t.personId, t.name)],
);

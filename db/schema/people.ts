import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { embedding, ivfflatCosine, timestamptz } from "./columns";
import { datePrecision, profileSection, roleMode } from "./enums";

export const organisation = pgTable(
  "organisation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
  },
  (t) => [uniqueIndex("organisation_slug_idx").on(t.slug)],
);

export const person = pgTable(
  "person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileUrl: text("profile_url").notNull(),
    name: text("name").notNull(),
    headline: text("headline"),
    about: text("about"),
    location: text("location"),
    photoUrl: text("photo_url"),
    aboutEmbedding: embedding("about_embedding"),
    profileEmbedding: embedding("profile_embedding"),
    firstCapturedAt: timestamptz("first_captured_at").notNull().defaultNow(),
    lastProfileSyncAt: timestamptz("last_profile_sync_at"),
  },
  (t) => [
    uniqueIndex("person_profile_url_idx").on(t.profileUrl),
    ivfflatCosine("person_about_embedding_idx", t.aboutEmbedding),
    ivfflatCosine("person_profile_embedding_idx", t.profileEmbedding),
  ],
);

export const role = pgTable(
  "role",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id").references(() => organisation.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    startDate: date("start_date", { mode: "string" }),
    startPrecision: datePrecision("start_precision").notNull().default("absent"),
    endDate: date("end_date", { mode: "string" }),
    endPrecision: datePrecision("end_precision").notNull().default("absent"),
    isCurrent: boolean("is_current").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    domain: text("domain"),
    domainConfidence: real("domain_confidence"),
    mode: roleMode("mode"),
    sortIndex: integer("sort_index").notNull(),
  },
  (t) => [
    index("role_person_id_idx").on(t.personId),
    index("role_organisation_id_idx").on(t.organisationId),
  ],
);

// person_id is the leading PK column, so the PK index covers the FK.
export const sectionCoverage = pgTable(
  "section_coverage",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    section: profileSection("section").notNull(),
    isComplete: boolean("is_complete").notNull().default(false),
    knownTotal: integer("known_total"),
    lastCapturedAt: timestamptz("last_captured_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.section] })],
);

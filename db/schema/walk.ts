import { sql } from "drizzle-orm";
import { check, date, index, jsonb, pgTable, smallint, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./columns";
import { objectRef } from "./memory";

export const walkSession = pgTable("walk_session", {
  id: uuid("id").primaryKey(), ownerId: uuid("owner_id").notNull(),
  localDay: date("local_day", { mode: "string" }).notNull(), timezone: text("timezone").notNull(),
  explicitContext: text("explicit_context"), createdAt: timestamptz("created_at").notNull().default(sql`clock_timestamp()`),
  sealedAt: timestamptz("sealed_at"), completedAt: timestamptz("completed_at"), stopCount: smallint("stop_count").notNull(),
}, t => [unique("walk_session_owner_day").on(t.ownerId, t.localDay), index("walk_session_owner_history").on(t.ownerId, t.createdAt),
  check("walk_session_timezone_length", sql`length(${t.timezone}) between 1 and 100`),
  check("walk_session_context_length", sql`length(${t.explicitContext}) <= 2000`),
  check("walk_session_stop_count", sql`${t.stopCount} between 0 and 3`),
  check("walk_session_sealing", sql`${t.sealedAt} is null or ${t.sealedAt} >= ${t.createdAt}`),
  check("walk_session_completion", sql`${t.completedAt} is null or (${t.sealedAt} is not null and ${t.completedAt} >= ${t.sealedAt})`)]);

export const walkStop = pgTable("walk_stop", {
  id: uuid("id").primaryKey(), sessionId: uuid("session_id").notNull().references(() => walkSession.id),
  objectId: uuid("object_id").notNull().references(() => objectRef.id), position: smallint("position").notNull(),
  selectionReasons: jsonb("selection_reasons").notNull(), selectionSupport: jsonb("selection_support").notNull(),
  selectionInputs: jsonb("selection_inputs").notNull(), rankVersion: text("rank_version").notNull(),
  resolvedAt: timestamptz("resolved_at"), resolution: text("resolution"),
}, t => [unique("walk_stop_session_position").on(t.sessionId, t.position), unique("walk_stop_session_object").on(t.sessionId, t.objectId),
  index("walk_stop_object_history").on(t.objectId, t.sessionId), check("walk_stop_position", sql`${t.position} between 1 and 3`),
  check("walk_stop_reasons", sql`jsonb_typeof(${t.selectionReasons})='array' and jsonb_array_length(${t.selectionReasons}) between 1 and 4 and octet_length(${t.selectionReasons}::text)<=4096`),
  check("walk_stop_support", sql`jsonb_typeof(${t.selectionSupport})='array' and jsonb_array_length(${t.selectionSupport}) between 1 and 5 and octet_length(${t.selectionSupport}::text)<=16384`),
  check("walk_stop_inputs", sql`jsonb_typeof(${t.selectionInputs})='object' and octet_length(${t.selectionInputs}::text)<=1024`),
  check("walk_stop_rank_version", sql`${t.rankVersion}='contextual-v1'`),
  check("walk_stop_resolution", sql`${t.resolution} in ('kept','useful','reduced','dismissed','passed','unavailable')`),
  check("walk_stop_resolution_time", sql`(${t.resolvedAt} is null)=(${t.resolution} is null)`)]);

export const attentionEvent = pgTable("attention_event", {
  id: uuid("id").primaryKey(), stopId: uuid("stop_id").notNull().references(() => walkStop.id), kind: text("kind").notNull(),
  recordedAt: timestamptz("recorded_at").notNull().default(sql`clock_timestamp()`),
}, t => [check("attention_event_kind", sql`${t.kind} in ('shown','opened','kept','useful','reduced','dismissed','passed','unavailable')`),
  uniqueIndex("attention_event_one_shown").on(t.stopId).where(sql`${t.kind}='shown'`),
  uniqueIndex("attention_event_one_resolution").on(t.stopId).where(sql`${t.kind} in ('kept','useful','reduced','dismissed','passed','unavailable')`),
  index("attention_event_stop_history").on(t.stopId, t.recordedAt)]);

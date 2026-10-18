import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { snapshot } from "./artifacts";
import { encounter, objectRef } from "./memory";
import { timestamptz } from "./columns";

export const captureRequest = pgTable("capture_request", {
  id: uuid("id").primaryKey(),
  adapterId: text("adapter_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  payloadHash: text("payload_hash").notNull(),
  snapshotId: uuid("snapshot_id").notNull().unique().references(() => snapshot.id),
  encounterId: uuid("encounter_id").notNull().unique().references(() => encounter.id),
  jobId: uuid("job_id").notNull().unique().references(() => processingJob.id),
  receivedAt: timestamptz("received_at").notNull().defaultNow(),
}, (t) => [check("capture_request_hash", sql`${t.payloadHash} ~ '^[0-9a-f]{64}$'`)]);

export const processingJob = pgTable("processing_job", {
  id: uuid("id").primaryKey().defaultRandom(),
  snapshotId: uuid("snapshot_id").notNull().references(() => snapshot.id),
  targetId: uuid("target_id").references(() => objectRef.id),
  kind: text("kind").notNull(),
  scopeKey: text("scope_key").notNull().references(() => processingHead.scopeKey),
  inputFingerprint: text("input_fingerprint").notNull(),
  state: text("state").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  availableAt: timestamptz("available_at").notNull().defaultNow(),
  leasedUntil: timestamptz("leased_until"),
  leaseToken: uuid("lease_token"),
  lastErrorCode: text("last_error_code"),
}, (t) => [unique("processing_job_input_unique").on(t.scopeKey, t.inputFingerprint),
  index("processing_job_available_idx").on(t.state, t.availableAt),
  index("processing_job_target_idx").on(t.targetId),
  check("processing_job_kind", sql`${t.kind} in ('parse','enrich','index')`),
  check("processing_job_scope", sql`(${t.kind} = 'parse' and ${t.scopeKey} = 'parse:snapshot:' || ${t.snapshotId}::text) or (${t.kind} in ('enrich','index') and ${t.targetId} is not null and ${t.scopeKey} = ${t.kind} || ':object:' || ${t.targetId}::text)`),
  check("processing_job_state", sql`${t.state} in ('queued','leased','succeeded','failed','superseded','quarantined')`),
  check("processing_job_attempts", sql`${t.attempts} >= 0 and ${t.maxAttempts} > 0 and ${t.attempts} <= ${t.maxAttempts}`),
  check("processing_job_lease", sql`(${t.state} = 'leased' and ${t.leaseToken} is not null and ${t.leasedUntil} is not null) or (${t.state} <> 'leased' and ${t.leaseToken} is null and ${t.leasedUntil} is null)`),
  check("processing_job_error_code", sql`${t.lastErrorCode} is null or ${t.lastErrorCode} ~ '^[A-Z0-9_]{1,64}$'`)]);

export const processingHead = pgTable("processing_head", {
  scopeKey: text("scope_key").primaryKey(),
  inputFingerprint: text("input_fingerprint").notNull(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const processingRun = pgTable("processing_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => processingJob.id),
  leaseToken: uuid("lease_token").notNull().unique(),
  inputFingerprint: text("input_fingerprint").notNull(),
  parserVersion: text("parser_version"),
  promptVersion: text("prompt_version"),
  model: text("model"),
  startedAt: timestamptz("started_at").notNull().defaultNow(),
  finishedAt: timestamptz("finished_at"),
  outcome: text("outcome").notNull(),
}, (t) => [index("processing_run_job_idx").on(t.jobId),
  check("processing_run_outcome", sql`${t.outcome} in ('running','succeeded','failed','superseded','quarantined')`),
  check("processing_run_finish", sql`(${t.outcome} = 'running' and ${t.finishedAt} is null) or (${t.outcome} <> 'running' and ${t.finishedAt} is not null and ${t.finishedAt} >= ${t.startedAt})`)]);

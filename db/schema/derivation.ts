import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { snapshot } from "./artifacts";
import { observation } from "./memory";
import { processingJob } from "./processing";
import { snapshotRepresentation } from "./evidence";

// Historical dependencies remain addressable after a desired processing head changes.
export const observationDerivation = pgTable("observation_derivation", {
  observationId: uuid("observation_id").primaryKey().references(() => observation.id),
  snapshotId: uuid("snapshot_id").notNull().references(() => snapshot.id),
  identityObservationId: uuid("identity_observation_id").notNull().references(() => observation.id),
  jobId: uuid("job_id").notNull().references(() => processingJob.id),
  representationId: uuid("representation_id").notNull().references(() => snapshotRepresentation.id),
  inputFingerprint: text("input_fingerprint").notNull(),
}, (t) => [index("observation_derivation_identity_idx").on(t.identityObservationId),
  index("observation_derivation_snapshot_idx").on(t.snapshotId),
  index("observation_derivation_job_idx").on(t.jobId),
  index("observation_derivation_representation_idx").on(t.representationId),
  check("observation_derivation_fingerprint", sql`${t.inputFingerprint} ~ '^[0-9a-f]{64}$'`)]);

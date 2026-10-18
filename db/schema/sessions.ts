import { sql } from "drizzle-orm";
import { check, index, integer, pgSchema, text, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./columns";

// Separate from notebook Person identities and public exports. Principal comes from a verified login provider.
export const sessionsAuthSchema = pgSchema("auth");
export const session = sessionsAuthSchema.table("session", {
  id: uuid("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  principalId: uuid("principal_id").notNull(),
  permission: text("permission").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  expiresAt: timestamptz("expires_at").notNull(),
  revokedAt: timestamptz("revoked_at"),
}, (t) => [index("session_principal_idx").on(t.principalId),
  check("session_hash", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  check("session_permission", sql`${t.permission} in ('read','write')`),
  check("session_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
  check("session_revocation", sql`${t.revokedAt} is null or ${t.revokedAt} >= ${t.createdAt}`)]);

export const loginThrottle = sessionsAuthSchema.table("login_throttle", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStartedAt: timestamptz("window_started_at").notNull(),
  attempts: integer("attempts").notNull(),
  maxAttempts: integer("max_attempts").notNull(),
  windowSeconds: integer("window_seconds").notNull(),
}, (t) => [check("login_throttle_key", sql`${t.bucketKey} ~ '^[0-9a-f]{64}$'`),
  check("login_throttle_limit", sql`${t.maxAttempts} between 1 and 100`),
  check("login_throttle_window", sql`${t.windowSeconds} between 60 and 86400`),
  check("login_throttle_attempts", sql`${t.attempts} between 0 and ${t.maxAttempts}`)]);

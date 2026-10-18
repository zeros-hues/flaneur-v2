CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"principal_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "session_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "session_hash" CHECK ("auth"."session"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "session_permission" CHECK ("auth"."session"."permission" in ('read','write')),
	CONSTRAINT "session_expiry" CHECK ("auth"."session"."expires_at" > "auth"."session"."created_at"),
	CONSTRAINT "session_revocation" CHECK ("auth"."session"."revoked_at" is null or "auth"."session"."revoked_at" >= "auth"."session"."created_at")
);
--> statement-breakpoint
CREATE INDEX "session_principal_idx" ON "auth"."session" USING btree ("principal_id");
--> statement-breakpoint
CREATE FUNCTION auth.protect_session_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
    OR NEW.principal_id IS DISTINCT FROM OLD.principal_id OR NEW.permission IS DISTINCT FROM OLD.permission
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'Session identity and terminal revocation are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER protect_session_identity BEFORE UPDATE ON auth.session
FOR EACH ROW EXECUTE FUNCTION auth.protect_session_identity();

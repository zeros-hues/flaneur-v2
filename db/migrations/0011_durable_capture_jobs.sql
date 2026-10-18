-- Prepared locally only; database application is not authorized.
CREATE TABLE "capture_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"adapter_id" text NOT NULL,
	"source_url" text NOT NULL,
	"payload_hash" text NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_request_snapshot_id_unique" UNIQUE("snapshot_id"),
	CONSTRAINT "capture_request_encounter_id_unique" UNIQUE("encounter_id"),
	CONSTRAINT "capture_request_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "capture_request_hash" CHECK ("capture_request"."payload_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "processing_head" (
	"scope_key" text PRIMARY KEY NOT NULL,
	"input_fingerprint" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"target_id" uuid,
	"kind" text NOT NULL,
	"scope_key" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_until" timestamp with time zone,
	"lease_token" uuid,
	"last_error_code" text,
	CONSTRAINT "processing_job_input_unique" UNIQUE("scope_key","input_fingerprint"),
	CONSTRAINT "processing_job_kind" CHECK ("processing_job"."kind" in ('parse','enrich','index')),
	CONSTRAINT "processing_job_scope" CHECK (("processing_job"."kind" = 'parse' and "processing_job"."scope_key" = 'parse:snapshot:' || "processing_job"."snapshot_id"::text) or ("processing_job"."kind" in ('enrich','index') and "processing_job"."target_id" is not null and "processing_job"."scope_key" = "processing_job"."kind" || ':object:' || "processing_job"."target_id"::text)),
	CONSTRAINT "processing_job_state" CHECK ("processing_job"."state" in ('queued','leased','succeeded','failed','superseded','quarantined')),
	CONSTRAINT "processing_job_attempts" CHECK ("processing_job"."attempts" >= 0 and "processing_job"."max_attempts" > 0 and "processing_job"."attempts" <= "processing_job"."max_attempts"),
	CONSTRAINT "processing_job_lease" CHECK (("processing_job"."state" = 'leased' and "processing_job"."lease_token" is not null and "processing_job"."leased_until" is not null) or ("processing_job"."state" <> 'leased' and "processing_job"."lease_token" is null and "processing_job"."leased_until" is null)),
	CONSTRAINT "processing_job_error_code" CHECK ("processing_job"."last_error_code" is null or "processing_job"."last_error_code" ~ '^[A-Z0-9_]{1,64}$')
);
--> statement-breakpoint
CREATE TABLE "processing_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"lease_token" uuid NOT NULL,
	"input_fingerprint" text NOT NULL,
	"parser_version" text,
	"prompt_version" text,
	"model" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text NOT NULL,
	CONSTRAINT "processing_run_lease_token_unique" UNIQUE("lease_token"),
	CONSTRAINT "processing_run_outcome" CHECK ("processing_run"."outcome" in ('running','succeeded','failed','superseded','quarantined')),
	CONSTRAINT "processing_run_finish" CHECK (("processing_run"."outcome" = 'running' and "processing_run"."finished_at" is null) or ("processing_run"."outcome" <> 'running' and "processing_run"."finished_at" is not null and "processing_run"."finished_at" >= "processing_run"."started_at"))
);
--> statement-breakpoint
ALTER TABLE "snapshot" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "snapshot" ADD COLUMN "adapter_id" text;--> statement-breakpoint
ALTER TABLE "snapshot" ADD COLUMN "extension_version" text;--> statement-breakpoint
ALTER TABLE "capture_request" ADD CONSTRAINT "capture_request_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_request" ADD CONSTRAINT "capture_request_encounter_id_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_request" ADD CONSTRAINT "capture_request_job_id_processing_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."processing_job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_job" ADD CONSTRAINT "processing_job_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_job" ADD CONSTRAINT "processing_job_target_id_object_ref_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."object_ref"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_job" ADD CONSTRAINT "processing_job_scope_key_processing_head_scope_key_fk" FOREIGN KEY ("scope_key") REFERENCES "public"."processing_head"("scope_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_run" ADD CONSTRAINT "processing_run_job_id_processing_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."processing_job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processing_job_available_idx" ON "processing_job" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "processing_job_target_idx" ON "processing_job" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "processing_run_job_idx" ON "processing_run" USING btree ("job_id");
--> statement-breakpoint
CREATE FUNCTION public.memory_capture_integrity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.capture_request r
    JOIN public.encounter e ON e.id = r.encounter_id JOIN public.processing_job j ON j.id = r.job_id
    JOIN public.snapshot s ON s.id = r.snapshot_id
    WHERE e.kind <> 'captured' OR e.snapshot_id IS DISTINCT FROM r.snapshot_id
      OR j.snapshot_id <> r.snapshot_id OR j.kind <> 'parse' OR s.adapter_id IS DISTINCT FROM r.adapter_id
      OR s.content_hash IS NULL OR s.content_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Capture request must own its snapshot, capture encounter and parse job' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['capture_request','encounter','processing_job','snapshot'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER memory_capture_guard AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.memory_capture_integrity()', relation_name);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.memory_snapshot_original_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.content_gzip IS DISTINCT FROM OLD.content_gzip
    OR NEW.source_url IS DISTINCT FROM OLD.source_url OR NEW.captured_at IS DISTINCT FROM OLD.captured_at
    OR NEW.capture_type IS DISTINCT FROM OLD.capture_type
    OR (OLD.content_hash IS NOT NULL AND NEW.content_hash IS DISTINCT FROM OLD.content_hash)
    OR (OLD.adapter_id IS NOT NULL AND NEW.adapter_id IS DISTINCT FROM OLD.adapter_id)
    OR (OLD.extension_version IS NOT NULL AND NEW.extension_version IS DISTINCT FROM OLD.extension_version) THEN
    RAISE EXCEPTION 'Original captured payload and source identity are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER memory_snapshot_original_guard BEFORE UPDATE ON public.snapshot
FOR EACH ROW EXECUTE FUNCTION public.memory_snapshot_original_immutable();
--> statement-breakpoint
CREATE TRIGGER memory_capture_request_immutable BEFORE UPDATE ON public.capture_request
FOR EACH ROW EXECUTE FUNCTION public.memory_immutable_assertion();

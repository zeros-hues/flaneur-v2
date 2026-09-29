CREATE TABLE "education" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"school" text NOT NULL,
	"school_slug" text,
	"degree" text,
	"field_of_study" text,
	"start_date" date,
	"start_precision" date_precision DEFAULT 'absent' NOT NULL,
	"end_date" date,
	"end_precision" date_precision DEFAULT 'absent' NOT NULL,
	"sort_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "headline_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"headline" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parser_health" (
	"adapter_id" text PRIMARY KEY NOT NULL,
	"parser_version" text NOT NULL,
	"suspect" boolean DEFAULT false NOT NULL,
	"reason" text,
	"missing_canaries" text[] DEFAULT '{}' NOT NULL,
	"snapshot_id" uuid,
	"since" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quarantine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"adapter_id" text NOT NULL,
	"parser_version" text NOT NULL,
	"reason" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifact" ALTER COLUMN "person_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "organisation_id" uuid;--> statement-breakpoint
ALTER TABLE "education" ADD CONSTRAINT "education_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headline_history" ADD CONSTRAINT "headline_history_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parser_health" ADD CONSTRAINT "parser_health_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantine" ADD CONSTRAINT "quarantine_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "education_person_id_idx" ON "education" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "headline_history_person_id_idx" ON "headline_history" USING btree ("person_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_person_id_name_idx" ON "skill" USING btree ("person_id","name");--> statement-breakpoint
CREATE INDEX "quarantine_snapshot_id_idx" ON "quarantine" USING btree ("snapshot_id");--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_organisation_id_idx" ON "artifact" USING btree ("organisation_id");--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_one_author" CHECK (num_nonnulls("artifact"."person_id", "artifact"."organisation_id") = 1);
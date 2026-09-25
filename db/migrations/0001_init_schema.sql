CREATE TYPE "public"."artifact_status" AS ENUM('pending', 'accepted', 'messaged', 'replied', 'gone_quiet');--> statement-breakpoint
CREATE TYPE "public"."artifact_type" AS ENUM('post', 'connection_request');--> statement-breakpoint
CREATE TYPE "public"."concept_kind" AS ENUM('concept', 'topic');--> statement-breakpoint
CREATE TYPE "public"."concept_link_source" AS ENUM('hashtag', 'inferred');--> statement-breakpoint
CREATE TYPE "public"."date_precision" AS ENUM('month', 'year', 'absent');--> statement-breakpoint
CREATE TYPE "public"."profile_section" AS ENUM('experience', 'education', 'skills', 'about', 'activity');--> statement-breakpoint
CREATE TYPE "public"."role_mode" AS ENUM('ic', 'lead', 'founder', 'academic', 'advisory');--> statement-breakpoint
CREATE TYPE "public"."schedule_action" AS ENUM('say_hello', 'keep_walking', 'street_closed', 'just_passing');--> statement-breakpoint
CREATE TABLE "organisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_url" text NOT NULL,
	"name" text NOT NULL,
	"headline" text,
	"about" text,
	"location" text,
	"photo_url" text,
	"about_embedding" vector(384),
	"profile_embedding" vector(384),
	"first_captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_profile_sync_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"organisation_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"start_date" date,
	"start_precision" date_precision DEFAULT 'absent' NOT NULL,
	"end_date" date,
	"end_precision" date_precision DEFAULT 'absent' NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"domain" text,
	"domain_confidence" real,
	"mode" "role_mode",
	"sort_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_coverage" (
	"person_id" uuid NOT NULL,
	"section" "profile_section" NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"known_total" integer,
	"last_captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_coverage_person_id_section_pk" PRIMARY KEY("person_id","section")
);
--> statement-breakpoint
CREATE TABLE "artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"type" "artifact_type" NOT NULL,
	"source_url" text NOT NULL,
	"urn" text,
	"post_type" text,
	"body_text" text,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"author_headline_snapshot" text,
	"reaction_count" integer,
	"comment_count" integer,
	"status" "artifact_status",
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"item_embedding" vector(384)
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"artifact_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule" (
	"artifact_id" uuid PRIMARY KEY NOT NULL,
	"ease" real DEFAULT 2.5 NOT NULL,
	"interval_days" real DEFAULT 1 NOT NULL,
	"last_surfaced_at" timestamp with time zone,
	"last_action" "schedule_action"
);
--> statement-breakpoint
CREATE TABLE "snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"artifact_id" uuid,
	"source_url" text NOT NULL,
	"sections_covered" text[] DEFAULT '{}' NOT NULL,
	"content_gzip" "bytea" NOT NULL,
	"parser_version" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"kind" "concept_kind" NOT NULL,
	"embedding" vector(384),
	"document_frequency" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_edge" (
	"concept_a_id" uuid NOT NULL,
	"concept_b_id" uuid NOT NULL,
	"raw_count" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_edge_concept_a_id_concept_b_id_pk" PRIMARY KEY("concept_a_id","concept_b_id")
);
--> statement-breakpoint
CREATE TABLE "concept_link" (
	"concept_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"source" "concept_link_source" NOT NULL,
	CONSTRAINT "concept_link_concept_id_artifact_id_pk" PRIMARY KEY("concept_id","artifact_id")
);
--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_coverage" ADD CONSTRAINT "section_coverage_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot" ADD CONSTRAINT "snapshot_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot" ADD CONSTRAINT "snapshot_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_edge" ADD CONSTRAINT "concept_edge_concept_a_id_concept_id_fk" FOREIGN KEY ("concept_a_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_edge" ADD CONSTRAINT "concept_edge_concept_b_id_concept_id_fk" FOREIGN KEY ("concept_b_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_link" ADD CONSTRAINT "concept_link_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_link" ADD CONSTRAINT "concept_link_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_slug_idx" ON "organisation" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "person_profile_url_idx" ON "person" USING btree ("profile_url");--> statement-breakpoint
CREATE INDEX "person_about_embedding_idx" ON "person" USING ivfflat ("about_embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX "person_profile_embedding_idx" ON "person" USING ivfflat ("profile_embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX "role_person_id_idx" ON "role" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "role_organisation_id_idx" ON "role" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "artifact_person_id_idx" ON "artifact" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_urn_idx" ON "artifact" USING btree ("urn");--> statement-breakpoint
CREATE INDEX "artifact_item_embedding_idx" ON "artifact" USING ivfflat ("item_embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX "note_person_id_idx" ON "note" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "note_artifact_id_idx" ON "note" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "snapshot_person_id_idx" ON "snapshot" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "snapshot_artifact_id_idx" ON "snapshot" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "concept_embedding_idx" ON "concept" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX "concept_edge_concept_b_id_idx" ON "concept_edge" USING btree ("concept_b_id");--> statement-breakpoint
CREATE INDEX "concept_link_artifact_id_idx" ON "concept_link" USING btree ("artifact_id");
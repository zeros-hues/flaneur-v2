CREATE TABLE "encounter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot_id" uuid,
	"source_context" jsonb,
	"explicit_context_text" text,
	"migration_key" text,
	CONSTRAINT "encounter_snapshot_id_unique" UNIQUE("snapshot_id"),
	CONSTRAINT "encounter_migration_key_unique" UNIQUE("migration_key"),
	CONSTRAINT "encounter_kind" CHECK ("encounter"."kind" in ('captured','intentionally_opened','resurfaced','contacted'))
);
--> statement-breakpoint
CREATE TABLE "encounter_object" (
	"encounter_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"relation" text NOT NULL,
	CONSTRAINT "encounter_object_encounter_id_object_id_relation_pk" PRIMARY KEY("encounter_id","object_id","relation"),
	CONSTRAINT "encounter_object_relation" CHECK ("encounter_object"."relation" in ('noticed','source','author','related'))
);
--> statement-breakpoint
CREATE TABLE "object_ref" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "object_ref_kind" CHECK ("object_ref"."kind" in ('person','artifact','concept','organisation','encounter','observation'))
);
--> statement-breakpoint
CREATE TABLE "observation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"truth_layer" text NOT NULL,
	"semantic_role" text NOT NULL,
	"body_text" text NOT NULL,
	"structured_value" jsonb,
	"field_key" text,
	"observed_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" real,
	"support_status" text NOT NULL,
	"supersedes_id" uuid,
	"origin_key" text,
	CONSTRAINT "observation_origin_key_unique" UNIQUE("origin_key"),
	CONSTRAINT "observation_id_subject_unique" UNIQUE("id","subject_id"),
	CONSTRAINT "observation_layer" CHECK ("observation"."truth_layer" in ('user','source','extracted','inferred')),
	CONSTRAINT "observation_role" CHECK ("observation"."semantic_role" in ('reason_for_noticing','note','fact','summary','classification','relationship_assertion','selection_reason')),
	CONSTRAINT "observation_support" CHECK ("observation"."support_status" in ('verified','partial','legacy_unverified','unsupported')),
	CONSTRAINT "observation_confidence" CHECK ("observation"."confidence" between 0 and 1),
	CONSTRAINT "observation_not_self_revision" CHECK ("observation"."supersedes_id" is distinct from "observation"."id")
);
--> statement-breakpoint
CREATE TABLE "observation_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"snapshot_id" uuid,
	"supporting_observation_id" uuid,
	"excerpt" text,
	"locator_json" jsonb,
	"support_role" text NOT NULL,
	"evidence_version" text NOT NULL,
	CONSTRAINT "observation_evidence_one_target" CHECK (num_nonnulls("observation_evidence"."snapshot_id", "observation_evidence"."supporting_observation_id") = 1),
	CONSTRAINT "observation_evidence_not_self" CHECK ("observation_evidence"."supporting_observation_id" is distinct from "observation_evidence"."observation_id"),
	CONSTRAINT "observation_evidence_role" CHECK ("observation_evidence"."support_role" in ('supports','contradicts'))
);
--> statement-breakpoint
CREATE TABLE "object_alias" (
	"former_object_id" uuid PRIMARY KEY NOT NULL,
	"canonical_object_id" uuid NOT NULL,
	"merged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decision_observation_id" uuid NOT NULL,
	CONSTRAINT "object_alias_not_self" CHECK ("object_alias"."former_object_id" <> "object_alias"."canonical_object_id")
);
--> statement-breakpoint
CREATE TABLE "observation_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replacement_observation_id" uuid,
	"comment" text,
	CONSTRAINT "observation_review_decision" CHECK ("observation_review"."decision" in ('confirmed','rejected','corrected')),
	CONSTRAINT "observation_review_replacement" CHECK (("observation_review"."decision" = 'rejected' and "observation_review"."replacement_observation_id" is null) or ("observation_review"."decision" in ('confirmed','corrected') and "observation_review"."replacement_observation_id" is not null and "observation_review"."replacement_observation_id" <> "observation_review"."observation_id"))
);
--> statement-breakpoint
CREATE TABLE "source_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid NOT NULL,
	"adapter_id" text NOT NULL,
	"identity_kind" text NOT NULL,
	"external_key" text NOT NULL,
	"canonical_url" text,
	"resolution_layer" text NOT NULL,
	"confidence" real,
	"assertion_id" uuid,
	CONSTRAINT "source_identity_key_unique" UNIQUE("adapter_id","identity_kind","external_key"),
	CONSTRAINT "source_identity_layer" CHECK ("source_identity"."resolution_layer" in ('user','source','extracted','inferred')),
	CONSTRAINT "source_identity_confidence" CHECK ("source_identity"."confidence" between 0 and 1),
	CONSTRAINT "source_identity_nonempty" CHECK (length(trim("source_identity"."adapter_id")) > 0 and length(trim("source_identity"."identity_kind")) > 0 and length(trim("source_identity"."external_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "encounter" ADD CONSTRAINT "encounter_id_object_ref_id_fk" FOREIGN KEY ("id") REFERENCES "public"."object_ref"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter" ADD CONSTRAINT "encounter_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_object" ADD CONSTRAINT "encounter_object_encounter_id_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_object" ADD CONSTRAINT "encounter_object_object_id_object_ref_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."object_ref"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_id_object_ref_id_fk" FOREIGN KEY ("id") REFERENCES "public"."object_ref"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_subject_id_object_ref_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."object_ref"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_revision_subject_fk" FOREIGN KEY ("supersedes_id","subject_id") REFERENCES "public"."observation"("id","subject_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_evidence" ADD CONSTRAINT "observation_evidence_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_evidence" ADD CONSTRAINT "observation_evidence_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_evidence" ADD CONSTRAINT "observation_evidence_supporting_observation_id_observation_id_fk" FOREIGN KEY ("supporting_observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_alias" ADD CONSTRAINT "object_alias_former_object_id_object_ref_id_fk" FOREIGN KEY ("former_object_id") REFERENCES "public"."object_ref"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_alias" ADD CONSTRAINT "object_alias_canonical_object_id_object_ref_id_fk" FOREIGN KEY ("canonical_object_id") REFERENCES "public"."object_ref"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_alias" ADD CONSTRAINT "object_alias_decision_observation_id_observation_id_fk" FOREIGN KEY ("decision_observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_review" ADD CONSTRAINT "observation_review_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_review" ADD CONSTRAINT "observation_review_replacement_observation_id_observation_id_fk" FOREIGN KEY ("replacement_observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_identity" ADD CONSTRAINT "source_identity_object_id_object_ref_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."object_ref"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_identity" ADD CONSTRAINT "source_identity_assertion_id_observation_id_fk" FOREIGN KEY ("assertion_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "encounter_occurred_at_idx" ON "encounter" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "encounter_object_object_idx" ON "encounter_object" USING btree ("object_id","encounter_id");--> statement-breakpoint
CREATE INDEX "observation_subject_role_idx" ON "observation" USING btree ("subject_id","semantic_role","recorded_at");--> statement-breakpoint
CREATE INDEX "observation_evidence_observation_idx" ON "observation_evidence" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX "observation_evidence_snapshot_idx" ON "observation_evidence" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "observation_evidence_supporting_idx" ON "observation_evidence" USING btree ("supporting_observation_id");--> statement-breakpoint
CREATE INDEX "object_alias_canonical_idx" ON "object_alias" USING btree ("canonical_object_id");--> statement-breakpoint
CREATE INDEX "observation_review_observation_idx" ON "observation_review" USING btree ("observation_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "source_identity_object_idx" ON "source_identity" USING btree ("object_id");
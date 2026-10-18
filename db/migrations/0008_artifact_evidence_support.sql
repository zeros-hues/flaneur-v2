ALTER TYPE "public"."artifact_type" ADD VALUE 'profile_page';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'social_post';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'article';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'project';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'portfolio_page';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'personal_website';--> statement-breakpoint
CREATE TABLE "education_observation" (
	"education_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	CONSTRAINT "education_observation_education_id_observation_id_field_key_pk" PRIMARY KEY("education_id","observation_id","field_key")
);
--> statement-breakpoint
CREATE TABLE "migration_receipt" (
	"key" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_object_id" uuid NOT NULL,
	"to_object_id" uuid NOT NULL,
	"predicate" text NOT NULL,
	"state" text DEFAULT 'candidate' NOT NULL,
	"origin_key" text NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	CONSTRAINT "relationship_origin_key_unique" UNIQUE("origin_key"),
	CONSTRAINT "relationship_state" CHECK ("relationship"."state" in ('candidate','active','rejected')),
	CONSTRAINT "relationship_not_self" CHECK ("relationship"."from_object_id" <> "relationship"."to_object_id"),
	CONSTRAINT "relationship_dates" CHECK ("relationship"."valid_from" is null or "relationship"."valid_to" is null or "relationship"."valid_from" <= "relationship"."valid_to"),
	CONSTRAINT "relationship_predicate" CHECK ("relationship"."predicate" in ('authored_by','profile_of','mentions_concept','associated_with_concept','employed_by','educated_at','similar_trajectory','relevant_to'))
);
--> statement-breakpoint
CREATE TABLE "relationship_support" (
	"relationship_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	CONSTRAINT "relationship_support_relationship_id_observation_id_pk" PRIMARY KEY("relationship_id","observation_id")
);
--> statement-breakpoint
CREATE TABLE "role_observation" (
	"role_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	CONSTRAINT "role_observation_role_id_observation_id_field_key_pk" PRIMARY KEY("role_id","observation_id","field_key")
);
--> statement-breakpoint
CREATE TABLE "skill_observation" (
	"skill_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	CONSTRAINT "skill_observation_skill_id_observation_id_field_key_pk" PRIMARY KEY("skill_id","observation_id","field_key")
);
--> statement-breakpoint
ALTER TABLE "artifact" DROP CONSTRAINT "artifact_one_author";--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "migration_key" text;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "published_precision" text DEFAULT 'absent' NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "last_captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "education_observation" ADD CONSTRAINT "education_observation_education_id_education_id_fk" FOREIGN KEY ("education_id") REFERENCES "public"."education"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education_observation" ADD CONSTRAINT "education_observation_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_from_object_id_object_ref_id_fk" FOREIGN KEY ("from_object_id") REFERENCES "public"."object_ref"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_to_object_id_object_ref_id_fk" FOREIGN KEY ("to_object_id") REFERENCES "public"."object_ref"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_support" ADD CONSTRAINT "relationship_support_relationship_id_relationship_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationship"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_support" ADD CONSTRAINT "relationship_support_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_observation" ADD CONSTRAINT "role_observation_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_observation" ADD CONSTRAINT "role_observation_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_observation" ADD CONSTRAINT "skill_observation_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_observation" ADD CONSTRAINT "skill_observation_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "education_observation_assertion_idx" ON "education_observation" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX "relationship_from_idx" ON "relationship" USING btree ("from_object_id","predicate");--> statement-breakpoint
CREATE INDEX "relationship_to_idx" ON "relationship" USING btree ("to_object_id","predicate");--> statement-breakpoint
CREATE INDEX "relationship_support_observation_idx" ON "relationship_support" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX "role_observation_assertion_idx" ON "role_observation" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX "skill_observation_assertion_idx" ON "skill_observation" USING btree ("observation_id");--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_migration_key_unique" UNIQUE("migration_key");--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_publication_precision" CHECK (("artifact"."published_at" is null and "artifact"."published_precision" = 'absent') or ("artifact"."published_at" is not null and "artifact"."published_precision" in ('day','month','year')));--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_one_author" CHECK (num_nonnulls("artifact"."person_id", "artifact"."organisation_id") <= 1);
--> statement-breakpoint
-- Hand-authored integrity checks are intentionally outside Drizzle's schema snapshot.
CREATE FUNCTION public.memory_check_relationships() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.relationship r
    JOIN public.object_ref f ON f.id = r.from_object_id JOIN public.object_ref t ON t.id = r.to_object_id
    WHERE NOT (CASE r.predicate
      WHEN 'authored_by' THEN f.kind = 'artifact' AND t.kind IN ('person','organisation')
      WHEN 'profile_of' THEN f.kind = 'artifact' AND t.kind = 'person'
      WHEN 'mentions_concept' THEN f.kind = 'artifact' AND t.kind = 'concept'
      WHEN 'associated_with_concept' THEN f.kind IN ('person','artifact','organisation') AND t.kind = 'concept'
      WHEN 'employed_by' THEN f.kind = 'person' AND t.kind = 'organisation'
      WHEN 'educated_at' THEN f.kind = 'person' AND t.kind = 'organisation'
      WHEN 'similar_trajectory' THEN f.kind = 'person' AND t.kind = 'person'
      WHEN 'relevant_to' THEN f.kind IN ('person','artifact','concept','organisation') AND t.kind = 'encounter'
      ELSE false END)) THEN
    RAISE EXCEPTION 'Invalid memory relationship endpoint kinds' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.relationship r WHERE r.state = 'active' AND NOT EXISTS (
    SELECT 1 FROM public.relationship_support s JOIN public.observation o ON o.id = s.observation_id
    WHERE s.relationship_id = r.id AND o.subject_id = r.from_object_id
      AND o.semantic_role = 'relationship_assertion' AND o.support_status IN ('verified','partial')
      AND o.structured_value->>'to_object_id' = r.to_object_id::text
      AND coalesce((SELECT review.decision <> 'rejected' FROM public.observation_review review
        WHERE review.observation_id = o.id ORDER BY review.reviewed_at DESC, review.id DESC LIMIT 1), true)
  )) THEN
    RAISE EXCEPTION 'Active memory relationship requires supported, unrejected assertion' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.role_observation j JOIN public.role fact ON fact.id = j.role_id
      JOIN public.observation o ON o.id = j.observation_id
      WHERE o.subject_id <> fact.person_id OR o.field_key IS DISTINCT FROM 'role:' || fact.id::text || ':' || j.field_key
    UNION ALL SELECT 1 FROM public.education_observation j JOIN public.education fact ON fact.id = j.education_id
      JOIN public.observation o ON o.id = j.observation_id
      WHERE o.subject_id <> fact.person_id OR o.field_key IS DISTINCT FROM 'education:' || fact.id::text || ':' || j.field_key
    UNION ALL SELECT 1 FROM public.skill_observation j JOIN public.skill fact ON fact.id = j.skill_id
      JOIN public.observation o ON o.id = j.observation_id
      WHERE o.subject_id <> fact.person_id OR o.field_key IS DISTINCT FROM 'skill:' || fact.id::text || ':' || j.field_key
  ) THEN
    RAISE EXCEPTION 'Structured support must match row owner and field' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['relationship','relationship_support','role_observation','education_observation',
    'skill_observation','role','education','skill','object_ref','observation','observation_review'] LOOP
    EXECUTE format('CREATE TRIGGER memory_relationship_serialization BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.memory_graph_lock()', relation_name);
    EXECUTE format('CREATE CONSTRAINT TRIGGER memory_relationship_guard AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.memory_check_relationships()', relation_name);
  END LOOP;
END $$;

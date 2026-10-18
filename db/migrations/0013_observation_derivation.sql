CREATE TABLE "observation_derivation" (
	"observation_id" uuid PRIMARY KEY NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"identity_observation_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"representation_id" uuid NOT NULL,
	"input_fingerprint" text NOT NULL,
	CONSTRAINT "observation_derivation_fingerprint" CHECK ("observation_derivation"."input_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "observation_derivation" ADD CONSTRAINT "observation_derivation_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_derivation" ADD CONSTRAINT "observation_derivation_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_derivation" ADD CONSTRAINT "observation_derivation_identity_observation_id_observation_id_fk" FOREIGN KEY ("identity_observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_derivation" ADD CONSTRAINT "observation_derivation_job_id_processing_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."processing_job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_derivation" ADD CONSTRAINT "observation_derivation_representation_id_snapshot_representation_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."snapshot_representation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "observation_derivation_identity_idx" ON "observation_derivation" USING btree ("identity_observation_id");--> statement-breakpoint
CREATE INDEX "observation_derivation_snapshot_idx" ON "observation_derivation" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "observation_derivation_job_idx" ON "observation_derivation" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "observation_derivation_representation_idx" ON "observation_derivation" USING btree ("representation_id");
--> statement-breakpoint
CREATE FUNCTION public.memory_derivation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.observation o
    JOIN public.observation proof ON proof.id = NEW.identity_observation_id
    JOIN public.processing_job j ON j.id = NEW.job_id
    JOIN public.snapshot_representation r ON r.id = NEW.representation_id
    WHERE o.id = NEW.observation_id AND o.truth_layer = 'extracted' AND o.semantic_role = 'fact'
      AND o.field_key IN ('capture_field:school','capture_field:role','capture_field:organization')
      AND proof.subject_id = o.subject_id AND proof.support_status = 'verified'
      AND proof.truth_layer IN ('user','source','extracted')
      AND proof.structured_value->>'identity_for_snapshot' = NEW.snapshot_id::text
      AND j.kind = 'parse' AND j.snapshot_id = NEW.snapshot_id AND j.input_fingerprint = NEW.input_fingerprint
      AND r.snapshot_id = NEW.snapshot_id
      AND o.structured_value->>'snapshot_id' = NEW.snapshot_id::text
      AND o.structured_value->>'identity_observation_id' = NEW.identity_observation_id::text
      AND o.structured_value->>'parse_input_fingerprint' = NEW.input_fingerprint
      AND EXISTS (SELECT 1 FROM public.observation_evidence e JOIN public.text_evidence t ON t.evidence_id = e.id
        WHERE e.observation_id = o.id AND e.snapshot_id = NEW.snapshot_id AND e.support_role = 'supports'
          AND t.representation_id = NEW.representation_id AND t.quote = o.body_text)) THEN
    RAISE EXCEPTION 'Derivation must bind its assertion, identity proof, parse input and exact source representation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER memory_derivation_check BEFORE INSERT ON public.observation_derivation
FOR EACH ROW EXECUTE FUNCTION public.memory_derivation_guard();
--> statement-breakpoint
CREATE TRIGGER memory_derivation_immutable BEFORE UPDATE ON public.observation_derivation
FOR EACH ROW EXECUTE FUNCTION public.memory_immutable_assertion();
--> statement-breakpoint
CREATE FUNCTION public.memory_processing_input_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id OR NEW.target_id IS DISTINCT FROM OLD.target_id
    OR NEW.scope_key IS DISTINCT FROM OLD.scope_key OR NEW.input_fingerprint IS DISTINCT FROM OLD.input_fingerprint THEN
    RAISE EXCEPTION 'Processing input identity is immutable; enqueue a new input instead' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER memory_processing_input_guard BEFORE UPDATE ON public.processing_job
FOR EACH ROW EXECUTE FUNCTION public.memory_processing_input_immutable();
--> statement-breakpoint
CREATE TRIGGER memory_observation_review_immutable BEFORE UPDATE ON public.observation_review
FOR EACH ROW EXECUTE FUNCTION public.memory_immutable_assertion();

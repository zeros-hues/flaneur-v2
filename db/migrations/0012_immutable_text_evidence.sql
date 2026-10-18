CREATE TABLE "snapshot_representation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"normalizer_version" text NOT NULL,
	"text" text NOT NULL,
	"text_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshot_representation_version_unique" UNIQUE("snapshot_id","normalizer_version"),
	CONSTRAINT "snapshot_representation_hash" CHECK ("snapshot_representation"."text_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "snapshot_representation_version" CHECK (length(trim("snapshot_representation"."normalizer_version")) > 0)
);
--> statement-breakpoint
CREATE TABLE "text_evidence" (
	"evidence_id" uuid PRIMARY KEY NOT NULL,
	"representation_id" uuid NOT NULL,
	"start_codepoint" integer NOT NULL,
	"end_codepoint" integer NOT NULL,
	"quote" text NOT NULL,
	CONSTRAINT "text_evidence_range" CHECK ("text_evidence"."start_codepoint" >= 0 and "text_evidence"."end_codepoint" > "text_evidence"."start_codepoint"),
	CONSTRAINT "text_evidence_quote" CHECK (length("text_evidence"."quote") > 0)
);
--> statement-breakpoint
ALTER TABLE "snapshot_representation" ADD CONSTRAINT "snapshot_representation_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_evidence" ADD CONSTRAINT "text_evidence_evidence_id_observation_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."observation_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_evidence" ADD CONSTRAINT "text_evidence_representation_id_snapshot_representation_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."snapshot_representation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "text_evidence_representation_idx" ON "text_evidence" USING btree ("representation_id");
--> statement-breakpoint
CREATE FUNCTION public.memory_representation_hash_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.text_hash <> encode(sha256(convert_to(NEW.text, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Representation hash must match exact UTF8 text' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER memory_representation_hash BEFORE INSERT ON public.snapshot_representation
FOR EACH ROW EXECUTE FUNCTION public.memory_representation_hash_guard();
--> statement-breakpoint
CREATE FUNCTION public.memory_text_evidence_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE source_record public.snapshot_representation; support_record public.observation_evidence;
BEGIN
  SELECT * INTO STRICT source_record FROM public.snapshot_representation WHERE id = NEW.representation_id;
  SELECT * INTO STRICT support_record FROM public.observation_evidence WHERE id = NEW.evidence_id;
  IF support_record.snapshot_id IS DISTINCT FROM source_record.snapshot_id
    OR support_record.excerpt IS DISTINCT FROM NEW.quote
    OR NEW.end_codepoint > char_length(source_record.text)
    OR substring(source_record.text FROM NEW.start_codepoint + 1 FOR NEW.end_codepoint - NEW.start_codepoint) <> NEW.quote THEN
    RAISE EXCEPTION 'Text evidence must match its captured snapshot and exact excerpt' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER memory_text_evidence_check BEFORE INSERT ON public.text_evidence
FOR EACH ROW EXECUTE FUNCTION public.memory_text_evidence_guard();
--> statement-breakpoint
CREATE TRIGGER memory_representation_immutable BEFORE UPDATE ON public.snapshot_representation
FOR EACH ROW EXECUTE FUNCTION public.memory_immutable_assertion();
--> statement-breakpoint
CREATE TRIGGER memory_text_evidence_immutable BEFORE UPDATE ON public.text_evidence
FOR EACH ROW EXECUTE FUNCTION public.memory_immutable_assertion();

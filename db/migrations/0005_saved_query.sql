CREATE TABLE "saved_query" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"routed_json" jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_result_person_ids" uuid[]
);

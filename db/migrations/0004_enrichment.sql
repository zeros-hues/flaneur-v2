ALTER TABLE "person" ALTER COLUMN "about_embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "person" ALTER COLUMN "profile_embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "artifact" ALTER COLUMN "item_embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "concept" ALTER COLUMN "embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "synthesis" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "enrichment_prompt_version" text;--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "enrichment_prompt_version" text;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "enrichment_prompt_version" text;--> statement-breakpoint
ALTER TABLE "concept" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "concept" ADD COLUMN "enrichment_prompt_version" text;
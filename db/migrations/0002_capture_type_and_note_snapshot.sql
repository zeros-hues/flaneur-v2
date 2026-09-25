CREATE TYPE "public"."capture_type" AS ENUM('profile', 'post');--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "snapshot" ADD COLUMN "capture_type" "capture_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_snapshot_id_idx" ON "note" USING btree ("snapshot_id");